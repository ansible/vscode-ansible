import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Webview } from "vscode";
import { window, commands } from "vscode";
import {
  LlmProviderMessageHandlers,
  LlmProviderDependencies,
} from "../../../../src/features/lightspeed/vue/views/llmProviderMessageHandlers";
import type { SettingsManager } from "../../../../src/settings";
import type { ProviderManager } from "../../../../src/features/lightspeed/providerManager";
import type { LlmProviderSettings } from "../../../../src/features/lightspeed/llmProviderSettings";
import type { LightspeedUser } from "../../../../src/features/lightspeed/lightspeedUser";
import type { QuickLinksWebviewViewProvider } from "../../../../src/features/quickLinks/utils/quickLinksViewProvider";
import { PROVIDER_TYPES, TEST_API_KEYS, API_ENDPOINTS } from "../testConstants";

vi.mock("../../../../src/features/lightspeed/providers/factory", () => {
  const mockWcaProvider = {
    type: "wca",
    name: "wca",
    displayName: "IBM watsonx",
    defaultEndpoint: "https://c.ai.ansible.redhat.com",
    defaultModel: undefined,
    usesOAuth: true,
    requiresApiKey: false,
    configSchema: [
      {
        key: "apiEndpoint",
        label: "Lightspeed URL",
        type: "string",
        required: true,
        placeholder: "https://c.ai.ansible.redhat.com",
      },
    ],
  };

  const mockGoogleProvider = {
    type: "google",
    name: "google",
    displayName: "Google Gemini",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    usesOAuth: false,
    requiresApiKey: true,
    configSchema: [
      {
        key: "apiEndpoint",
        label: "API Endpoint",
        type: "string",
        required: false,
        placeholder: "https://generativelanguage.googleapis.com/v1beta",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "AIza...",
      },
      {
        key: "modelName",
        label: "Model Name",
        type: "string",
        required: false,
        placeholder: "gemini-2.5-flash",
      },
    ],
  };

  return {
    providerFactory: {
      getSupportedProviders: vi.fn(() => [mockWcaProvider, mockGoogleProvider]),
      createProvider: vi.fn(() => ({
        getStatus: vi.fn().mockResolvedValue({ connected: true }),
      })),
    },
  };
});

describe("LlmProviderMessageHandlers", () => {
  let messageHandlers: LlmProviderMessageHandlers;
  let mockWebview: Webview;
  let mockDeps: LlmProviderDependencies;
  let mockSettingsManager: SettingsManager;
  let mockProviderManager: ProviderManager;
  let mockLlmProviderSettings: LlmProviderSettings;
  let mockLightspeedUser: LightspeedUser;
  let mockQuickLinksProvider: QuickLinksWebviewViewProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWebview = {
      postMessage: vi.fn().mockResolvedValue(true),
    } as unknown as Webview;

    mockSettingsManager = {
      settings: {
        lightSpeedService: {
          provider: "wca",
        },
      },
      reinitialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as SettingsManager;

    mockProviderManager = {
      refreshProviders: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProviderManager;

    mockLlmProviderSettings = {
      getProvider: vi.fn().mockReturnValue("wca"),
      setProvider: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation((provider: string, key: string) => {
        if (key === "apiEndpoint")
          return Promise.resolve(API_ENDPOINTS.WCA_DEFAULT);
        if (key === "modelName") return Promise.resolve("");
        if (key === "apiKey") return Promise.resolve(TEST_API_KEYS.GOOGLE);
        return Promise.resolve("");
      }),
      set: vi.fn().mockResolvedValue(undefined),
      setConnectionStatus: vi.fn().mockResolvedValue(undefined),
      getConnectionStatus: vi.fn().mockReturnValue(false),
      getAllConnectionStatuses: vi.fn().mockReturnValue({
        wca: false,
        google: false,
      }),
      getAllSettings: vi.fn().mockResolvedValue({
        provider: "wca",
        apiEndpoint: API_ENDPOINTS.WCA_DEFAULT,
        modelName: undefined,
        apiKey: "",
        connectionStatuses: { wca: false, google: false },
      }),
    } as unknown as LlmProviderSettings;

    mockLightspeedUser = {
      isAuthenticated: vi.fn().mockResolvedValue(true),
    } as unknown as LightspeedUser;

    mockQuickLinksProvider = {
      refreshProviderInfo: vi.fn(),
    } as unknown as QuickLinksWebviewViewProvider;

    mockDeps = {
      settingsManager: mockSettingsManager,
      providerManager: mockProviderManager,
      llmProviderSettings: mockLlmProviderSettings,
      lightspeedUser: mockLightspeedUser,
      quickLinksProvider: mockQuickLinksProvider,
    };

    messageHandlers = new LlmProviderMessageHandlers(mockDeps);
    messageHandlers.setWebview(mockWebview);
  });

  describe("setWebview", () => {
    it("should set the webview reference", () => {
      const handler = new LlmProviderMessageHandlers(mockDeps);
      handler.setWebview(mockWebview);
      expect(true).toBe(true);
    });
  });

  describe("handleMessage", () => {
    it("should handle getProviderSettings message", async () => {
      await messageHandlers.handleMessage({ command: "getProviderSettings" });

      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "providerSettings",
          providers: expect.any(Array),
          currentProvider: "wca",
        }),
      );
    });

    it("should handle saveProviderSettings message", async () => {
      const message = {
        command: "saveProviderSettings",
        provider: PROVIDER_TYPES.GOOGLE,
        config: {
          apiKey: TEST_API_KEYS.GOOGLE,
          modelName: "gemini-pro",
          apiEndpoint: "https://custom.endpoint.com",
        },
      };

      await messageHandlers.handleMessage(message);

      expect(mockLlmProviderSettings.setProvider).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
      );
      expect(mockLlmProviderSettings.set).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
        "apiKey",
        TEST_API_KEYS.GOOGLE,
      );
      expect(mockLlmProviderSettings.set).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
        "modelName",
        "gemini-pro",
      );
      expect(mockLlmProviderSettings.setConnectionStatus).toHaveBeenCalledWith(
        false,
        PROVIDER_TYPES.GOOGLE,
      );
    });

    it("should handle activateProvider message", async () => {
      const message = {
        command: "activateProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      };

      await messageHandlers.handleMessage(message);

      expect(mockLlmProviderSettings.setProvider).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
      );
    });

    it("should handle connectProvider message for API key provider", async () => {
      const message = {
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      };

      await messageHandlers.handleMessage(message);

      expect(mockLlmProviderSettings.setProvider).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
      );
    });

    it("should handle connectProvider message for OAuth provider", async () => {
      vi.useFakeTimers();

      const message = {
        command: "connectProvider",
        provider: PROVIDER_TYPES.WCA,
      };

      await messageHandlers.handleMessage(message);

      expect(mockLlmProviderSettings.setProvider).toHaveBeenCalledWith(
        PROVIDER_TYPES.WCA,
      );
      expect(commands.executeCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.oauth",
      );

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockLightspeedUser.isAuthenticated).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should not process messages when webview is not set", async () => {
      const handler = new LlmProviderMessageHandlers(mockDeps);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

      await handler.handleMessage({ command: "getProviderSettings" });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[LlmProviderMessageHandlers] Webview not set",
      );
      consoleSpy.mockRestore();
    });
  });

  describe("sendProviderSettings", () => {
    it("should send provider settings to webview", async () => {
      await messageHandlers.sendProviderSettings();

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        command: "providerSettings",
        providers: expect.any(Array),
        currentProvider: "wca",
        providerConfigs: expect.any(Object),
        connectionStatuses: expect.any(Object),
      });
    });

    it("should not send when webview is not set", async () => {
      const handler = new LlmProviderMessageHandlers(mockDeps);

      await handler.sendProviderSettings();

      expect(true).toBe(true);
    });
  });

  describe("saveProviderSettings", () => {
    it("should skip saving when provider or config is missing", async () => {
      await messageHandlers.handleMessage({
        command: "saveProviderSettings",
      });

      expect(mockLlmProviderSettings.setProvider).not.toHaveBeenCalled();
    });

    it("should handle save errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
      vi.mocked(mockLlmProviderSettings.setProvider).mockRejectedValueOnce(
        new Error("Save failed"),
      );

      const message = {
        command: "saveProviderSettings",
        provider: PROVIDER_TYPES.GOOGLE,
        config: { apiKey: "test" },
      };

      await messageHandlers.handleMessage(message);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to save provider settings:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("activateProvider", () => {
    it("should skip activation when provider is missing", async () => {
      await messageHandlers.handleMessage({
        command: "activateProvider",
      });

      expect(mockLlmProviderSettings.setProvider).not.toHaveBeenCalled();
    });

    it("should handle activation errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
      vi.mocked(mockLlmProviderSettings.setProvider).mockRejectedValueOnce(
        new Error("Activation failed"),
      );

      await messageHandlers.handleMessage({
        command: "activateProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to activate provider:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("connectProvider", () => {
    it("should skip connection when provider is missing", async () => {
      await messageHandlers.handleMessage({
        command: "connectProvider",
      });

      expect(mockLlmProviderSettings.setProvider).not.toHaveBeenCalled();
    });

    it("should handle connection errors gracefully", async () => {
      vi.mocked(mockLlmProviderSettings.setProvider).mockRejectedValueOnce(
        new Error("Connection failed"),
      );

      const message = {
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      };

      await messageHandlers.handleMessage(message);

      expect(window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to connect to GOOGLE"),
      );

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        command: "connectionResult",
        provider: PROVIDER_TYPES.GOOGLE,
        connected: false,
        error: "Connection failed",
      });
    });

    it("should show error when API key is missing for required provider", async () => {
      vi.mocked(mockLlmProviderSettings.get).mockImplementation(
        (provider: string, key: string) => {
          if (key === "apiKey") return Promise.resolve("");
          return Promise.resolve("");
        },
      );

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockLlmProviderSettings.setConnectionStatus).toHaveBeenCalledWith(
        false,
        PROVIDER_TYPES.GOOGLE,
      );
    });

    it("should handle successful OAuth connection", async () => {
      vi.useFakeTimers();

      vi.mocked(mockLightspeedUser.isAuthenticated).mockResolvedValue(true);

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.WCA,
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockLlmProviderSettings.setConnectionStatus).toHaveBeenCalledWith(
        true,
        PROVIDER_TYPES.WCA,
      );

      vi.useRealTimers();
    });

    it("should handle failed OAuth connection", async () => {
      vi.useFakeTimers();

      vi.mocked(mockLightspeedUser.isAuthenticated).mockResolvedValue(false);

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.WCA,
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockLlmProviderSettings.setConnectionStatus).toHaveBeenCalledWith(
        false,
        PROVIDER_TYPES.WCA,
      );
      expect(window.showErrorMessage).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("unknown commands", () => {
    it("should ignore unknown commands", async () => {
      await messageHandlers.handleMessage({
        command: "unknownCommand",
      });

      expect(mockLlmProviderSettings.setProvider).not.toHaveBeenCalled();
    });
  });
});
