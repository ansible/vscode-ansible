import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as vscode from "vscode";
import { TerminalService } from "@src/services/TerminalService";
import { PythonEnvironmentService } from "@src/services/PythonEnvironmentService";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

describe("TerminalService", function () {
  let service: TerminalService;
  let mockGetExtension: ReturnType<typeof vi.fn>;
  let mockCreateTerminal: ReturnType<typeof vi.fn>;
  let mockExistsSync: ReturnType<typeof vi.fn>;

  const resetSingletons = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (TerminalService as any)._instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PythonEnvironmentService as any)._instance = undefined;
  };

  const createMockTerminal = (name: string = "Test Terminal") => ({
    name,
    processId: Promise.resolve(12345),
    show: vi.fn(),
    sendText: vi.fn(),
    dispose: vi.fn(),
  });

  /**
   * Set up PythonEnvironmentService in "PET available" mode so
   * TerminalService can use the full Environments API.
   */
  const setupWithEnvsApi = (apiOverrides = {}) => {
    const mockApi = {
      getEnvironment: vi.fn(),
      getEnvironments: vi.fn(),
      createTerminal: vi.fn(),
      onDidChangeEnvironment: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      ...apiOverrides,
    };

    mockGetExtension.mockReturnValue({
      isActive: true,
      extensionPath: "/ext/path",
      exports: mockApi,
      activate: vi.fn(),
    });
    mockExistsSync.mockReturnValue(true);

    return mockApi;
  };

  /**
   * Set up PythonEnvironmentService with no API available.
   */
  const setupWithNoApi = () => {
    mockGetExtension.mockReturnValue(undefined);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetSingletons();

    mockGetExtension = vi.mocked(vscode.extensions.getExtension);
    mockCreateTerminal = vi.mocked(vscode.window.createTerminal);
    mockExistsSync = vi.mocked(fs.existsSync);

    mockCreateTerminal.mockReturnValue(createMockTerminal());

    service = TerminalService.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service.dispose();
    resetSingletons();
  });

  describe("getInstance", function () {
    it("should return singleton instance", function () {
      const instance1 = TerminalService.getInstance();
      const instance2 = TerminalService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", function () {
      const instance1 = TerminalService.getInstance();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (TerminalService as any)._instance = undefined;
      const instance2 = TerminalService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("createActivatedTerminal", function () {
    it("should create terminal without Python API when not available", async function () {
      setupWithNoApi();

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      expect(mockCreateTerminal).toHaveBeenCalled();
      expect(managed.terminal).toBeDefined();
    });

    it("should show terminal by default", async function () {
      setupWithNoApi();

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      expect(mockTerminal.show).toHaveBeenCalled();
    });

    it("should not show terminal when show is false", async function () {
      setupWithNoApi();

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      await service.createActivatedTerminal({
        name: "Test Terminal",
        show: false,
      });

      expect(mockTerminal.show).not.toHaveBeenCalled();
    });

    it("should reuse existing terminal when reuseExisting is true", async function () {
      setupWithNoApi();

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
      setupWithNoApi();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).terminals = [];

      await service.createActivatedTerminal({
        name: "New Terminal",
        reuseExisting: true,
      });

      expect(mockCreateTerminal).toHaveBeenCalled();
    });

    it("should use Environments API createTerminal when PET is available", async function () {
      const mockEnv = {
        envId: { id: "test" },
        displayName: "Python 3.11",
        execInfo: { run: { executable: "/usr/bin/python3" } },
      };

      const mockPythonTerminal = createMockTerminal("Python Terminal");
      const mockApi = setupWithEnvsApi({
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
        createTerminal: vi.fn().mockResolvedValue(mockPythonTerminal),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ];

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
      });

      expect(mockApi.createTerminal).toHaveBeenCalledWith(
        mockEnv,
        expect.any(Object),
      );
      expect(managed.terminal).toBe(mockPythonTerminal);
    });

    it("should fall back to regular terminal when API createTerminal fails", async function () {
      const mockEnv = {
        envId: { id: "test" },
        displayName: "Python 3.11",
      };

      setupWithEnvsApi({
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
        createTerminal: vi
          .fn()
          .mockRejectedValue(new Error("Failed to create")),
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
      const mockApi = setupWithEnvsApi({
        getEnvironment: vi.fn().mockResolvedValue(undefined),
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
      setupWithNoApi();

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
      setupWithNoApi();

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
      setupWithNoApi();

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
      setupWithNoApi();

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
      setupWithNoApi();

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
      setupWithNoApi();

      const mockTerminal = createMockTerminal();
      mockCreateTerminal.mockReturnValue(mockTerminal);

      const terminal = await service.runInTerminal("Run Terminal", "ls -la");

      expect(mockCreateTerminal).toHaveBeenCalled();
      expect(mockTerminal.sendText).toHaveBeenCalledWith("ls -la");
      expect(terminal).toBe(mockTerminal);
    });

    it("should pass options to createActivatedTerminal", async function () {
      setupWithNoApi();

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
      setupWithNoApi();

      const existingTerminal = createMockTerminal("Reusable Terminal");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).terminals = [existingTerminal];

      const managed = await service.getOrCreateTerminal("Reusable Terminal");

      expect(managed.terminal).toBe(existingTerminal);
      expect(mockCreateTerminal).not.toHaveBeenCalled();
    });

    it("should create new terminal when not found", async function () {
      setupWithNoApi();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).terminals = [];

      await service.getOrCreateTerminal("New Terminal");

      expect(mockCreateTerminal).toHaveBeenCalled();
    });
  });

  describe("dispose", function () {
    it("should dispose all subscriptions", function () {
      service.dispose();
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
      setupWithEnvsApi({
        getEnvironment: vi.fn().mockResolvedValue({
          envId: { id: "test" },
          displayName: "Python 3.11",
        }),
        createTerminal: vi.fn().mockResolvedValue(mockPythonTerminal),
        onDidChangeTerminalActivationState:
          mockOnDidChangeTerminalActivationState,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ];

      const terminalPromise = service.createActivatedTerminal({
        name: "Test Terminal",
        activationTimeout: 100,
      });

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
      setupWithEnvsApi({
        getEnvironment: vi.fn().mockResolvedValue({
          envId: { id: "test" },
          displayName: "Python 3.11",
        }),
        createTerminal: vi.fn().mockResolvedValue(mockPythonTerminal),
        onDidChangeTerminalActivationState:
          mockOnDidChangeTerminalActivationState,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: "/workspace" } },
      ];

      const managed = await service.createActivatedTerminal({
        name: "Test Terminal",
        activationTimeout: 50,
      });

      expect(managed.terminal).toBe(mockPythonTerminal);
    }, 10000);
  });
});
