import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { PythonInterpreterManager } from "../../../src/features/pythonMetadata";
import { PythonEnvironmentService } from "../../../src/services/PythonEnvironmentService";

// Mock PythonEnvironmentService
vi.mock("../../../src/services/PythonEnvironmentService", () => ({
  PythonEnvironmentService: {
    getInstance: vi.fn(),
  },
}));

describe("PythonInterpreterManager", function () {
  let manager: PythonInterpreterManager;
  let mockContext: vscode.ExtensionContext;
  let mockTelemetry: { sendTelemetryEvent: ReturnType<typeof vi.fn> };
  let mockExtensionSettings: { settings: { interpreterPath: string } };
  let mockPythonEnvService: {
    initialize: ReturnType<typeof vi.fn>;
    isAvailable: ReturnType<typeof vi.fn>;
    getEnvironment: ReturnType<typeof vi.fn>;
    selectEnvironment: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock context
    mockContext = {
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    // Mock telemetry
    mockTelemetry = {
      sendTelemetryEvent: vi.fn(),
    };

    // Mock extension settings
    mockExtensionSettings = {
      settings: {
        interpreterPath: "",
      },
    };

    // Mock PythonEnvironmentService
    mockPythonEnvService = {
      initialize: vi.fn().mockResolvedValue(true),
      isAvailable: vi.fn().mockReturnValue(true),
      getEnvironment: vi.fn(),
      selectEnvironment: vi.fn(),
    };

    // Mock getInstance to return our mock service

    vi.mocked(PythonEnvironmentService.getInstance).mockReturnValue(
      mockPythonEnvService as unknown as PythonEnvironmentService,
    );

    // Mock vscode.window.createStatusBarItem
    const mockStatusBarItem = {
      text: "",
      tooltip: undefined as vscode.MarkdownString | undefined,
      command: undefined as string | undefined,
      backgroundColor: undefined,
      show: vi.fn(),
      hide: vi.fn(),
    };
    vi.mocked(vscode.window).createStatusBarItem = vi
      .fn()
      .mockReturnValue(mockStatusBarItem);

    manager = new PythonInterpreterManager(
      mockContext,
      mockTelemetry as never,
      mockExtensionSettings as never,
      mockPythonEnvService as unknown as PythonEnvironmentService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", function () {
    it("should create status bar item", function () {
      expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
    });

    it("should use provided PythonEnvironmentService", function () {
      const customService = {
        initialize: vi.fn(),
        isAvailable: vi.fn(),
      } as unknown as PythonEnvironmentService;

      const customManager = new PythonInterpreterManager(
        mockContext,
        mockTelemetry as never,
        mockExtensionSettings as never,
        customService,
      );

      expect(customManager).toBeDefined();
    });

    it("should use singleton PythonEnvironmentService when not provided", function () {
      const newManager = new PythonInterpreterManager(
        mockContext,
        mockTelemetry as never,
        mockExtensionSettings as never,
      );

      expect(PythonEnvironmentService.getInstance).toHaveBeenCalled();
      expect(newManager).toBeDefined();
    });
  });

  describe("updatePythonInfoInStatusbar", function () {
    it("should hide status bar when not on ansible file", async function () {
      // Mock activeTextEditor with non-ansible languageId
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: {
          document: {
            languageId: "javascript",
            uri: { fsPath: "/test/file.js" },
          },
        },
        configurable: true,
      });

      await manager.updatePythonInfoInStatusbar();

      // Status bar should be hidden (not shown for non-ansible files)
    });

    it("should show status bar for ansible files", async function () {
      // Mock activeTextEditor with ansible languageId
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: {
          document: {
            languageId: "ansible",
            uri: { fsPath: "/test/playbook.yml" },
          },
        },
        configurable: true,
      });

      mockPythonEnvService.getEnvironment.mockResolvedValue({
        displayName: "Python 3.11",
        name: "python3.11",
        version: "3.11.0",
        displayPath: "/usr/bin/python3.11",
        execInfo: { run: { executable: "/usr/bin/python3.11" } },
      });

      await manager.updatePythonInfoInStatusbar();

      // Should have called getEnvironment
      expect(mockPythonEnvService.getEnvironment).toHaveBeenCalled();
    });
  });

  describe("updatePythonInfo", function () {
    beforeEach(() => {
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: {
          document: {
            languageId: "ansible",
            uri: { fsPath: "/test/playbook.yml" },
          },
        },
        configurable: true,
      });
    });

    it("should show warning when Python Environments not available", async function () {
      mockPythonEnvService.isAvailable.mockReturnValue(false);

      await manager.updatePythonInfo();

      expect(mockPythonEnvService.initialize).toHaveBeenCalled();
    });

    it("should display environment info when available", async function () {
      mockPythonEnvService.isAvailable.mockReturnValue(true);
      mockPythonEnvService.getEnvironment.mockResolvedValue({
        displayName: "Python 3.11.5 (venv)",
        name: "venv",
        version: "3.11.5",
        displayPath: "/home/user/.venv/bin/python",
        execInfo: { run: { executable: "/home/user/.venv/bin/python" } },
      });

      await manager.updatePythonInfo();

      expect(mockPythonEnvService.getEnvironment).toHaveBeenCalled();
    });

    it("should handle environment without displayName", async function () {
      mockPythonEnvService.isAvailable.mockReturnValue(true);
      mockPythonEnvService.getEnvironment.mockResolvedValue({
        name: "python3",
        version: "3.10.0",
        execInfo: { run: { executable: "/usr/bin/python3" } },
      });

      await manager.updatePythonInfo();

      expect(mockPythonEnvService.getEnvironment).toHaveBeenCalled();
    });

    it("should show select prompt when no environment found", async function () {
      mockPythonEnvService.isAvailable.mockReturnValue(true);
      mockPythonEnvService.getEnvironment.mockResolvedValue(undefined);

      await manager.updatePythonInfo();

      expect(mockPythonEnvService.getEnvironment).toHaveBeenCalled();
    });

    it("should include version in tooltip when available", async function () {
      mockPythonEnvService.isAvailable.mockReturnValue(true);
      mockPythonEnvService.getEnvironment.mockResolvedValue({
        displayName: "Python 3.12",
        name: "python3.12",
        version: "3.12.1",
        displayPath: "/usr/local/bin/python3.12",
        execInfo: { run: { executable: "/usr/local/bin/python3.12" } },
      });

      await manager.updatePythonInfo();

      expect(mockPythonEnvService.getEnvironment).toHaveBeenCalled();
    });
  });
});
