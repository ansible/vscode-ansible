import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { PythonEnvironmentService } from "../../../src/services/PythonEnvironmentService";
import { PYTHON_ENVS_EXTENSION_ID } from "../../../src/types/pythonEnvApi";

describe("PythonEnvironmentService", function () {
  let service: PythonEnvironmentService;
  let mockGetExtension: ReturnType<typeof vi.fn>;
  let mockGetConfiguration: ReturnType<typeof vi.fn>;
  let mockShowWarningMessage: ReturnType<typeof vi.fn>;
  let mockShowInformationMessage: ReturnType<typeof vi.fn>;
  let mockExecuteCommand: ReturnType<typeof vi.fn>;

  // Helper to reset singleton for testing
  const resetSingleton = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PythonEnvironmentService as any)._instance = undefined;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();

    mockGetExtension = vi.mocked(vscode.extensions.getExtension);
    mockGetConfiguration = vi.mocked(vscode.workspace.getConfiguration);
    mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage);
    mockShowInformationMessage = vi.mocked(
      vscode.window.showInformationMessage,
    );
    mockExecuteCommand = vi.mocked(vscode.commands.executeCommand);

    service = PythonEnvironmentService.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service.dispose();
    resetSingleton();
  });

  describe("getInstance", function () {
    it("should return singleton instance", function () {
      const instance1 = PythonEnvironmentService.getInstance();
      const instance2 = PythonEnvironmentService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", function () {
      const instance1 = PythonEnvironmentService.getInstance();
      resetSingleton();
      const instance2 = PythonEnvironmentService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("initialize", function () {
    it("should return false when extension is not installed", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const result = await service.initialize();

      expect(result).toBe(false);
      expect(mockGetExtension).toHaveBeenCalledWith(PYTHON_ENVS_EXTENSION_ID);
    });

    it("should return true when extension is installed and exports API", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
        getEnvironments: vi.fn(),
        createTerminal: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      const result = await service.initialize();

      expect(result).toBe(true);
      expect(service.isAvailable()).toBe(true);
    });

    it("should activate extension if not active", async function () {
      const mockActivate = vi.fn();
      const mockApi = {
        getEnvironment: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: false,
        exports: mockApi,
        activate: mockActivate,
      });

      await service.initialize();

      expect(mockActivate).toHaveBeenCalled();
    });

    it("should return false and prompt for setting when API not exported", async function () {
      const mockConfig = {
        get: vi.fn().mockReturnValue(false),
        update: vi.fn(),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);
      mockShowWarningMessage.mockResolvedValue(undefined);

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: undefined,
        activate: vi.fn(),
      });

      const result = await service.initialize();

      expect(result).toBe(false);
      expect(mockShowWarningMessage).toHaveBeenCalled();
    });

    it("should not reinitialize if already initialized", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

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

      const result = await service.initialize();

      expect(result).toBe(false);
    });

    it("should subscribe to environment change events when available", async function () {
      const mockOnDidChangeEnvironment = vi.fn().mockReturnValue({
        dispose: vi.fn(),
      });

      const mockApi = {
        getEnvironment: vi.fn(),
        onDidChangeEnvironment: mockOnDidChangeEnvironment,
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();

      expect(mockOnDidChangeEnvironment).toHaveBeenCalled();
    });
  });

  describe("isAvailable", function () {
    it("should return false before initialization", function () {
      expect(service.isAvailable()).toBe(false);
    });

    it("should return true after successful initialization", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
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

  describe("getEnvironment", function () {
    it("should return undefined when API not available", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const result = await service.getEnvironment();

      expect(result).toBeUndefined();
    });

    it("should call API getEnvironment with scope", async function () {
      const mockEnv = {
        envId: { id: "test", managerId: "test" },
        name: "Python 3.11",
        displayName: "Python 3.11.0",
        version: "3.11.0",
        execInfo: { run: { executable: "/usr/bin/python3" } },
      };

      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();
      const result = await service.getEnvironment();

      expect(result).toEqual(mockEnv);
      expect(mockApi.getEnvironment).toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async function () {
      const mockApi = {
        getEnvironment: vi.fn().mockRejectedValue(new Error("API error")),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();
      const result = await service.getEnvironment();

      expect(result).toBeUndefined();
    });
  });

  describe("getEnvironments", function () {
    it("should return empty array when API not available", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const result = await service.getEnvironments();

      expect(result).toEqual([]);
    });

    it("should call API getEnvironments with scope", async function () {
      const mockEnvs = [
        { envId: { id: "1" }, name: "Python 3.11" },
        { envId: { id: "2" }, name: "Python 3.12" },
      ];

      const mockApi = {
        getEnvironment: vi.fn(),
        getEnvironments: vi.fn().mockResolvedValue(mockEnvs),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();
      const result = await service.getEnvironments("all");

      expect(result).toEqual(mockEnvs);
      expect(mockApi.getEnvironments).toHaveBeenCalledWith("all");
    });

    it("should handle API errors gracefully", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
        getEnvironments: vi.fn().mockRejectedValue(new Error("API error")),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();
      const result = await service.getEnvironments();

      expect(result).toEqual([]);
    });
  });

  describe("getExecutablePath", function () {
    it("should return undefined when no environment", async function () {
      mockGetExtension.mockReturnValue(undefined);

      const result = await service.getExecutablePath();

      expect(result).toBeUndefined();
    });

    it("should return executable path from environment", async function () {
      const mockEnv = {
        envId: { id: "test", managerId: "test" },
        execInfo: { run: { executable: "/usr/bin/python3.11" } },
      };

      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();
      const result = await service.getExecutablePath();

      expect(result).toBe("/usr/bin/python3.11");
    });
  });

  describe("getVersion", function () {
    it("should return version from environment", async function () {
      const mockEnv = {
        envId: { id: "test", managerId: "test" },
        version: "3.11.5",
        execInfo: { run: { executable: "/usr/bin/python3" } },
      };

      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();
      const result = await service.getVersion();

      expect(result).toBe("3.11.5");
    });
  });

  describe("getDisplayName", function () {
    it("should return display name from environment", async function () {
      const mockEnv = {
        envId: { id: "test", managerId: "test" },
        displayName: "Python 3.11.5 (venv)",
        execInfo: { run: { executable: "/usr/bin/python3" } },
      };

      const mockApi = {
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();
      const result = await service.getDisplayName();

      expect(result).toBe("Python 3.11.5 (venv)");
    });
  });

  describe("getApi", function () {
    it("should return undefined when not initialized", function () {
      expect(service.getApi()).toBeUndefined();
    });

    it("should return API after initialization", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();

      expect(service.getApi()).toBe(mockApi);
    });
  });

  describe("showExtensionNotInstalledWarning", function () {
    it("should show warning message", function () {
      mockShowWarningMessage.mockResolvedValue(undefined);

      service.showExtensionNotInstalledWarning();

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining(
          "Python Environments extension is not installed",
        ),
        "Install Extension",
      );
    });

    it("should execute install command when Install Extension selected", async function () {
      mockShowWarningMessage.mockResolvedValue("Install Extension");

      service.showExtensionNotInstalledWarning();

      // Wait for the promise chain to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "workbench.extensions.installExtension",
        PYTHON_ENVS_EXTENSION_ID,
      );
    });
  });

  describe("selectEnvironment", function () {
    it("should show warning when API not available and extension not installed", async function () {
      mockGetExtension.mockReturnValue(undefined);
      mockShowWarningMessage.mockResolvedValue(undefined);

      await service.selectEnvironment();

      expect(mockShowWarningMessage).toHaveBeenCalled();
    });

    it("should prompt for setting when extension installed but API not available", async function () {
      const mockConfig = {
        get: vi.fn().mockReturnValue(false),
        update: vi.fn(),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);
      mockShowWarningMessage.mockResolvedValue(undefined);

      // First call returns extension without API
      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: undefined,
        activate: vi.fn(),
      });

      await service.initialize();
      await service.selectEnvironment();

      expect(mockShowWarningMessage).toHaveBeenCalled();
    });

    it("should execute python-envs.set command when API available", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      mockExecuteCommand.mockResolvedValue(undefined);

      await service.initialize();
      await service.selectEnvironment();

      expect(mockExecuteCommand).toHaveBeenCalledWith("python-envs.set");
    });

    it("should fallback to python.setInterpreter when python-envs.set fails", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      mockExecuteCommand
        .mockRejectedValueOnce(new Error("Command not found"))
        .mockResolvedValueOnce(undefined);

      await service.initialize();
      await service.selectEnvironment();

      expect(mockExecuteCommand).toHaveBeenCalledWith("python.setInterpreter");
    });

    it("should show error when both commands fail", async function () {
      const mockApi = {
        getEnvironment: vi.fn(),
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      const mockShowErrorMessage = vi.mocked(vscode.window.showErrorMessage);
      mockExecuteCommand
        .mockRejectedValueOnce(new Error("Command not found"))
        .mockRejectedValueOnce(new Error("Command not found"));

      await service.initialize();
      await service.selectEnvironment();

      expect(mockShowErrorMessage).toHaveBeenCalled();
    });
  });

  describe("dispose", function () {
    it("should dispose all subscriptions", async function () {
      const mockDispose = vi.fn();
      const mockOnDidChangeEnvironment = vi.fn().mockReturnValue({
        dispose: mockDispose,
      });

      const mockApi = {
        getEnvironment: vi.fn(),
        onDidChangeEnvironment: mockOnDidChangeEnvironment,
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();
      service.dispose();

      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe("onDidChangeEnvironment event", function () {
    it("should subscribe to API environment change events", async function () {
      const mockOnDidChangeEnvironment = vi.fn().mockReturnValue({
        dispose: vi.fn(),
      });

      const mockApi = {
        getEnvironment: vi.fn(),
        onDidChangeEnvironment: mockOnDidChangeEnvironment,
      };

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: mockApi,
        activate: vi.fn(),
      });

      await service.initialize();

      // Verify that the service subscribed to the API's event
      expect(mockOnDidChangeEnvironment).toHaveBeenCalled();
    });

    it("should expose onDidChangeEnvironment event", function () {
      // Verify the event is exposed as a function (for subscribing)
      expect(typeof service.onDidChangeEnvironment).toBe("function");
    });
  });

  describe("_checkAndPromptForSetting", function () {
    it("should enable setting when user selects Enable Setting", async function () {
      const mockConfig = {
        get: vi.fn().mockReturnValue(false),
        update: vi.fn().mockResolvedValue(undefined),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);
      mockShowWarningMessage.mockResolvedValue("Enable Setting");
      mockShowInformationMessage.mockResolvedValue(undefined);

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: undefined,
        activate: vi.fn(),
      });

      await service.initialize();

      expect(mockConfig.update).toHaveBeenCalledWith(
        "useEnvironmentsExtension",
        true,
        2, // ConfigurationTarget.Global (in test mock)
      );
    });

    it("should reload window when user selects Reload Now", async function () {
      const mockConfig = {
        get: vi.fn().mockReturnValue(false),
        update: vi.fn().mockResolvedValue(undefined),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);
      mockShowWarningMessage.mockResolvedValue("Enable Setting");
      mockShowInformationMessage.mockResolvedValue("Reload Now");
      mockExecuteCommand.mockResolvedValue(undefined);

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: undefined,
        activate: vi.fn(),
      });

      await service.initialize();

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "workbench.action.reloadWindow",
      );
    });

    it("should open marketplace when user selects Learn More", async function () {
      const mockConfig = {
        get: vi.fn().mockReturnValue(false),
        update: vi.fn(),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);
      mockShowWarningMessage.mockResolvedValue("Learn More");

      const mockOpenExternal = vi.mocked(vscode.env.openExternal);

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: undefined,
        activate: vi.fn(),
      });

      await service.initialize();

      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it("should not prompt when setting is already enabled", async function () {
      const mockConfig = {
        get: vi.fn().mockReturnValue(true),
        update: vi.fn(),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);

      mockGetExtension.mockReturnValue({
        isActive: true,
        exports: undefined,
        activate: vi.fn(),
      });

      await service.initialize();

      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });
  });
});
