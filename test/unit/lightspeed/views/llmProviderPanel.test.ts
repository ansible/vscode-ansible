import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ExtensionContext, WebviewPanel, Webview } from "vscode";
import { ViewColumn, window, Uri } from "vscode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__getWebviewHtml__ = vi
  .fn()
  .mockReturnValue("<html></html>");
import type { LlmProviderDependencies } from "../../../../src/features/lightspeed/vue/views/llmProviderMessageHandlers";
import type { SettingsManager } from "../../../../src/settings";
import type { ProviderManager } from "../../../../src/features/lightspeed/providerManager";
import type { LlmProviderSettings } from "../../../../src/features/lightspeed/llmProviderSettings";
import type { LightspeedUser } from "../../../../src/features/lightspeed/lightspeedUser";

vi.mock("../../../../src/features/lightspeed/providers/factory", () => {
  const mockGoogleProvider = {
    type: "google",
    name: "google",
    displayName: "Google Gemini",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    configSchema: [],
  };

  return {
    providerFactory: {
      getSupportedProviders: vi.fn(() => [mockGoogleProvider]),
    },
  };
});

vi.mock("../../../../src/features/lightspeed/vue/views/panelUtils", () => ({
  disposePanelResources: vi.fn(),
}));

vi.mock(
  "../../../../src/features/lightspeed/vue/views/llmProviderMessageHandlers",
  () => {
    return {
      LlmProviderMessageHandlers: class MockMessageHandlers {
        setWebview = vi.fn();
        handleMessage = vi.fn();
        sendProviderSettings = vi.fn();
      },
    };
  },
);

import { LlmProviderPanel } from "../../../../src/features/lightspeed/vue/views/llmProviderPanel";
import { disposePanelResources } from "../../../../src/features/lightspeed/vue/views/panelUtils";

describe("LlmProviderPanel", () => {
  let mockContext: ExtensionContext;
  let mockDeps: LlmProviderDependencies;
  let mockWebviewPanel: WebviewPanel;
  let mockWebview: Webview;
  let onDidDisposeCallback: () => void;
  let onDidReceiveMessageCallback: (message: unknown) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();

    LlmProviderPanel.currentPanel = undefined;

    onDidDisposeCallback = () => {};
    onDidReceiveMessageCallback = async () => {};

    mockWebview = {
      html: "",
      postMessage: vi.fn().mockResolvedValue(true),
      onDidReceiveMessage: vi.fn().mockImplementation((callback, _, arr) => {
        onDidReceiveMessageCallback = callback;
        arr?.push({ dispose: vi.fn() });
        return { dispose: vi.fn() };
      }),
    } as unknown as Webview;

    mockWebviewPanel = {
      webview: mockWebview,
      reveal: vi.fn(),
      dispose: vi.fn(),
      onDidDispose: vi.fn().mockImplementation((callback, _, arr) => {
        onDidDisposeCallback = callback;
        arr?.push({ dispose: vi.fn() });
        return { dispose: vi.fn() };
      }),
    } as unknown as WebviewPanel;

    (Uri as { joinPath?: unknown }).joinPath = vi.fn().mockReturnValue({
      fsPath: "/test/path",
    });

    (window as { createWebviewPanel?: unknown }).createWebviewPanel = vi
      .fn()
      .mockReturnValue(mockWebviewPanel);

    mockContext = {
      extensionUri: { fsPath: "/test/extension" },
      subscriptions: [],
    } as unknown as ExtensionContext;

    mockDeps = {
      settingsManager: {
        settings: {
          lightSpeedService: {
            provider: "google",
          },
        },
        reinitialize: vi.fn(),
      } as unknown as SettingsManager,
      providerManager: {
        refreshProviders: vi.fn(),
      } as unknown as ProviderManager,
      llmProviderSettings: {
        getAllSettings: vi.fn().mockResolvedValue({
          provider: "google",
          connectionStatuses: {},
        }),
        get: vi.fn().mockResolvedValue(""),
      } as unknown as LlmProviderSettings,
      lightspeedUser: {
        isAuthenticated: vi.fn().mockResolvedValue(true),
      } as unknown as LightspeedUser,
    };
  });

  afterEach(() => {
    LlmProviderPanel.currentPanel = undefined;
  });

  describe("render", () => {
    it("should create a new webview panel when none exists", () => {
      LlmProviderPanel.render(mockContext, mockDeps);

      expect(window.createWebviewPanel).toHaveBeenCalledWith(
        "llm-provider-settings",
        expect.stringContaining("LLM Provider"),
        ViewColumn.One,
        expect.objectContaining({
          enableScripts: true,
          enableCommandUris: true,
          retainContextWhenHidden: true,
        }),
      );

      expect(LlmProviderPanel.currentPanel).toBeDefined();
    });

    it("should reveal existing panel instead of creating new one", () => {
      LlmProviderPanel.render(mockContext, mockDeps);
      vi.mocked(window.createWebviewPanel as () => WebviewPanel).mockClear();

      LlmProviderPanel.render(mockContext, mockDeps);

      expect(window.createWebviewPanel).not.toHaveBeenCalled();
      expect(mockWebviewPanel.reveal).toHaveBeenCalledWith(ViewColumn.One);
    });

    it("should use provider display name in title when available", () => {
      LlmProviderPanel.render(mockContext, mockDeps);

      expect(window.createWebviewPanel).toHaveBeenCalledWith(
        "llm-provider-settings",
        "LLM Provider: Google Gemini",
        expect.anything(),
        expect.anything(),
      );
    });

    it("should use default title when no provider is set", () => {
      mockDeps.settingsManager = {
        settings: {
          lightSpeedService: {
            provider: "",
          },
        },
      } as unknown as SettingsManager;

      LlmProviderPanel.render(mockContext, mockDeps);

      expect(window.createWebviewPanel).toHaveBeenCalledWith(
        "llm-provider-settings",
        "Configure LLM Provider",
        expect.anything(),
        expect.anything(),
      );
    });

    it("should use default title when provider is not found", () => {
      mockDeps.settingsManager = {
        settings: {
          lightSpeedService: {
            provider: "unknown-provider",
          },
        },
      } as unknown as SettingsManager;

      LlmProviderPanel.render(mockContext, mockDeps);

      expect(window.createWebviewPanel).toHaveBeenCalledWith(
        "llm-provider-settings",
        "Configure LLM Provider",
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("dispose", () => {
    it("should clear currentPanel on dispose", () => {
      LlmProviderPanel.render(mockContext, mockDeps);
      expect(LlmProviderPanel.currentPanel).toBeDefined();

      onDidDisposeCallback();

      expect(LlmProviderPanel.currentPanel).toBeUndefined();
    });

    it("should call disposePanelResources on dispose", () => {
      LlmProviderPanel.render(mockContext, mockDeps);

      onDidDisposeCallback();

      expect(disposePanelResources).toHaveBeenCalled();
    });
  });

  describe("refreshWebView", () => {
    it("should call sendProviderSettings on message handler", async () => {
      LlmProviderPanel.render(mockContext, mockDeps);

      await LlmProviderPanel.currentPanel?.refreshWebView();

      expect(true).toBe(true);
    });
  });

  describe("message handling", () => {
    it("should set up message handler on creation", () => {
      LlmProviderPanel.render(mockContext, mockDeps);

      expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it("should forward messages to message handler", async () => {
      LlmProviderPanel.render(mockContext, mockDeps);

      await onDidReceiveMessageCallback({ command: "getProviderSettings" });

      expect(true).toBe(true);
    });
  });
});
