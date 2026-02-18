import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Webview } from "vscode";
import { window, commands } from "vscode";
import {
  LlmProviderMessageHandlers,
  LlmProviderDependencies,
} from "@src/features/lightspeed/vue/views/llmProviderMessageHandlers";
import type { SettingsManager } from "@src/settings";
import type { ProviderManager } from "@src/features/lightspeed/providerManager";
import type { LlmProviderSettings } from "@src/features/lightspeed/llmProviderSettings";
import type { LightspeedUser } from "@src/features/lightspeed/lightspeedUser";
import type { QuickLinksWebviewViewProvider } from "@src/features/quickLinks/utils/quickLinksViewProvider";
import { PROVIDER_TYPES, TEST_API_KEYS, API_ENDPOINTS } from "../testConstants";

const mockWcaProvider = {
  type: "wca" as const,
  name: "wca",
  displayName: "IBM watsonx",
  description: "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant",
  defaultEndpoint: "https://c.ai.ansible.redhat.com",
  defaultModel: undefined,
  usesOAuth: true,
  requiresApiKey: false,
  configSchema: [
    {
      key: "apiEndpoint",
      label: "Lightspeed URL",
      type: "string" as const,
      required: true,
      placeholder: "https://c.ai.ansible.redhat.com",
    },
  ],
};

const mockGoogleProvider = {
  type: "google" as const,
  name: "google",
  displayName: "Google Gemini",
  description: "Direct access to Google Gemini models",
  defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
  defaultModel: "gemini-2.5-flash",
  usesOAuth: false,
  requiresApiKey: true,
  configSchema: [
    {
      key: "apiEndpoint",
      label: "API Endpoint",
      type: "string" as const,
      required: false,
      placeholder: "https://generativelanguage.googleapis.com/v1beta",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password" as const,
      required: true,
      placeholder: "AIza...",
    },
    {
      key: "modelName",
      label: "Model Name",
      type: "string" as const,
      required: false,
      placeholder: "gemini-2.5-flash",
    },
  ],
};

vi.mock("@src/features/lightspeed/providers/factory", () => ({
  providerFactory: {
    getSupportedProviders: vi.fn(() => [mockWcaProvider, mockGoogleProvider]),
    createProvider: vi.fn(() => ({
      getStatus: vi.fn().mockResolvedValue({ connected: true }),
    })),
  },
}));

import { providerFactory } from "@src/features/lightspeed/providers/factory";

describe("LlmProviderMessageHandlers", () => {
  let messageHandlers: LlmProviderMessageHandlers;
  let mockWebview: Webview;
  let mockDeps: LlmProviderDependencies;
  let mockSettingsManager: SettingsManager;
  let mockProviderManager: ProviderManager;
  let mockLlmProviderSettings: LlmProviderSettings;
  let mockLightspeedUser: LightspeedUser;
  let mockQuickLinksProvider: QuickLinksWebviewViewProvider;

  let mockPostMessage: ReturnType<typeof vi.fn>;
  let mockSetProvider: ReturnType<typeof vi.fn>;
  let mockSet: ReturnType<typeof vi.fn>;
  let mockGet: ReturnType<typeof vi.fn>;
  let mockSetConnectionStatus: ReturnType<typeof vi.fn>;
  let mockIsAuthenticated: ReturnType<typeof vi.fn>;
  let mockReinitialize: ReturnType<typeof vi.fn>;
  let mockRefreshProviderInfo: ReturnType<typeof vi.fn>;

  const mockedCommands = vi.mocked(commands);
  const mockedWindow = vi.mocked(window);

  const mockedGetSupportedProviders = vi.mocked(
    // eslint-disable-next-line @typescript-eslint/unbound-method
    providerFactory.getSupportedProviders,
  );
  const mockedCreateProvider = vi.mocked(
    // eslint-disable-next-line @typescript-eslint/unbound-method
    providerFactory.createProvider,
  );

  beforeEach(() => {
    vi.clearAllMocks();

    mockedGetSupportedProviders.mockReturnValue([
      mockWcaProvider,
      mockGoogleProvider,
    ]);
    mockedCreateProvider.mockReturnValue({
      getStatus: vi.fn().mockResolvedValue({ connected: true }),
    } as unknown as ReturnType<typeof providerFactory.createProvider>);

    mockPostMessage = vi.fn().mockResolvedValue(true);
    mockSetProvider = vi.fn().mockResolvedValue(undefined);
    mockSet = vi.fn().mockResolvedValue(undefined);
    mockGet = vi.fn().mockImplementation((provider: string, key: string) => {
      if (key === "apiEndpoint")
        return Promise.resolve(API_ENDPOINTS.WCA_DEFAULT);
      if (key === "modelName") return Promise.resolve("");
      if (key === "apiKey") return Promise.resolve(TEST_API_KEYS.GOOGLE);
      return Promise.resolve("");
    });
    mockSetConnectionStatus = vi.fn().mockResolvedValue(undefined);
    mockIsAuthenticated = vi.fn().mockResolvedValue(true);
    mockReinitialize = vi.fn().mockResolvedValue(undefined);
    mockRefreshProviderInfo = vi.fn();

    mockWebview = {
      postMessage: mockPostMessage,
    } as unknown as Webview;

    mockSettingsManager = {
      settings: {
        lightSpeedService: {
          provider: "wca",
        },
      },
      reinitialize: mockReinitialize,
    } as unknown as SettingsManager;

    mockProviderManager = {
      refreshProviders: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProviderManager;

    mockLlmProviderSettings = {
      getProvider: vi.fn().mockReturnValue("wca"),
      setProvider: mockSetProvider,
      get: mockGet,
      set: mockSet,
      setConnectionStatus: mockSetConnectionStatus,
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
      isAuthenticated: mockIsAuthenticated,
    } as unknown as LightspeedUser;

    mockQuickLinksProvider = {
      refreshProviderInfo: mockRefreshProviderInfo,
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

      expect(mockPostMessage).toHaveBeenCalledWith(
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

      expect(mockSetProvider).toHaveBeenCalledWith(PROVIDER_TYPES.GOOGLE);
      expect(mockSet).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
        "apiKey",
        TEST_API_KEYS.GOOGLE,
      );
      expect(mockSet).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
        "modelName",
        "gemini-pro",
      );
      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
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

      expect(mockSetProvider).toHaveBeenCalledWith(PROVIDER_TYPES.GOOGLE);
    });

    it("should handle connectProvider message for API key provider", async () => {
      const message = {
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      };

      await messageHandlers.handleMessage(message);

      expect(mockSetProvider).toHaveBeenCalledWith(PROVIDER_TYPES.GOOGLE);
    });

    it("should handle connectProvider message for OAuth provider", async () => {
      vi.useFakeTimers();

      const message = {
        command: "connectProvider",
        provider: PROVIDER_TYPES.WCA,
      };

      await messageHandlers.handleMessage(message);

      expect(mockSetProvider).toHaveBeenCalledWith(PROVIDER_TYPES.WCA);
      expect(mockedCommands.executeCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.oauth",
      );

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockIsAuthenticated).toHaveBeenCalled();

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

      expect(mockPostMessage).toHaveBeenCalledWith({
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

      expect(mockSetProvider).not.toHaveBeenCalled();
    });

    it("should handle save errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
      mockSetProvider.mockRejectedValueOnce(new Error("Save failed"));

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

      expect(mockSetProvider).not.toHaveBeenCalled();
    });

    it("should handle activation errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
      mockSetProvider.mockRejectedValueOnce(new Error("Activation failed"));

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

      expect(mockSetProvider).not.toHaveBeenCalled();
    });

    it("should handle connection errors gracefully", async () => {
      mockSetProvider.mockRejectedValueOnce(new Error("Connection failed"));

      const message = {
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      };

      await messageHandlers.handleMessage(message);

      expect(mockedWindow.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to connect to GOOGLE"),
      );

      expect(mockPostMessage).toHaveBeenCalledWith({
        command: "connectionResult",
        provider: PROVIDER_TYPES.GOOGLE,
        connected: false,
        error: "Connection failed",
      });
    });

    it("should show error when API key is missing for required provider", async () => {
      mockGet.mockImplementation((provider: string, key: string) => {
        if (key === "apiKey") return Promise.resolve("");
        return Promise.resolve("");
      });

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
        false,
        PROVIDER_TYPES.GOOGLE,
      );
    });

    it("should handle successful OAuth connection", async () => {
      vi.useFakeTimers();

      mockIsAuthenticated.mockResolvedValue(true);

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.WCA,
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
        true,
        PROVIDER_TYPES.WCA,
      );

      vi.useRealTimers();
    });

    it("should handle failed OAuth connection", async () => {
      vi.useFakeTimers();

      mockIsAuthenticated.mockResolvedValue(false);

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.WCA,
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
        false,
        PROVIDER_TYPES.WCA,
      );
      expect(mockedWindow.showErrorMessage).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("unknown commands", () => {
    it("should ignore unknown commands", async () => {
      await messageHandlers.handleMessage({
        command: "unknownCommand",
      });

      expect(mockSetProvider).not.toHaveBeenCalled();
    });
  });

  describe("validateProviderConnection", () => {
    it("should return connected true when provider validates successfully", async () => {
      const message = {
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      };

      await messageHandlers.handleMessage(message);

      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
        true,
        PROVIDER_TYPES.GOOGLE,
      );
    });

    it("should return connected false when provider.getStatus returns not connected", async () => {
      mockedCreateProvider.mockReturnValueOnce({
        getStatus: vi
          .fn()
          .mockResolvedValue({ connected: false, error: "Invalid API key" }),
      } as unknown as ReturnType<typeof providerFactory.createProvider>);

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
        false,
        PROVIDER_TYPES.GOOGLE,
      );
    });

    it("should handle status with no error message", async () => {
      mockedCreateProvider.mockReturnValueOnce({
        getStatus: vi.fn().mockResolvedValue({ connected: false }),
      } as unknown as ReturnType<typeof providerFactory.createProvider>);

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockedWindow.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to connect"),
      );
    });

    it("should handle exception during validation", async () => {
      mockedCreateProvider.mockImplementationOnce(() => {
        throw new Error("Network error");
      });

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
        false,
        PROVIDER_TYPES.GOOGLE,
      );
    });

    it("should handle non-Error exception during validation", async () => {
      mockedCreateProvider.mockImplementationOnce(() => {
        throw "String error";
      });

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
        false,
        PROVIDER_TYPES.GOOGLE,
      );
    });
  });

  describe("handleConnectionResult", () => {
    it("should show information message on successful connection", async () => {
      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockedWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("Successfully connected"),
      );
    });

    it("should post connection result to webview on success", async () => {
      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "connectionResult",
          provider: PROVIDER_TYPES.GOOGLE,
          connected: true,
        }),
      );
    });
  });

  describe("saveProviderSettings with configSchema", () => {
    it("should skip apiKey field when provider does not require it", async () => {
      const message = {
        command: "saveProviderSettings",
        provider: PROVIDER_TYPES.WCA,
        config: {
          apiEndpoint: "https://custom.endpoint.com",
          apiKey: "should-be-skipped",
        },
      };

      await messageHandlers.handleMessage(message);

      expect(mockSet).not.toHaveBeenCalledWith(
        PROVIDER_TYPES.WCA,
        "apiKey",
        expect.anything(),
      );
    });

    it("should save all fields from configSchema for provider that requires API key", async () => {
      const message = {
        command: "saveProviderSettings",
        provider: PROVIDER_TYPES.GOOGLE,
        config: {
          apiEndpoint: "https://custom.endpoint.com",
          apiKey: TEST_API_KEYS.GOOGLE,
          modelName: "gemini-pro",
        },
      };

      await messageHandlers.handleMessage(message);

      expect(mockSet).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
        "apiEndpoint",
        "https://custom.endpoint.com",
      );
      expect(mockSet).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
        "apiKey",
        TEST_API_KEYS.GOOGLE,
      );
      expect(mockSet).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
        "modelName",
        "gemini-pro",
      );
    });
  });

  describe("updateAndNotify", () => {
    it("should refresh quickLinksProvider when available", async () => {
      await messageHandlers.handleMessage({
        command: "activateProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockRefreshProviderInfo).toHaveBeenCalled();
    });

    it("should call settingsManager.reinitialize", async () => {
      await messageHandlers.handleMessage({
        command: "activateProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockReinitialize).toHaveBeenCalled();
    });
  });

  describe("provider display name fallback", () => {
    it("should use uppercase provider type when displayName is not available", async () => {
      mockedGetSupportedProviders.mockReturnValueOnce([
        {
          type: "google" as const,
          name: "google",
          displayName: "",
          description: "",
          defaultEndpoint: "",
          configSchema: [],
          requiresApiKey: true,
        },
      ]);

      mockGet.mockImplementation(() => Promise.resolve("test-key"));

      await messageHandlers.handleMessage({
        command: "connectProvider",
        provider: "google",
      });

      expect(mockedWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("GOOGLE"),
      );
    });
  });

  describe("handleConnectProvider edge cases", () => {
    it("should not process when webview is not set", async () => {
      const handler = new LlmProviderMessageHandlers(mockDeps);

      await handler.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockSetProvider).not.toHaveBeenCalled();
    });

    it("should handle OAuth connection when providerInfo is undefined", async () => {
      vi.useFakeTimers();

      mockedGetSupportedProviders.mockReturnValue([]);

      const handlerWithNoProviders = new LlmProviderMessageHandlers(mockDeps);
      handlerWithNoProviders.setWebview(mockWebview);

      await handlerWithNoProviders.handleMessage({
        command: "connectProvider",
        provider: "unknown",
      });

      expect(mockSetProvider).toHaveBeenCalledWith("unknown");

      vi.useRealTimers();
    });
  });

  describe("updateAndNotify error handling", () => {
    it("should handle refreshProviders error gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

      const mockProviderManagerWithError = {
        refreshProviders: vi
          .fn()
          .mockRejectedValue(new Error("Refresh failed")),
      } as unknown as ProviderManager;

      const depsWithError: LlmProviderDependencies = {
        ...mockDeps,
        providerManager: mockProviderManagerWithError,
      };

      const handlerWithError = new LlmProviderMessageHandlers(depsWithError);
      handlerWithError.setWebview(mockWebview);

      await handlerWithError.handleMessage({
        command: "activateProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockReinitialize).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("saveProviderSettings with unknown provider", () => {
    it("should handle unknown provider type gracefully", async () => {
      mockedGetSupportedProviders.mockReturnValue([
        mockWcaProvider,
        mockGoogleProvider,
      ]);

      await messageHandlers.handleMessage({
        command: "saveProviderSettings",
        provider: "unknown-provider",
        config: {
          apiKey: "test-key",
        },
      });

      expect(mockSetProvider).toHaveBeenCalledWith("unknown-provider");
      expect(mockSetConnectionStatus).toHaveBeenCalledWith(
        false,
        "unknown-provider",
      );
    });
  });

  describe("handleConnectionResult without webview", () => {
    it("should not crash when handleConnectionResult is called indirectly without webview", async () => {
      const handler = new LlmProviderMessageHandlers(mockDeps);

      await handler.handleMessage({
        command: "connectProvider",
        provider: PROVIDER_TYPES.GOOGLE,
      });

      expect(mockSetConnectionStatus).not.toHaveBeenCalled();
    });
  });

  describe("sendProviderSettings builds correct config", () => {
    it("should build provider configs dynamically from configSchema", async () => {
      await messageHandlers.sendProviderSettings();

      expect(mockGet).toHaveBeenCalledWith("wca", "apiEndpoint");
      expect(mockGet).toHaveBeenCalledWith("google", "apiEndpoint");
      expect(mockGet).toHaveBeenCalledWith("google", "apiKey");
      expect(mockGet).toHaveBeenCalledWith("google", "modelName");
    });
  });

  describe("connectWithApiKey with undefined providerInfo", () => {
    it("should use uppercase fallback for displayName when providerInfo is undefined", async () => {
      mockedGetSupportedProviders.mockReturnValue([]);

      const handlerNoProviders = new LlmProviderMessageHandlers(mockDeps);
      handlerNoProviders.setWebview(mockWebview);

      await handlerNoProviders.handleMessage({
        command: "connectProvider",
        provider: "custom",
      });

      expect(mockedWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("CUSTOM"),
      );
    });
  });
});
