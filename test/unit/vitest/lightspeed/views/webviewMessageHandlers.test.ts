import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import * as os from "os";
import type {
  PlaybookGenerationResponseParams,
  RoleGenerationResponseParams,
  ExplanationResponseParams,
  FeedbackRequestParams,
} from "../../../../../src/interfaces/lightspeed";
import { RoleFileType } from "../../../../../src/interfaces/lightspeed";
import { IError } from "../../../../../src/features/lightspeed/utils/errors";
import { ThumbsUpDownAction } from "../../../../../src/definitions/lightspeed";

vi.mock("../../../../../src/extension", () => {
  return {
    lightSpeedManager: {
      apiInstance: {
        playbookGenerationRequest: vi.fn(),
        feedbackRequest: vi.fn(),
      },
      providerManager: {
        generatePlaybook: vi.fn(),
      },
      settingsManager: {
        settings: {
          lightSpeedService: {
            provider: "google",
            modelName: "gpt-4",
          },
        },
      },
      statusBarProvider: {
        statusBar: {
          text: "",
        },
        getLightSpeedStatusBarText: vi.fn().mockResolvedValue("Lightspeed"),
      },
      telemetry: {
        telemetryService: {},
        isTelemetryInit: vi.fn().mockResolvedValue(true),
      },
    },
  };
});

vi.mock("../../../../../src/features/lightspeed/vue/views/lightspeedUtils", async () => {
  const actual = await vi.importActual(
    "../../../../../src/features/lightspeed/vue/views/lightspeedUtils",
  );
  return {
    ...actual,
    contentMatch: vi.fn(),
    updatePromptHistory: vi.fn(),
    generatePlaybook: vi.fn(),
    explainPlaybook: vi.fn(),
    explainRole: vi.fn(),
    generateRole: vi.fn(),
    thumbsUpDown: vi.fn(),
  };
});

vi.mock("../../../../../src/features/lightspeed/vue/views/fileOperations", () => {
  class MockFileOperations {
    openLogFile = vi.fn();
    openFolderInWorkspaceProjects = vi.fn();
    openFolderInWorkspacePlugin = vi.fn();
    openFolderInWorkspaceRole = vi.fn();
    openFolderInWorkspaceDevcontainer = vi.fn();
    openDevfile = vi.fn();
    openFileInEditor = vi.fn();
  }

  return {
    FileOperations: MockFileOperations,
    openNewPlaybookEditor: vi.fn(),
    getCollectionsFromWorkspace: vi.fn().mockResolvedValue([]),
    getRoleBaseDir: vi.fn(),
    fileExists: vi.fn(),
  };
});

vi.mock("../../../../../src/features/lightspeed/vue/views/ansibleCreatorUtils", () => {
  class MockAnsibleCreatorOperations {
    runInitCommand = vi.fn();
    runPluginAddCommand = vi.fn();
    runRoleAddCommand = vi.fn();
    isADEPresent = vi.fn();
  }

  return {
    AnsibleCreatorOperations: MockAnsibleCreatorOperations,
  };
});

vi.mock("../../../../../src/utils/telemetryUtils", () => {
  return {
    sendTelemetry: vi.fn(),
  };
});

vi.mock("../../../../../src/features/lightspeed/utils/oneClickTrial", () => {
  return {
    getOneClickTrialProvider: vi.fn().mockReturnValue({
      showPopup: vi.fn().mockResolvedValue(false),
    }),
  };
});

// Import after mocks
import { WebviewMessageHandlers } from "../../../../../src/features/lightspeed/vue/views/webviewMessageHandlers";
import * as lightspeedUtils from "../../../../../src/features/lightspeed/vue/views/lightspeedUtils";
import {
  contentMatch,
  updatePromptHistory,
  explainPlaybook,
  explainRole,
  generateRole,
  thumbsUpDown,
} from "../../../../../src/features/lightspeed/vue/views/lightspeedUtils";
import { openNewPlaybookEditor } from "../../../../../src/features/lightspeed/vue/views/fileOperations";
import { lightSpeedManager } from "../../../../../src/extension";
import { sendTelemetry } from "../../../../../src/utils/telemetryUtils";

describe("WebviewMessageHandlers", () => {
  let messageHandlers: WebviewMessageHandlers;
  let mockWebview: vscode.Webview;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset provider to default
    lightSpeedManager.settingsManager.settings.lightSpeedService.provider = "google";

    // Reset mocks to default implementations
    if (lightSpeedManager.providerManager) {
      (lightSpeedManager.providerManager.generatePlaybook as ReturnType<typeof vi.fn>).mockReset();
    }
    (lightSpeedManager.apiInstance.playbookGenerationRequest as ReturnType<typeof vi.fn>).mockReset();
    (lightSpeedManager.apiInstance.feedbackRequest as ReturnType<typeof vi.fn>).mockReset();

    // Setup mock webview
    mockWebview = {
      postMessage: vi.fn(),
    } as unknown as vscode.Webview;

    // Setup mock context
    mockContext = {
      globalState: {
        get: vi.fn(),
        update: vi.fn(),
      },
      workspaceState: {
        get: vi.fn().mockReturnValue([]),
        update: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    messageHandlers = new WebviewMessageHandlers();
  });

  describe("handleGeneratePlaybook", () => {
    it("should successfully generate playbook with LLM provider and post message to webview", async () => {
      const mockPlaybookResponse: PlaybookGenerationResponseParams = {
        playbook: "---\n- name: Test playbook\n  hosts: all\n  tasks:\n    - name: Test task\n      debug:\n        msg: Hello",
        outline: "1. Test task",
        generationId: "test-generation-id",
      };

      // Mock generatePlaybook to return success
      const generatePlaybookSpy = vi.spyOn(lightspeedUtils, "generatePlaybook").mockResolvedValue(mockPlaybookResponse);

      const message = {
        type: "generatePlaybook",
        data: {
          text: "Create a playbook to install nginx",
          outline: "",
        },
      };

      await messageHandlers["handleGeneratePlaybook"](
        message,
        mockWebview,
        mockContext,
      );

      // Verify generatePlaybook was called with correct parameters
      expect(generatePlaybookSpy).toHaveBeenCalledWith(
        lightSpeedManager.apiInstance,
        "Create a playbook to install nginx",
        "",
        expect.any(String), // generationId (UUID)
      );

      // Verify webview.postMessage was called with the response
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "generatePlaybook",
        data: mockPlaybookResponse,
      });

      // Verify contentMatch was called
      expect(vi.mocked(contentMatch)).toHaveBeenCalledWith(
        expect.any(String), // generationId
        mockPlaybookResponse.playbook,
      );

      // Verify updatePromptHistory was called
      expect(vi.mocked(updatePromptHistory)).toHaveBeenCalledWith(
        mockContext,
        "Create a playbook to install nginx",
      );
    });

    it("should handle error response and send error message to webview", async () => {
      const mockError: IError = {
        message: "Failed to generate playbook: API error",
        code: "GENERATION_ERROR",
      };

      // Mock generatePlaybook to return error
      vi.spyOn(lightspeedUtils, "generatePlaybook").mockResolvedValue(mockError);

      const message = {
        type: "generatePlaybook",
        data: {
          text: "Create a playbook",
          outline: "",
        },
      };

      await messageHandlers["handleGeneratePlaybook"](
        message,
        mockWebview,
        mockContext,
      );

      // Verify sendErrorMessage was called (via postMessage with errorMessage type)
      // The actual implementation sends error via sendErrorMessage which posts a message
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "errorMessage",
        data: "Failed to get an answer from the server: Failed to generate playbook: API error",
      });

      // Verify contentMatch and updatePromptHistory were NOT called on error
      expect(vi.mocked(contentMatch)).not.toHaveBeenCalled();
      expect(vi.mocked(updatePromptHistory)).not.toHaveBeenCalled();
    });
  });


  describe("handleMessage dispatcher", () => {
    it("should route message to correct handler based on 'type' field", async () => {
      const message = {
        type: "getRecentPrompts",
        data: {},
      };

      await messageHandlers.handleMessage(message, mockWebview, mockContext);

      expect(mockWebview.postMessage).toHaveBeenCalled();
    });

    it("should log warning for unknown message type", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const message = {
        type: "unknownMessageType",
        data: {},
      };

      await messageHandlers.handleMessage(message, mockWebview, mockContext);

      expect(consoleSpy).toHaveBeenCalledWith("Unknown message type/command: unknownMessageType");
      consoleSpy.mockRestore();
    });
  });

  describe("System handlers", () => {
    it("should handle getHomeDirectory with workspace folders", () => {
      const mockWorkspaceFolders = [
        {
          uri: { fsPath: "/workspace/path" },
          name: "workspace",
          index: 0,
        },
      ];
      vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(
        mockWorkspaceFolders as any,
      );

      const message = { type: "getHomeDirectory", data: {} };
      messageHandlers["handleGetHomeDirectory"](message, mockWebview);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "homeDirectory",
        data: "/workspace/path",
      });
    });

    it("should handle ui-mounted with workspace folders", () => {
      const mockWorkspaceFolders = [
        {
          uri: { fsPath: "/workspace/path" },
          name: "workspace",
          index: 0,
        },
      ];
      vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(
        mockWorkspaceFolders as any,
      );

      const message = { type: "ui-mounted", data: {} };
      messageHandlers["handleUiMounted"](message, mockWebview);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        command: "homedirAndTempdir",
        homedir: "/workspace/path",
        tempdir: os.tmpdir(),
      });
    });
  });

  describe("Editor handlers", () => {
    it("should handle openEditor", async () => {
      const message = {
        type: "openEditor",
        data: {
          content: "---\n- name: Test playbook\n  hosts: all",
        },
      };

      await messageHandlers["handleOpenEditor"](message);

      expect(vi.mocked(openNewPlaybookEditor)).toHaveBeenCalledWith(
        "---\n- name: Test playbook\n  hosts: all",
      );
    });
  });

  describe("Data handlers", () => {
    it("should handle setPlaybookData", () => {
      const message = {
        type: "setPlaybookData",
        data: { content: "test playbook" },
      };

      messageHandlers["handleSetPlaybookData"](message, mockWebview);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "setPlaybookData",
        data: { content: "test playbook" },
      });
    });

    it("should handle setRoleData", () => {
      const message = {
        type: "setRoleData",
        data: { content: "test role" },
      };

      messageHandlers["handleSetRoleData"](message, mockWebview);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "setRoleData",
        data: { content: "test role" },
      });
    });

    it("should handle getRecentPrompts", () => {
      const recentPrompts = ["prompt1", "prompt2"];
      (mockContext.workspaceState.get as ReturnType<typeof vi.fn>).mockReturnValue(recentPrompts);

      const message = { type: "getRecentPrompts" };

      messageHandlers["handleGetRecentPrompts"](message, mockWebview, mockContext);

      expect(mockContext.workspaceState.get).toHaveBeenCalledWith(
        "ansible.lightspeed.recent_prompts",
        [],
      );

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "getRecentPrompts",
        data: recentPrompts,
      });
    });

    it("should handle getCollectionList", async () => {
      const message = { type: "getCollectionList" };

      await messageHandlers["handleGetCollectionList"](message, mockWebview);

      // Wait for debounce (200ms)
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "getCollectionList",
        data: [],
      });
    });
  });

  describe("LightSpeed explanation handlers", () => {
    it("should handle explainPlaybook success", async () => {
      const mockResponse: ExplanationResponseParams = {
        content: "This playbook installs nginx",
        format: "markdown",
        explanationId: "test-explanation-id",
      };

      vi.mocked(explainPlaybook).mockResolvedValue(mockResponse);

      const message = {
        type: "explainPlaybook",
        data: {
          content: "---\n- name: Install nginx",
          explanationId: "test-explanation-id",
        },
      };

      await messageHandlers["handleExplainPlaybook"](message, mockWebview);

      expect(explainPlaybook).toHaveBeenCalledWith(
        lightSpeedManager.apiInstance,
        "---\n- name: Install nginx",
        "test-explanation-id",
      );

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "explainPlaybook",
        data: mockResponse,
      });
    });

    it("should handle explainPlaybook error", async () => {
      const mockError: IError = {
        message: "Failed to explain playbook",
        code: "EXPLANATION_ERROR",
      };

      vi.mocked(explainPlaybook).mockResolvedValue(mockError);
      const showErrorSpy = vi.spyOn(vscode.window, "showErrorMessage");

      const message = {
        type: "explainPlaybook",
        data: {
          content: "invalid playbook",
          explanationId: "test-id",
        },
      };

      await messageHandlers["handleExplainPlaybook"](message, mockWebview);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "errorMessage",
        data: "Failed to get an answer from the server: Failed to explain playbook",
      });

      expect(showErrorSpy).toHaveBeenCalled();
    });

    it("should handle explainRole success", async () => {
      const mockResponse: ExplanationResponseParams = {
        content: "This role configures apache",
        format: "markdown",
        explanationId: "test-role-explanation-id",
      };

      vi.mocked(explainRole).mockResolvedValue(mockResponse);

      const message = {
        type: "explainRole",
        data: {
          files: [{ path: "tasks/main.yml", content: "---" }],
          roleName: "apache",
          explanationId: "test-role-explanation-id",
        },
      };

      await messageHandlers["handleExplainRole"](message, mockWebview);

      expect(explainRole).toHaveBeenCalledWith(
        lightSpeedManager.apiInstance,
        [{ path: "tasks/main.yml", content: "---" }],
        "apache",
        "test-role-explanation-id",
      );

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "explainRole",
        data: mockResponse,
      });
    });

    it("should handle explainRole error", async () => {
      const mockError: IError = {
        message: "Failed to explain role",
        code: "EXPLANATION_ERROR",
      };

      vi.mocked(explainRole).mockResolvedValue(mockError);

      const message = {
        type: "explainRole",
        data: {
          files: [],
          roleName: "invalid",
          explanationId: "test-id",
        },
      };

      await messageHandlers["handleExplainRole"](message, mockWebview);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "errorMessage",
        data: "Failed to get an answer from the server: Failed to explain role",
      });
    });
  });

  describe("LightSpeed generation handlers", () => {
    it("should handle generateRole success", async () => {
      const mockResponse: RoleGenerationResponseParams = {
        files: [
          {
            path: "tasks/main.yml",
            content: "---\n- name: Task",
            file_type: RoleFileType.Task,
          },
        ],
        generationId: "test-role-gen-id",
        name: "webserver",
      };

      vi.mocked(generateRole).mockResolvedValue(mockResponse);

      const message = {
        type: "generateRole",
        data: {
          name: "webserver",
          text: "Create a webserver role",
          outline: "",
        },
      };

      await messageHandlers["handleGenerateRole"](message, mockWebview, mockContext);

      expect(generateRole).toHaveBeenCalledWith(
        lightSpeedManager.apiInstance,
        "webserver",
        "Create a webserver role",
        "",
        expect.any(String),
      );

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "generateRole",
        data: mockResponse,
      });

      expect(vi.mocked(contentMatch)).toHaveBeenCalledWith(
        expect.any(String),
        "---\n- name: Task",
      );

      expect(vi.mocked(updatePromptHistory)).toHaveBeenCalledWith(
        mockContext,
        "Create a webserver role",
      );
    });

    it("should handle generateRole error", async () => {
      const mockError: IError = {
        message: "Failed to generate role",
        code: "GENERATION_ERROR",
      };

      vi.mocked(generateRole).mockResolvedValue(mockError);

      const message = {
        type: "generateRole",
        data: {
          name: "invalid",
          text: "Generate role",
          outline: "",
        },
      };

      await messageHandlers["handleGenerateRole"](message, mockWebview, mockContext);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "errorMessage",
        data: "Failed to get an answer from the server: Failed to generate role",
      });

      expect(vi.mocked(updatePromptHistory)).not.toHaveBeenCalled();
    });
  });

  describe("Feedback handlers", () => {
    it("should handle explanationThumbsUp", async () => {
      const message = {
        type: "explanationThumbsUp",
        data: {
          action: ThumbsUpDownAction.UP,
          explanationId: "test-explanation-id",
        },
      };

      await messageHandlers["handleExplanationThumbsUp"](message);

      expect(vi.mocked(thumbsUpDown)).toHaveBeenCalledWith(
        ThumbsUpDownAction.UP,
        "test-explanation-id",
      );
    });

    it("should handle explanationThumbsDown", async () => {
      const message = {
        type: "explanationThumbsDown",
        data: {
          action: ThumbsUpDownAction.DOWN,
          explanationId: "test-explanation-id",
        },
      };

      await messageHandlers["handleExplanationThumbsDown"](message);

      expect(vi.mocked(thumbsUpDown)).toHaveBeenCalledWith(
        ThumbsUpDownAction.DOWN,
        "test-explanation-id",
      );
    });

    it("should handle feedback for LLM provider with telemetry", async () => {
      lightSpeedManager.settingsManager.settings.lightSpeedService.provider = "google";

      const feedbackRequest: FeedbackRequestParams = {
        model: "gpt-4",
        sentimentFeedback: {
          value: 5,
        } as any,
      };

      const message = {
        type: "feedback",
        data: {
          request: feedbackRequest,
        },
      };

      await messageHandlers["handleFeedback"](message);

      expect(vi.mocked(sendTelemetry)).toHaveBeenCalledWith(
        lightSpeedManager.telemetry.telemetryService,
        expect.any(Function),
        "lightspeed.feedback",
        expect.objectContaining({
          provider: "google",
          model: "gpt-4",
        }),
      );

      // Should not call API feedbackRequest for LLM providers
      expect(lightSpeedManager.apiInstance.feedbackRequest).not.toHaveBeenCalled();
    });

    it("should handle feedback telemetry error gracefully", async () => {
      lightSpeedManager.settingsManager.settings.lightSpeedService.provider = "google";
      vi.mocked(sendTelemetry).mockRejectedValueOnce(new Error("Telemetry error"));

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const feedbackRequest: FeedbackRequestParams = {
        model: "gpt-4",
      };

      const message = {
        type: "feedback",
        data: {
          request: feedbackRequest,
        },
      };

      await messageHandlers["handleFeedback"](message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Lightspeed Feedback] Telemetry failed:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("should handle feedback for WCA provider with API call", async () => {
      lightSpeedManager.settingsManager.settings.lightSpeedService.provider = "wca";

      const feedbackRequest: FeedbackRequestParams = {
        model: "wca-model",
        sentimentFeedback: {
          value: 5,
        } as any,
      };

      const message = {
        type: "feedback",
        data: {
          request: feedbackRequest,
        },
      };

      await messageHandlers["handleFeedback"](message);

      expect(lightSpeedManager.apiInstance.feedbackRequest).toHaveBeenCalledWith(
        feedbackRequest,
        false,
      );

      // Should not call sendTelemetry for WCA provider
      expect(vi.mocked(sendTelemetry)).not.toHaveBeenCalled();
    });
  });

  describe("Creator handlers", () => {
    it("should handle init-create", async () => {
      const message = {
        type: "init-create",
        payload: {
          collectionName: "my.collection",
          namespace: "my",
          name: "collection",
        },
      };

      await messageHandlers["handleInitCreate"](message, mockWebview);

      expect(messageHandlers["creatorOps"].runInitCommand).toHaveBeenCalledWith(
        message.payload,
        mockWebview,
      );
    });

    it("should handle init-create-plugin", async () => {
      const message = {
        type: "init-create-plugin",
        payload: {
          pluginName: "test_plugin",
          pluginType: "module",
        },
      };

      await messageHandlers["handleInitCreatePlugin"](message, mockWebview);

      expect(messageHandlers["creatorOps"].runPluginAddCommand).toHaveBeenCalledWith(
        message.payload,
        mockWebview,
      );
    });

    it("should handle init-create-role", async () => {
      const message = {
        type: "init-create-role",
        payload: {
          roleName: "test_role",
        },
      };

      await messageHandlers["handleInitCreateRole"](message, mockWebview);

      expect(messageHandlers["creatorOps"].runRoleAddCommand).toHaveBeenCalledWith(
        message.payload,
        mockWebview,
      );
    });

    it("should handle check-ade-presence", async () => {
      const message = {
        type: "check-ade-presence",
      };

      await messageHandlers["handleCheckAdePresence"](message, mockWebview);

      expect(messageHandlers["creatorOps"].isADEPresent).toHaveBeenCalledWith(
        mockWebview,
      );
    });
  });

  describe("File operation handlers", () => {
    it("should handle init-open-log-file", async () => {
      const message = {
        type: "init-open-log-file",
        payload: {
          logFileUrl: "/path/to/log.txt",
        },
      };

      await messageHandlers["handleInitOpenLogFile"](message);

      expect(messageHandlers["fileOps"].openLogFile).toHaveBeenCalledWith(
        "/path/to/log.txt",
      );
    });

    it("should handle init-open-scaffolded-folder with collectionUrl", async () => {
      const message = {
        type: "init-open-scaffolded-folder",
        payload: {
          collectionUrl: "/path/to/collection",
        },
      };

      await messageHandlers["handleInitOpenScaffoldedFolder"](message);

      expect(messageHandlers["fileOps"].openFolderInWorkspaceProjects).toHaveBeenCalledWith(
        "/path/to/collection",
      );
    });

    it("should handle init-open-scaffolded-folder with projectUrl", async () => {
      const message = {
        type: "init-open-scaffolded-folder",
        payload: {
          projectUrl: "/path/to/project",
        },
      };

      await messageHandlers["handleInitOpenScaffoldedFolder"](message);

      expect(messageHandlers["fileOps"].openFolderInWorkspaceProjects).toHaveBeenCalledWith(
        "/path/to/project",
      );
    });

    it("should handle init-open-scaffolded-folder-plugin", async () => {
      const message = {
        type: "init-open-scaffolded-folder-plugin",
        payload: {
          projectUrl: "/path/to/project",
          pluginName: "test_plugin",
          pluginType: "module",
        },
      };

      await messageHandlers["handleInitOpenScaffoldedFolderPlugin"](message);

      expect(messageHandlers["fileOps"].openFolderInWorkspacePlugin).toHaveBeenCalledWith(
        "/path/to/project",
        "test_plugin",
        "module",
      );
    });

    it("should handle init-open-role-folder", async () => {
      const message = {
        type: "init-open-role-folder",
        payload: {
          projectUrl: "/path/to/project",
          roleName: "test_role",
        },
      };

      await messageHandlers["handleInitOpenRoleFolder"](message);

      expect(messageHandlers["fileOps"].openFolderInWorkspaceRole).toHaveBeenCalledWith(
        "/path/to/project",
        "test_role",
      );
    });

    it("should handle init-open-devcontainer-folder", async () => {
      const message = {
        type: "init-open-devcontainer-folder",
        payload: {
          projectUrl: "/path/to/project",
        },
      };

      await messageHandlers["handleInitOpenDevcontainerFolder"](message);

      expect(messageHandlers["fileOps"].openFolderInWorkspaceDevcontainer).toHaveBeenCalledWith(
        "/path/to/project",
      );
    });

    it("should handle init-open-devfile", async () => {
      const message = {
        type: "init-open-devfile",
        payload: {
          projectUrl: "/path/to/project",
        },
      };

      await messageHandlers["handleInitOpenDevfile"](message);

      expect(messageHandlers["fileOps"].openDevfile).toHaveBeenCalledWith(
        "/path/to/project",
      );
    });

    it("should handle init-open-scaffolded-file", async () => {
      const message = {
        type: "init-open-scaffolded-file",
        payload: {
          projectUrl: "/path/to/project",
        },
      };

      await messageHandlers["handleInitOpenScaffoldedFile"](message);

      expect(messageHandlers["fileOps"].openFileInEditor).toHaveBeenCalledWith(
        "/path/to/project/execution-environment.yml",
      );
    });
  });

  describe("Helper methods", () => {
    it("should get workspace folder when it exists", () => {
      const mockWorkspaceFolders = [
        {
          uri: { path: "/workspace/path" },
          name: "workspace",
          index: 0,
        },
      ];
      vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(
        mockWorkspaceFolders as any,
      );

      const result = messageHandlers["getWorkspaceFolder"]();

      expect(result).toBe("/workspace/path");
    });

    it("should return empty string when no workspace folders", () => {
      vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(undefined);

      const result = messageHandlers["getWorkspaceFolder"]();

      expect(result).toBe("");
    });

    it("should get downstream container image", () => {
      const result = messageHandlers["getContainerImage"]("downstream-image");

      // Should return downstream constant
      expect(result).toBeDefined();
    });

    it("should get upstream container image by default", () => {
      const result = messageHandlers["getContainerImage"]("upstream-image");

      // Should return upstream constant
      expect(result).toBeDefined();
    });

    it("should get recommended extensions", () => {
      const result = messageHandlers["getRecommendedExtensions"]();

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
