import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { LightspeedExplorerWebviewViewProvider } from "../../../../src/features/lightspeed/explorerWebviewViewProvider";
import type { LightspeedUser } from "../../../../src/features/lightspeed/lightspeedUser";
import type { SettingsManager } from "../../../../src/settings";
import {
  PROVIDER_TYPES,
  TEST_LIGHTSPEED_SETTINGS,
} from "./testConstants";

// Mock vscode module
vi.mock("vscode", () => {
  return {
    Uri: {
      joinPath: vi.fn((base, ...paths) => ({
        path: `${base.path}/${paths.join("/")}`,
      })),
    },
    window: {
      activeTextEditor: undefined,
    },
  };
});

// Mock logger
vi.mock("../../../../src/utils/logger", () => ({
  getLightspeedLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock explorerView utilities
vi.mock("../../../../src/features/lightspeed/utils/explorerView", () => ({
  getWebviewContentWithLoginForm: vi.fn(() => "<html>Login Form</html>"),
  getWebviewContentWithActiveSession: vi.fn(() => "<html>Active Session</html>"),
  setWebviewMessageListener: vi.fn(),
}));

// Mock explanationUtils
vi.mock("../../../../src/features/lightspeed/utils/explanationUtils", () => ({
  isPlaybook: vi.fn(() => false),
  isDocumentInRole: vi.fn(() => Promise.resolve(false)),
}));

// Import after mocks
import {
  getWebviewContentWithLoginForm,
  getWebviewContentWithActiveSession,
  setWebviewMessageListener,
} from "../../../../src/features/lightspeed/utils/explorerView";
import {
  isPlaybook,
  isDocumentInRole,
} from "../../../../src/features/lightspeed/utils/explanationUtils";

describe("LightspeedExplorerWebviewViewProvider", () => {
  let provider: LightspeedExplorerWebviewViewProvider;
  let mockExtensionUri: vscode.Uri;
  let mockLightspeedUser: LightspeedUser;
  let mockSettingsManager: SettingsManager;
  let mockWebviewView: vscode.WebviewView;
  let mockWebview: vscode.Webview;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock extension URI
    mockExtensionUri = {
      path: "/extension/path",
      fsPath: "/extension/path",
    } as vscode.Uri;

    // Setup mock lightspeed user
    mockLightspeedUser = {
      getLightspeedUserContent: vi.fn(),
    } as unknown as LightspeedUser;

    // Setup mock settings manager with Google provider
    mockSettingsManager = {
      settings: {
        lightSpeedService: {
          ...TEST_LIGHTSPEED_SETTINGS.GOOGLE_FULL,
        },
      },
    } as unknown as SettingsManager;

    // Setup mock webview
    mockWebview = {
      html: "",
      options: {},
      cspSource: "test-csp-source",
      asWebviewUri: vi.fn((uri) => uri),
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as vscode.Webview;

    // Setup mock webview view
    mockWebviewView = {
      webview: mockWebview,
      visible: true,
      onDidDispose: vi.fn(),
      onDidChangeVisibility: vi.fn(),
    } as unknown as vscode.WebviewView;

    provider = new LightspeedExplorerWebviewViewProvider(
      mockExtensionUri,
      mockLightspeedUser,
      mockSettingsManager,
    );
  });

  describe("constructor", () => {
    it("should initialize with correct properties", () => {
      expect(provider).toBeDefined();
      expect(provider.webviewView).toBeUndefined();
      expect(provider.lightspeedExperimentalEnabled).toBe(false);
    });

    it("should have correct static viewType", () => {
      expect(LightspeedExplorerWebviewViewProvider.viewType).toBe(
        "lightspeed-explorer-webview",
      );
    });
  });

  describe("resolveWebviewView", () => {
    it("should configure webview options correctly", async () => {
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockWebviewView.webview.options).toEqual({
        enableScripts: true,
        localResourceRoots: [
          expect.objectContaining({ path: "/extension/path/out" }),
          expect.objectContaining({ path: "/extension/path/media" }),
        ],
      });
    });

    it("should set webview html content", async () => {
      vi.mocked(mockLightspeedUser.getLightspeedUserContent).mockResolvedValue(
        "Test User Content",
      );

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockWebview.html).toBe("<html>Active Session</html>");
    });

    it("should store webview view reference", async () => {
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(provider.webviewView).toBe(mockWebviewView);
    });

    it("should set webview message listener", async () => {
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(setWebviewMessageListener).toHaveBeenCalledWith(
        mockWebview,
        [],
      );
    });
  });

  describe("refreshWebView", () => {
    it("should do nothing if webview is not initialized", async () => {
      await provider.refreshWebView();

      expect(getWebviewContentWithActiveSession).not.toHaveBeenCalled();
      expect(getWebviewContentWithLoginForm).not.toHaveBeenCalled();
    });

    it("should update webview html when webview exists", async () => {
      // First resolve the webview
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      // Clear previous mock calls
      vi.clearAllMocks();

      // Refresh
      await provider.refreshWebView();

      expect(mockWebview.html).toBe("<html>Active Session</html>");
    });
  });

  describe("_getWebviewContent for Google provider", () => {
    it("should show active session for Google provider without OAuth check", async () => {
      // Google provider is already set in mockSettingsManager
      vi.mocked(isPlaybook).mockReturnValue(false);
      vi.mocked(isDocumentInRole).mockResolvedValue(false);

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        mockWebview,
        mockExtensionUri,
        `Using ${PROVIDER_TYPES.GOOGLE} provider`,
        false,
        false,
      );
      expect(mockLightspeedUser.getLightspeedUserContent).not.toHaveBeenCalled();
    });

    it("should pass correct playbook and role status for Google provider", async () => {
      vi.mocked(isPlaybook).mockReturnValue(true);
      vi.mocked(isDocumentInRole).mockResolvedValue(true);

      // Mock active editor with ansible document
      (vscode.window as any).activeTextEditor = {
        document: {
          languageId: "ansible",
          getText: vi.fn(() => "- name: Test playbook"),
          uri: { fsPath: "/path/to/playbook.yml" },
        },
      };

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        mockWebview,
        mockExtensionUri,
        `Using ${PROVIDER_TYPES.GOOGLE} provider`,
        true,
        true,
      );
    });
  });

  describe("_getWebviewContent for WCA provider", () => {
    beforeEach(() => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };
    });

    it("should show login form when WCA user is not authenticated", async () => {
      vi.mocked(mockLightspeedUser.getLightspeedUserContent).mockResolvedValue(
        "",
      );

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(mockLightspeedUser.getLightspeedUserContent).toHaveBeenCalled();
      expect(getWebviewContentWithLoginForm).toHaveBeenCalledWith(
        mockWebview,
        mockExtensionUri,
      );
    });
  });

  describe("hasPlaybookOpened", () => {
    it("should return false when no active editor", async () => {
      (vscode.window as any).activeTextEditor = undefined;

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        false,
        expect.anything(),
      );
    });

    it("should return false when document is not ansible language", async () => {
      (vscode.window as any).activeTextEditor = {
        document: {
          languageId: "yaml",
          getText: vi.fn(() => "some: yaml"),
        },
      };

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(isPlaybook).not.toHaveBeenCalled();
    });

    it("should return true when ansible playbook is open", async () => {
      vi.mocked(isPlaybook).mockReturnValue(true);

      (vscode.window as any).activeTextEditor = {
        document: {
          languageId: "ansible",
          getText: vi.fn(() => "- name: Test playbook"),
        },
      };

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(isPlaybook).toHaveBeenCalled();
      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        true,
        expect.anything(),
      );
    });

    it("should return false when isPlaybook throws error", async () => {
      vi.mocked(isPlaybook).mockImplementation(() => {
        throw new Error("Parse error");
      });

      (vscode.window as any).activeTextEditor = {
        document: {
          languageId: "ansible",
          getText: vi.fn(() => "invalid yaml: ["),
        },
      };

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        false,
        expect.anything(),
      );
    });
  });

  describe("hasRoleOpened", () => {
    it("should return false when no active editor", async () => {
      (vscode.window as any).activeTextEditor = undefined;

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(isDocumentInRole).not.toHaveBeenCalled();
    });

    it("should return true when role document is open", async () => {
      vi.mocked(isDocumentInRole).mockResolvedValue(true);

      (vscode.window as any).activeTextEditor = {
        document: {
          uri: { fsPath: "/path/to/roles/myrole/tasks/main.yml" },
        },
      };

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(isDocumentInRole).toHaveBeenCalled();
      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        true,
      );
    });

    it("should return false when isDocumentInRole throws error", async () => {
      vi.mocked(isDocumentInRole).mockRejectedValue(
        new Error("File system error"),
      );

      (vscode.window as any).activeTextEditor = {
        document: {
          uri: { fsPath: "/path/to/file.yml" },
        },
      };

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        false,
      );
    });
  });

  describe("integration scenarios", () => {
    it("should handle Google provider with playbook and role open", async () => {
      // Setup Google provider
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.GOOGLE_FULL,
      };

      // Mock both playbook and role detection
      vi.mocked(isPlaybook).mockReturnValue(true);
      vi.mocked(isDocumentInRole).mockResolvedValue(true);

      (vscode.window as any).activeTextEditor = {
        document: {
          languageId: "ansible",
          getText: vi.fn(() => "- name: Test playbook"),
          uri: { fsPath: "/path/to/roles/myrole/tasks/main.yml" },
        },
      };

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        mockWebview,
        mockExtensionUri,
        `Using ${PROVIDER_TYPES.GOOGLE} provider`,
        true,
        true,
      );
      expect(mockWebview.html).toBe("<html>Active Session</html>");
    });

    it("should handle WCA provider without authentication", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      vi.mocked(mockLightspeedUser.getLightspeedUserContent).mockResolvedValue(
        "",
      );

      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewContentWithLoginForm).toHaveBeenCalledWith(
        mockWebview,
        mockExtensionUri,
      );
      expect(mockWebview.html).toBe("<html>Login Form</html>");
    });

    it("should refresh webview content when settings change", async () => {
      // Initial setup with Google
      await provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.stringContaining("google"),
        expect.anything(),
        expect.anything(),
      );

      // Switch to WCA
      vi.clearAllMocks();
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };
      vi.mocked(mockLightspeedUser.getLightspeedUserContent).mockResolvedValue(
        "Test User",
      );

      await provider.refreshWebView();

      expect(getWebviewContentWithActiveSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "Test User",
        expect.anything(),
        expect.anything(),
      );
    });
  });
});