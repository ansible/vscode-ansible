import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { TerminalService } from "../../../src/services/TerminalService";

describe("TerminalService", function () {
  let service: TerminalService;
  let mockGetExtension: ReturnType<typeof vi.fn>;
  let mockCreateTerminal: ReturnType<typeof vi.fn>;

  // Helper to reset singleton for testing
  const resetSingleton = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (TerminalService as any)._instance = undefined;
  };

  // Create a mock terminal
  const createMockTerminal = (name: string = "Test Terminal") => ({
    name,
    processId: Promise.resolve(12345),
    show: vi.fn(),
    sendText: vi.fn(),
    dispose: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();

    mockGetExtension = vi.mocked(vscode.extensions.getExtension);
    mockCreateTerminal = vi.mocked(vscode.window.createTerminal);

    // Default mock for createTerminal
    mockCreateTerminal.mockReturnValue(createMockTerminal());

    service = TerminalService.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service.dispose();
    resetSingleton();
  });

  describe("getInstance", function () {
    it("should return singleton instance", function () {
      const instance1 = TerminalService.getInstance();
      const instance2 = TerminalService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", function () {
      const instance1 = TerminalService.getInstance();
      resetSingleton();
      const instance2 = TerminalService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("initialize", function () {
    it("should complete without error when extension is not installed", async function () {
      mockGetExtension.mockReturnValue(undefined);

      await service.initialize();

      expect(service.isAvailable()).toBe(false);
    });

    it("should initialize with Python API when available", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
        createTerminal: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();

      expect(service.isAvailable()).toBe(true);
    });

    it("should activate extension if not active", async function () {
      const mockActivate = vi.fn();
      const mockApi = {
        createTerminal: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: false,
        exports: mockApi,
        activate: mockActivate,
      });

      await service.initialize();

      expect(mockActivate).toHaveBeenCalled();
    });

    it("should not reinitialize if already initialized", async function () {
      mockGetExtension.mockReturnValue(undefined);

      await service.initialize();
      await service.initialize();

      expect(mockGetExtension).toHaveBeenCalledTimes(1);
    });

    it("should handle activation errors gracefully", async function () {
      mockGetExtension.mockReturnValue({
        isActive: false,
        exports: undefined,
        activate: vi.fn().mockRejectedValue(new Error("Activation failed")),
      });

      await service.initialize();

      expect(service.isAvailable()).toBe(false);
    });

    it("should set unavailable when API does not export createTerminal", async function () {
      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: { getEnvironment: vi.fn() }, // No createTerminal
        activate: vi.fn(),
      });

      await service.initialize();

      expect(service.isAvailable()).toBe(false);
    });
  });

  describe("isAvailable", function () {
    it("should return false before initialization", function () {
      expect(service.isAvailable()).toBe(false);
    });

    it("should return true after successful initialization with API", async function () {
      const mockApi = {
        createTerminal: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();

      expect(service.isAvailable()).toBe(true);
    });
  });

  describe("createActivatedTerminal", function () {
    it("should create terminal without Python API when not available", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      expect(mockCreateTerminal).toHaveBeenCalled();
      expect(managed.terminal).toBeDefined();
    });

    it("should show terminal by default", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      expect(mockTerminal.show).toHaveBeenCalled();
    });

    it("should not show terminal when show is false", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      await service.createActivatedTerminal({
        name: "Test Terminal",
        show: false,
      });

      expect(mockTerminal.show).not.toHaveBeenCalled();
    });

    it("should reuse existing terminal when reuseExisting is true", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const existingTerminal = createMockTerminal("Existing Terminal");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).terminals = [existingTerminal];

      const managed = await service.createActivatedTerminal({
        name: "Existing Terminal",
        reuseExisting: true,
      });

      expect(managed.terminal).toBe(existingTerminal);
      expect(mockCreateTerminal).not.toHaveBeenCalled();
    });

    it("should create new terminal when no matching terminal exists", async function () {
      mockGetExtension.mockReturnValue(undefined);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).terminals = [];

      await service.createActivatedTerminal({
        name: "New Terminal",
        reuseExisting: true,
      });

      expect(mockCreateTerminal).toHaveBeenCalled();
    });

    it("should use Python API createTerminal when available", async function () {
      const mockEnv = {
        envId: { id: "test" },
        displayName: "Python 3.11",
        execInfo: { run: { executable: "/usr/bin/python3" } },
      };

      const mockPythonTerminal = createMockTerminal("Python Terminal");
      const mockApiCreateTerminal = vi
        .fn()
        .mockResolvedValue(mockPythonTerminal);

      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
        createTerminal: mockApiCreateTerminal,
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      // Mock workspace folders
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ];

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      expect(mockApiCreateTerminal).toHaveBeenCalledWith(
        mockEnv,
        expect.any(Object),
      );
      expect(managed.terminal).toBe(mockPythonTerminal);
    });

    it("should fallback to regular terminal when Python API createTerminal fails", async function () {
      const mockEnv = {
        envId: { id: "test" },
        displayName: "Python 3.11",
      };

      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
        createTerminal: vi
          .fn()
          .mockRejectedValue(new Error("Failed to create")),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ];

      await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      expect(mockCreateTerminal).toHaveBeenCalled();
    });

    it("should create regular terminal when no environment is found", async function () {
      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue(undefined),
        createTerminal: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ];

      await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      expect(mockCreateTerminal).toHaveBeenCalled();
      expect(mockApi.createTerminal).not.toHaveBeenCalled();
    });

    it("should pass cwd option to terminal", async function () {
      mockGetExtension.mockReturnValue(undefined);

      // Clear workspace folders to test explicit cwd
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = undefined;

      const cwd = vscode.Uri.file("/custom/path");
      await service.createActivatedTerminal({
        name: "Test Terminal",
        cwd,
      });

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd,
        }),
      );
    });

    it("should pass env option to terminal", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const env = { MY_VAR: "value" } as unknown as NodeJS.ProcessEnv;
      await service.createActivatedTerminal({
        name: "Test Terminal",
        env,
      });

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          env,
        }),
      );
    });
  });

  describe("ManagedTerminal.sendCommand", function () {
    it("should send command without waiting when waitForCompletion is false", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      const result = await managed.sendCommand("echo hello", {
        waitForCompletion: false,
      });

      expect(mockTerminal.sendText).toHaveBeenCalledWith("echo hello");
      expect(result.success).toBe(true);
    });

    it("should send command and return result", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      const result = await managed.sendCommand("echo hello");

      expect(mockTerminal.sendText).toHaveBeenCalledWith("echo hello");
      expect(result).toBeDefined();
    });
  });

  describe("ManagedTerminal.dispose", function () {
    it("should dispose the terminal", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      managed.dispose();

      expect(mockTerminal.dispose).toHaveBeenCalled();
    });
  });

  describe("runInTerminal", function () {
    it("should create terminal and run command", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      const terminal = await service.runInTerminal("Run Terminal", "ls -la");

      expect(mockCreateTerminal).toHaveBeenCalled();
      expect(mockTerminal.sendText).toHaveBeenCalledWith("ls -la");
      expect(terminal).toBe(mockTerminal);
    });

    it("should pass options to createActivatedTerminal", async function () {
      mockGetExtension.mockReturnValue(undefined);

      // Clear workspace folders to test explicit cwd
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = undefined;

      const cwd = vscode.Uri.file("/custom/path");
      await service.runInTerminal("Run Terminal", "ls -la", {
        show: false,
        cwd,
      });

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd,
        }),
      );
    });
  });

  describe("getOrCreateTerminal", function () {
    it("should reuse existing terminal with same name", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const existingTerminal = createMockTerminal("Reusable Terminal");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).terminals = [existingTerminal];

      const managed = await service.getOrCreateTerminal("Reusable Terminal");

      expect(managed.terminal).toBe(existingTerminal);
      expect(mockCreateTerminal).not.toHaveBeenCalled();
    });

    it("should create new terminal when not found", async function () {
      mockGetExtension.mockReturnValue(undefined);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).terminals = [];

      await service.getOrCreateTerminal("New Terminal");

      expect(mockCreateTerminal).toHaveBeenCalled();
    });
  });

  describe("dispose", function () {
    it("should dispose all subscriptions", function () {
      service.dispose();
      // Should not throw
      expect(() => service.dispose()).not.toThrow();
    });
  });

  describe("_waitForActivation", function () {
    it("should wait for activation event when available", async function () {
      let capturedCallback: ((event: unknown) => void) | undefined;
      const mockOnDidChangeTerminalActivationState = vi
        .fn()
        .mockImplementation((callback) => {
          capturedCallback = callback;
          return { dispose: vi.fn() };
        });

      const mockPythonTerminal = createMockTerminal("Python Terminal");
      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue({
          envId: { id: "test" },
          displayName: "Python 3.11",
        }),
        createTerminal: vi.fn().mockResolvedValue(mockPythonTerminal),
        onDidChangeTerminalActivationState:
          mockOnDidChangeTerminalActivationState,
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ];

      const terminalPromise = service.createActivatedTerminal({
        name: "Test Terminal",
        activationTimeout: 100,
      });

      // Simulate activation event after a short delay
      setTimeout(() => {
        capturedCallback?.({
          terminal: mockPythonTerminal,
          activated: true,
        });
      }, 10);

      const managed = await terminalPromise;
      expect(managed.terminal).toBe(mockPythonTerminal);
    });

    it("should timeout if activation event not received", async function () {
      const mockOnDidChangeTerminalActivationState = vi
        .fn()
        .mockImplementation(() => {
          return { dispose: vi.fn() };
        });

      const mockPythonTerminal = createMockTerminal("Python Terminal");
      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue({
          envId: { id: "test" },
          displayName: "Python 3.11",
        }),
        createTerminal: vi.fn().mockResolvedValue(mockPythonTerminal),
        onDidChangeTerminalActivationState:
          mockOnDidChangeTerminalActivationState,
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ];

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
        activationTimeout: 50,
      });

      // Should still return terminal even after timeout
      expect(managed.terminal).toBe(mockPythonTerminal);
    }, 10000);
  });
});
