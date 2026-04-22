import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as vscode from "vscode";
import { PythonEnvironmentService } from "@src/services/PythonEnvironmentService";
import { PythonExtension } from "@vscode/python-extension";
import { PYTHON_ENVS_EXTENSION_ID } from "@src/types/pythonEnvApi";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

describe("PythonEnvironmentService", function () {
  let service: PythonEnvironmentService;
  let mockGetExtension: ReturnType<typeof vi.fn>;
  let mockGetConfiguration: ReturnType<typeof vi.fn>;
  let mockShowWarningMessage: ReturnType<typeof vi.fn>;
  let mockShowInformationMessage: ReturnType<typeof vi.fn>;
  let mockExecuteCommand: ReturnType<typeof vi.fn>;
  let mockExistsSync: ReturnType<typeof vi.fn>;
  let mockPythonExtApi: ReturnType<typeof vi.fn>;

  const resetSingleton = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PythonEnvironmentService as any)._instance = undefined;
  };

  const makeMockEnvsApi = (overrides = {}) => ({
    getEnvironment: vi.fn(),
    getEnvironments: vi.fn(),
    createTerminal: vi.fn(),
    onDidChangeEnvironment: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    ...overrides,
  });

  const makeMockPythonExtApi = (overrides = {}) => ({
    ready: Promise.resolve(),
    environments: {
      getActiveEnvironmentPath: vi.fn().mockReturnValue({
        id: "fallback-env",
        path: "/usr/bin/python3",
      }),
      resolveEnvironment: vi.fn().mockResolvedValue({
        id: "fallback-env",
        path: "/usr/bin/python3",
        executable: {
          uri: { fsPath: "/usr/bin/python3" },
          bitness: "64-bit",
          sysPrefix: "/usr",
        },
        environment: {
          type: "VirtualEnvironment",
          name: "myenv",
          folderUri: { fsPath: "/home/user/myenv" },
          workspaceFolder: undefined,
        },
        version: {
          major: 3,
          minor: 11,
          micro: 5,
          release: { level: "final", serial: 0 },
          sysVersion: "3.11.5",
        },
        tools: ["Venv"],
      }),
      onDidChangeActiveEnvironmentPath: vi
        .fn()
        .mockReturnValue({ dispose: vi.fn() }),
      known: [],
      refreshEnvironments: vi.fn(),
      ...overrides,
    },
  });

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
    mockExistsSync = vi.mocked(fs.existsSync);
    mockPythonExtApi = vi.mocked(PythonExtension.api);

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

  describe("initialize — primary path (PET available)", function () {
    it("should use Environments API when PET binary exists", async function () {
      const mockApi = makeMockEnvsApi();
      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      const result = await service.initialize();

      expect(result).toBe(true);
      expect(service.isAvailable()).toBe(true);
      expect(service.hasFullApi()).toBe(true);
      expect(service.getApi()).toBe(mockApi);
    });

    it("should activate extension if not active", async function () {
      const mockActivate = vi.fn();
      const mockApi = makeMockEnvsApi();

      mockGetExtension.mockReturnValue({
        isActive: false,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: mockActivate,
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();

      expect(mockActivate).toHaveBeenCalled();
    });

    it("should subscribe to environment change events", async function () {
      const mockOnDidChange = vi.fn().mockReturnValue({ dispose: vi.fn() });
      const mockApi = makeMockEnvsApi({
        onDidChangeEnvironment: mockOnDidChange,
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();

      expect(mockOnDidChange).toHaveBeenCalled();
    });

    it("should not reinitialize if already initialized", async function () {
      const mockApi = makeMockEnvsApi();
      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();
      await service.initialize();

      expect(mockGetExtension).toHaveBeenCalledTimes(1);
    });
  });

  describe("initialize — PET missing fallback", function () {
    it("should fall back to Python extension when PET is missing", async function () {
      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue(undefined);

      const fallbackApi = makeMockPythonExtApi();
      mockPythonExtApi.mockResolvedValue(fallbackApi);

      const result = await service.initialize();

      expect(result).toBe(true);
      expect(service.isAvailable()).toBe(true);
      expect(service.hasFullApi()).toBe(false);
      expect(service.getApi()).toBeUndefined();
    });

    it("should show PET warning notification once", async function () {
      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue(undefined);
      mockPythonExtApi.mockResolvedValue(makeMockPythonExtApi());

      await service.initialize();

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("PET binary missing"),
        "Learn More",
      );
    });

    it("should open link when Learn More is selected on PET warning", async function () {
      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue("Learn More");
      mockPythonExtApi.mockResolvedValue(makeMockPythonExtApi());

      const mockOpenExternal = vi.mocked(vscode.env.openExternal);
      await service.initialize();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockOpenExternal).toHaveBeenCalled();
    });
  });

  describe("initialize — no extensions", function () {
    it("should return false when no Python extensions are installed", async function () {
      mockGetExtension.mockReturnValue(undefined);
      mockPythonExtApi.mockRejectedValue(new Error("Extension not found"));

      const result = await service.initialize();

      expect(result).toBe(false);
      expect(service.isAvailable()).toBe(false);
    });

    it("should handle activation errors gracefully", async function () {
      mockGetExtension.mockReturnValue({
        isActive: false,
        extensionPath: "/ext/path",
        exports: undefined,
        activate: vi.fn().mockRejectedValue(new Error("Activation failed")),
      });
      mockExistsSync.mockReturnValue(true);

      const result = await service.initialize();

      expect(result).toBe(false);
    });
  });

  describe("_isPetAvailable", function () {
    it("should check for pet binary on linux/mac", async function () {
      const originalPlatform = process.platform;
      try {
        Object.defineProperty(process, "platform", {
          value: "linux",
          configurable: true,
        });

        mockGetExtension.mockReturnValue({
          isActive: true,
          extensionPath: "/ext/path",
          exports: makeMockEnvsApi(),
          activate: vi.fn(),
        });
        mockExistsSync.mockReturnValue(true);

        await service.initialize();

        expect(mockExistsSync).toHaveBeenCalledWith(
          expect.stringContaining("pet"),
        );
        expect(mockExistsSync).not.toHaveBeenCalledWith(
          expect.stringContaining("pet.exe"),
        );
      } finally {
        Object.defineProperty(process, "platform", {
          value: originalPlatform,
          configurable: true,
        });
      }
    });
  });

  describe("getEnvironment — fallback path", function () {
    it("should resolve environment via Python extension fallback", async function () {
      const fallbackApi = makeMockPythonExtApi();

      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue(undefined);
      mockPythonExtApi.mockResolvedValue(fallbackApi);

      const result = await service.initialize();
      expect(result).toBe(true);

      const env = await service.getEnvironment();

      expect(env).toBeDefined();
      expect(env?.execInfo.run.executable).toBe("/usr/bin/python3");
      expect(env?.version).toBe("3.11.5");
    });

    it("should return undefined when fallback resolves to nothing", async function () {
      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue(undefined);

      const fallbackApi = makeMockPythonExtApi({
        resolveEnvironment: vi.fn().mockResolvedValue(undefined),
      });
      mockPythonExtApi.mockResolvedValue(fallbackApi);

      await service.initialize();
      const env = await service.getEnvironment();

      expect(env).toBeUndefined();
    });

    it("should default to first workspace folder when using fallback API", async function () {
      const mockGetActiveEnvPath = vi.fn().mockReturnValue({
        id: "workspace-env",
        path: "/workspace/venv/bin/python",
      });

      const fallbackApi = makeMockPythonExtApi({
        getActiveEnvironmentPath: mockGetActiveEnvPath,
        resolveEnvironment: vi.fn().mockResolvedValue({
          id: "workspace-env",
          executable: {
            uri: { fsPath: "/workspace/venv/bin/python" },
          },
          version: { major: 3, minor: 11, micro: 5 },
        }),
      });

      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue(undefined);
      mockPythonExtApi.mockResolvedValue(fallbackApi);

      const workspaceUri = vscode.Uri.file("/workspace");
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [{ uri: workspaceUri } as vscode.WorkspaceFolder],
        configurable: true,
      });

      await service.initialize();
      await service.getEnvironment(undefined);

      // Should pass workspace URI to getActiveEnvironmentPath
      expect(mockGetActiveEnvPath).toHaveBeenCalledWith(workspaceUri);
    });

    it("should use explicit scope with fallback API", async function () {
      const mockGetActiveEnvPath = vi.fn().mockReturnValue({
        id: "explicit-env",
        path: "/explicit/venv/bin/python",
      });

      const fallbackApi = makeMockPythonExtApi({
        getActiveEnvironmentPath: mockGetActiveEnvPath,
      });

      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue(undefined);
      mockPythonExtApi.mockResolvedValue(fallbackApi);

      const explicitScope = vscode.Uri.file("/explicit/workspace");
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [
          {
            uri: vscode.Uri.file("/default/workspace"),
          } as vscode.WorkspaceFolder,
        ],
        configurable: true,
      });

      await service.initialize();
      await service.getEnvironment(explicitScope);

      // Should use explicit scope, not default workspace
      expect(mockGetActiveEnvPath).toHaveBeenCalledWith(explicitScope);
    });
  });

  describe("getEnvironment — primary path", function () {
    it("should call API getEnvironment with scope", async function () {
      const mockEnv = {
        envId: { id: "test", managerId: "test" },
        name: "Python 3.11",
        displayName: "Python 3.11.0",
        version: "3.11.0",
        execInfo: { run: { executable: "/usr/bin/python3" } },
      };

      const mockApi = makeMockEnvsApi({
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();
      const result = await service.getEnvironment();

      expect(result).toEqual(mockEnv);
    });

    it("should handle API errors gracefully", async function () {
      const mockApi = makeMockEnvsApi({
        getEnvironment: vi.fn().mockRejectedValue(new Error("API error")),
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();
      const result = await service.getEnvironment();

      expect(result).toBeUndefined();
    });
  });

  describe("getEnvironment — scope resolution", function () {
    it("should use provided scope when explicitly passed", async function () {
      const mockGetEnvironment = vi.fn().mockResolvedValue({
        envId: { id: "test", managerId: "test" },
        execInfo: { run: { executable: "/workspace/venv/bin/python" } },
      });

      const mockApi = makeMockEnvsApi({
        getEnvironment: mockGetEnvironment,
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      const explicitScope = vscode.Uri.file("/explicit/workspace");
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [
          {
            uri: vscode.Uri.file("/default/workspace"),
          } as vscode.WorkspaceFolder,
        ],
        configurable: true,
      });

      await service.initialize();
      await service.getEnvironment(explicitScope);

      // Should pass the explicit scope, not the workspace folder
      expect(mockGetEnvironment).toHaveBeenCalledWith(explicitScope);
    });

    it("should default to first workspace folder when scope is undefined", async function () {
      const mockGetEnvironment = vi.fn().mockResolvedValue({
        envId: { id: "test", managerId: "test" },
        execInfo: { run: { executable: "/workspace/venv/bin/python" } },
      });

      const mockApi = makeMockEnvsApi({
        getEnvironment: mockGetEnvironment,
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      const workspaceUri = vscode.Uri.file("/workspace");
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [{ uri: workspaceUri } as vscode.WorkspaceFolder],
        configurable: true,
      });

      await service.initialize();
      await service.getEnvironment(undefined);

      // Should use first workspace folder as scope
      expect(mockGetEnvironment).toHaveBeenCalledWith(workspaceUri);
    });

    it("should pass undefined to API when no scope and no workspace folders", async function () {
      const mockGetEnvironment = vi.fn().mockResolvedValue({
        envId: { id: "test", managerId: "test" },
        execInfo: { run: { executable: "/usr/bin/python" } },
      });

      const mockApi = makeMockEnvsApi({
        getEnvironment: mockGetEnvironment,
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: undefined,
        configurable: true,
      });

      await service.initialize();
      await service.getEnvironment(undefined);

      // Should pass undefined when no workspace folders
      expect(mockGetEnvironment).toHaveBeenCalledWith(undefined);
    });

    it("should default to first workspace in multi-workspace setup", async function () {
      const mockGetEnvironment = vi.fn().mockResolvedValue({
        envId: { id: "test", managerId: "test" },
        execInfo: { run: { executable: "/workspace1/venv/bin/python" } },
      });

      const mockApi = makeMockEnvsApi({
        getEnvironment: mockGetEnvironment,
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      const workspace1Uri = vscode.Uri.file("/workspace1");
      const workspace2Uri = vscode.Uri.file("/workspace2");
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [
          { uri: workspace1Uri } as vscode.WorkspaceFolder,
          { uri: workspace2Uri } as vscode.WorkspaceFolder,
        ],
        configurable: true,
      });

      await service.initialize();
      await service.getEnvironment(undefined);

      // Should use first workspace folder in multi-workspace
      expect(mockGetEnvironment).toHaveBeenCalledWith(workspace1Uri);
    });
  });

  describe("getEnvironments", function () {
    it("should return empty array when no API available", async function () {
      mockGetExtension.mockReturnValue(undefined);
      mockPythonExtApi.mockRejectedValue(new Error("no ext"));

      const result = await service.getEnvironments();

      expect(result).toEqual([]);
    });

    it("should call API getEnvironments with scope", async function () {
      const mockEnvs = [
        { envId: { id: "1" }, name: "Python 3.11" },
        { envId: { id: "2" }, name: "Python 3.12" },
      ];

      const mockApi = makeMockEnvsApi({
        getEnvironments: vi.fn().mockResolvedValue(mockEnvs),
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();
      const result = await service.getEnvironments("all");

      expect(result).toEqual(mockEnvs);
    });
  });

  describe("getExecutablePath", function () {
    it("should return undefined when no environment", async function () {
      mockGetExtension.mockReturnValue(undefined);
      mockPythonExtApi.mockRejectedValue(new Error("no ext"));

      const result = await service.getExecutablePath();

      expect(result).toBeUndefined();
    });

    it("should return executable path from environment", async function () {
      const mockEnv = {
        envId: { id: "test", managerId: "test" },
        execInfo: { run: { executable: "/usr/bin/python3.11" } },
      };

      const mockApi = makeMockEnvsApi({
        getEnvironment: vi.fn().mockResolvedValue(mockEnv),
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();
      const result = await service.getExecutablePath();

      expect(result).toBe("/usr/bin/python3.11");
    });
  });

  describe("selectEnvironment", function () {
    it("should execute python-envs.set when Environments API available", async function () {
      const mockApi = makeMockEnvsApi();
      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);
      mockExecuteCommand.mockResolvedValue(undefined);

      await service.initialize();
      await service.selectEnvironment();

      expect(mockExecuteCommand).toHaveBeenCalledWith("python-envs.set");
    });

    it("should fall back to python.setInterpreter when python-envs.set fails", async function () {
      const mockApi = makeMockEnvsApi();
      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      mockExecuteCommand
        .mockRejectedValueOnce(new Error("Command not found"))
        .mockResolvedValueOnce(undefined);

      await service.initialize();
      await service.selectEnvironment();

      expect(mockExecuteCommand).toHaveBeenCalledWith("python.setInterpreter");
    });

    it("should use python.setInterpreter when only fallback is active", async function () {
      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue(undefined);
      mockPythonExtApi.mockResolvedValue(makeMockPythonExtApi());
      mockExecuteCommand.mockResolvedValue(undefined);

      await service.initialize();
      await service.selectEnvironment();

      expect(mockExecuteCommand).toHaveBeenCalledWith("python.setInterpreter");
    });
  });

  describe("hasFullApi", function () {
    it("should return false before initialization", function () {
      expect(service.hasFullApi()).toBe(false);
    });

    it("should return true with Environments API", async function () {
      const mockApi = makeMockEnvsApi();
      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();

      expect(service.hasFullApi()).toBe(true);
    });

    it("should return false with only fallback API", async function () {
      mockGetExtension.mockImplementation((id: string) => {
        if (id === PYTHON_ENVS_EXTENSION_ID) {
          return {
            isActive: true,
            extensionPath: "/ext/path",
            exports: makeMockEnvsApi(),
            activate: vi.fn(),
          };
        }
        if (id === "ms-python.python") {
          return { isActive: true, activate: vi.fn() };
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);
      mockShowWarningMessage.mockResolvedValue(undefined);
      mockPythonExtApi.mockResolvedValue(makeMockPythonExtApi());

      await service.initialize();

      expect(service.hasFullApi()).toBe(false);
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

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "workbench.extensions.installExtension",
        PYTHON_ENVS_EXTENSION_ID,
      );
    });
  });

  describe("dispose", function () {
    it("should dispose all subscriptions", async function () {
      const mockDispose = vi.fn();
      const mockOnDidChange = vi.fn().mockReturnValue({
        dispose: mockDispose,
      });

      const mockApi = makeMockEnvsApi({
        onDidChangeEnvironment: mockOnDidChange,
      });

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: mockApi,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();
      service.dispose();

      expect(mockDispose).toHaveBeenCalled();
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
        extensionPath: "/ext/path",
        exports: undefined,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();

      expect(mockConfig.update).toHaveBeenCalledWith(
        "useEnvironmentsExtension",
        true,
        2,
      );
    });

    it("should not prompt when setting is already enabled", async function () {
      const mockConfig = {
        get: vi.fn().mockReturnValue(true),
        update: vi.fn(),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);

      mockGetExtension.mockReturnValue({
        isActive: true,
        extensionPath: "/ext/path",
        exports: undefined,
        activate: vi.fn(),
      });
      mockExistsSync.mockReturnValue(true);

      await service.initialize();

      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });
  });
});
