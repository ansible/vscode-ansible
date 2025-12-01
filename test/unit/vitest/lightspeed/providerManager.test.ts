import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderManager } from "../../../../src/features/lightspeed/providerManager";
import type { SettingsManager } from "../../../../src/settings";
import type { LightSpeedAPI } from "../../../../src/features/lightspeed/api";
import type {
  LLMProvider,
  ProviderStatus,
} from "../../../../src/features/lightspeed/providers/base";
import {
  PROVIDER_TYPES,
  MODEL_NAMES,
  GOOGLE_PROVIDER,
  TEST_LIGHTSPEED_SETTINGS,
  TEST_PROMPTS,
  TEST_CONTENT,
  TEST_RESPONSES,
} from "./testConstants";

vi.mock("../../../../src/features/lightspeed/providers/factory", () => {
  const mockGoogleProvider: LLMProvider = {
    name: "google",
    displayName: "Google Gemini",
    completionRequest: vi.fn(),
    chatRequest: vi.fn(),
    generatePlaybook: vi.fn(),
    generateRole: vi.fn(),
    validateConfig: vi.fn(),
    getStatus: vi.fn(),
  };

  return {
    providerFactory: {
      createProvider: vi.fn(() => mockGoogleProvider),
      getSupportedProviders: vi.fn(() => [
        {
          type: "wca",
          name: "wca",
          displayName:
            "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant",
          description: "Official Red Hat Ansible Lightspeed service",
        },
        {
          type: "google",
          name: "google",
          displayName: "Google Gemini",
          description: "Direct access to Google Gemini models",
        },
      ]),
      validateProviderConfig: vi.fn(),
    },
    __mockGoogleProvider: mockGoogleProvider,
  };
});

// Mock isError utility
vi.mock("../../../../src/features/lightspeed/utils/errors", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isError: vi.fn((response: any) => {
    return (
      response &&
      (response.code || response.message) &&
      !response.playbook &&
      !response.role
    );
  }),
}));

// Import after mocks
import { providerFactory } from "../../../../src/features/lightspeed/providers/factory";
import { isError } from "../../../../src/features/lightspeed/utils/errors";

describe("ProviderManager", () => {
  let providerManager: ProviderManager;
  let mockSettingsManager: SettingsManager;
  let mockWcaApi: LightSpeedAPI;
  let mockLlmProvider: LLMProvider;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock settings manager with Google provider
    mockSettingsManager = {
      settings: {
        lightSpeedService: {
          ...TEST_LIGHTSPEED_SETTINGS.GOOGLE_FULL,
        },
      },
    } as unknown as SettingsManager;

    // Setup mock WCA API
    mockWcaApi = {
      completionRequest: vi.fn(),
      playbookGenerationRequest: vi.fn(),
      roleGenerationRequest: vi.fn(),
    } as unknown as LightSpeedAPI;

    // Get the mock provider from the factory
    const factoryModule = await import(
      "../../../../src/features/lightspeed/providers/factory.js"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLlmProvider = (factoryModule as any).__mockGoogleProvider;

    // Reset mock implementations
    const getStatus = vi.mocked(mockLlmProvider.getStatus);
    const createProvider = vi.mocked(providerFactory.createProvider);
    getStatus.mockResolvedValue({
      connected: true,
      modelInfo: {
        name: MODEL_NAMES.GEMINI_PRO,
        capabilities: ["completion", "chat", "generation"],
      },
    });
    createProvider.mockReturnValue(mockLlmProvider);
  });

  describe("constructor and initialization", () => {
    it("should initialize with Google provider when configured", async () => {
      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);

      // Wait for async initialization
      await new Promise((resolve) => setTimeout(resolve, 0));

      const createProvider2 = vi.mocked(providerFactory.createProvider);
      const getStatus2 = vi.mocked(mockLlmProvider.getStatus);
      expect(createProvider2).toHaveBeenCalledWith(
        PROVIDER_TYPES.GOOGLE,
        mockSettingsManager.settings.lightSpeedService,
      );
      expect(getStatus2).toHaveBeenCalled();
    });

    it("should not initialize provider when lightspeed is disabled", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(providerFactory.createProvider).not.toHaveBeenCalled();
    });

    it("should not initialize provider when provider is WCA", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const createProvider4 = vi.mocked(providerFactory.createProvider);
      expect(createProvider4).not.toHaveBeenCalled();
    });

    it("should handle provider initialization errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {
          // Empty implementation for testing
        });
      vi.mocked(providerFactory.createProvider).mockImplementation(() => {
        throw new Error("Invalid API key");
      });

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to initialize LLM provider:",
        "Invalid API key",
      );

      consoleErrorSpy.mockRestore();
    });

    it("should store error status when provider fails to connect", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {
          // Empty implementation for testing
        });
      vi.mocked(mockLlmProvider.getStatus).mockResolvedValue({
        connected: false,
        error: "API key invalid",
      });

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed to connect"),
        "API key invalid",
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("refreshProviders", () => {
    it("should reinitialize provider on refresh", async () => {
      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      vi.clearAllMocks();

      await providerManager.refreshProviders();

      const createProvider5 = vi.mocked(providerFactory.createProvider);
      const getStatus3 = vi.mocked(mockLlmProvider.getStatus);
      expect(createProvider5).toHaveBeenCalled();
      expect(getStatus3).toHaveBeenCalled();
    });
  });

  describe("getActiveProvider", () => {
    it("should return llmprovider when Google provider is configured", async () => {
      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const activeProvider = providerManager.getActiveProvider();

      expect(activeProvider).toBe("llmprovider");
    });

    it("should return wca when WCA provider is configured", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const activeProvider = providerManager.getActiveProvider();

      expect(activeProvider).toBe("wca");
    });

    it("should return null when lightspeed is disabled", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const activeProvider = providerManager.getActiveProvider();

      expect(activeProvider).toBeNull();
    });

    it("should return llmprovider even when provider initialization failed", async () => {
      vi.mocked(providerFactory.createProvider).mockImplementation(() => {
        throw new Error("Invalid API key");
      });

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const activeProvider = providerManager.getActiveProvider();

      expect(activeProvider).toBe("llmprovider");
    });
  });

  describe("getProviderStatus", () => {
    it("should return WCA status when requested", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = true;
      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const status = providerManager.getProviderStatus("wca");

      expect(status).toEqual({
        connected: true,
        modelInfo: {
          name: "WCA",
          capabilities: ["completion", "chat", "generation", "contentmatching"],
        },
      });
    });

    it("should return Google provider status when requested", async () => {
      const mockStatus: ProviderStatus = {
        connected: true,
        modelInfo: {
          name: MODEL_NAMES.GEMINI_PRO,
          capabilities: ["completion", "chat", "generation"],
        },
      };

      vi.mocked(mockLlmProvider.getStatus).mockResolvedValue(mockStatus);

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const status = providerManager.getProviderStatus("llmprovider");

      expect(status).toEqual(mockStatus);
    });

    it("should return null when provider status not available", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      mockSettingsManager.settings.lightSpeedService.provider =
        "unknown" as any;

      const status = providerManager.getProviderStatus("llmprovider");

      expect(status).toBeNull();
    });
  });

  describe("completionRequest", () => {
    it("should route completion request to Google provider", async () => {
      const mockCompletion = {
        predictions: ["test completion"],
        model: MODEL_NAMES.GEMINI_PRO,
        suggestionId: TEST_RESPONSES.SUGGESTION_ID,
      };

      vi.mocked(mockLlmProvider.completionRequest).mockResolvedValue(
        mockCompletion,
      );

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        suggestionId: TEST_RESPONSES.SUGGESTION_ID,
      };

      const result = await providerManager.completionRequest(params);

      expect(mockLlmProvider.completionRequest).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockCompletion);
    });

    it("should route completion request to WCA", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      const mockCompletion = {
        predictions: ["test completion"],
        model: "wca",
        suggestionId: TEST_RESPONSES.SUGGESTION_ID,
      };

      vi.mocked(mockWcaApi.completionRequest).mockResolvedValue(mockCompletion);

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        suggestionId: TEST_RESPONSES.SUGGESTION_ID,
      };

      const result = await providerManager.completionRequest(params);

      expect(mockWcaApi.completionRequest).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockCompletion);
    });

    it("should throw error when no active provider", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        suggestionId: TEST_RESPONSES.SUGGESTION_ID,
      };

      await expect(providerManager.completionRequest(params)).rejects.toThrow(
        "No active provider available for completion requests",
      );
    });
  });

  describe("chatRequest", () => {
    it("should route chat request to Google provider", async () => {
      const mockChatResponse = {
        message: TEST_RESPONSES.MESSAGE,
        conversationId: TEST_RESPONSES.CONVERSATION_ID_DEFAULT,
        model: MODEL_NAMES.GEMINI_PRO,
      };

      vi.mocked(mockLlmProvider.chatRequest).mockResolvedValue(
        mockChatResponse,
      );

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        message: "How do I install nginx?",
        conversationId: TEST_RESPONSES.CONVERSATION_ID_DEFAULT,
      };

      const result = await providerManager.chatRequest(params);

      expect(mockLlmProvider.chatRequest).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockChatResponse);
    });

    it("should throw error for WCA chat requests", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        message: "How do I install nginx?",
      };

      await expect(providerManager.chatRequest(params)).rejects.toThrow(
        "Chat requests not supported with WCA provider",
      );
    });

    it("should throw error when no active provider", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        message: "How do I install nginx?",
      };

      await expect(providerManager.chatRequest(params)).rejects.toThrow(
        "No active provider available for chat requests",
      );
    });
  });

  describe("generatePlaybook", () => {
    it("should route playbook generation to Google provider", async () => {
      const mockPlaybook = {
        content: TEST_CONTENT.PLAYBOOK,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
        model: MODEL_NAMES.GEMINI_PRO,
      };

      vi.mocked(mockLlmProvider.generatePlaybook).mockResolvedValue(
        mockPlaybook,
      );

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook" as const,
        createOutline: true,
      };

      const result = await providerManager.generatePlaybook(params);

      expect(mockLlmProvider.generatePlaybook).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockPlaybook);
    });

    it("should route playbook generation to WCA", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      const mockWcaResponse = {
        playbook: TEST_CONTENT.PLAYBOOK,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
        generationId: "playbook-gen-123",
      };

      vi.mocked(mockWcaApi.playbookGenerationRequest).mockResolvedValue(
        mockWcaResponse,
      );
      vi.mocked(isError).mockReturnValue(false);

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook" as const,
      };

      const result = await providerManager.generatePlaybook(params);

      expect(mockWcaApi.playbookGenerationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          text: TEST_PROMPTS.INSTALL_NGINX,
          createOutline: true,
        }),
      );
      expect(result).toEqual({
        content: TEST_CONTENT.PLAYBOOK,
        model: "wca",
      });
    });

    it("should throw error when provider not initialized", async () => {
      vi.mocked(providerFactory.createProvider).mockImplementation(() => {
        throw new Error("Invalid API key");
      });

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook" as const,
      };

      await expect(providerManager.generatePlaybook(params)).rejects.toThrow(
        "Invalid API key",
      );
    });

    it("should throw error when WCA returns error response", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      const mockErrorResponse = {
        code: "invalid_request",
        message: "Invalid prompt",
      };

      vi.mocked(mockWcaApi.playbookGenerationRequest).mockResolvedValue(
        mockErrorResponse,
      );
      vi.mocked(isError).mockReturnValue(true);

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook" as const,
      };

      await expect(providerManager.generatePlaybook(params)).rejects.toThrow(
        "Invalid prompt",
      );
    });

    it("should throw error when no active provider", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook" as const,
      };

      await expect(providerManager.generatePlaybook(params)).rejects.toThrow(
        "No active provider available for playbook generation",
      );
    });
  });

  describe("generateRole", () => {
    it("should route role generation to Google provider", async () => {
      const mockRole = {
        content: TEST_CONTENT.ROLE,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
        model: MODEL_NAMES.GEMINI_PRO,
      };

      vi.mocked(mockLlmProvider.generateRole).mockResolvedValue(mockRole);

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role" as const,
        createOutline: true,
      };

      const result = await providerManager.generateRole(params);

      expect(mockLlmProvider.generateRole).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockRole);
    });

    it("should route role generation to WCA", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      const mockWcaResponse = {
        role: TEST_CONTENT.ROLE,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
        generationId: "role-gen-123",
        name: "test-role",
        files: [
          {
            path: "tasks/main.yml",
            file_type: "task" as any,
            content: TEST_CONTENT.ROLE,
          },
        ],
      };

      vi.mocked(mockWcaApi.roleGenerationRequest).mockResolvedValue(
        mockWcaResponse,
      );
      vi.mocked(isError).mockReturnValue(false);

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role" as const,
      };

      const result = await providerManager.generateRole(params);

      expect(mockWcaApi.roleGenerationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          text: TEST_PROMPTS.CREATE_ROLE,
          createOutline: true,
        }),
      );
      expect(result).toEqual({
        content: TEST_CONTENT.ROLE,
        model: "wca",
      });
    });

    it("should throw error when provider not initialized", async () => {
      vi.mocked(providerFactory.createProvider).mockImplementation(() => {
        throw new Error("Invalid API key");
      });

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role" as const,
      };

      await expect(providerManager.generateRole(params)).rejects.toThrow(
        "Invalid API key",
      );
    });

    it("should throw error when WCA returns error response", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      const mockErrorResponse = {
        code: "invalid_request",
        message: "Invalid role prompt",
      };

      vi.mocked(mockWcaApi.roleGenerationRequest).mockResolvedValue(
        mockErrorResponse,
      );
      vi.mocked(isError).mockReturnValue(true);

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role" as const,
      };

      await expect(providerManager.generateRole(params)).rejects.toThrow(
        "Invalid role prompt",
      );
    });

    it("should throw error when no active provider", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const params = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role" as const,
      };

      await expect(providerManager.generateRole(params)).rejects.toThrow(
        "No active provider available for role generation",
      );
    });
  });

  describe("testProviderConnection", () => {
    it("should test WCA connection successfully", async () => {
      vi.mocked(mockWcaApi.completionRequest).mockResolvedValue({
        predictions: ["test"],
        model: "wca",
        suggestionId: "test",
      });

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const status = await providerManager.testProviderConnection("wca");

      expect(mockWcaApi.completionRequest).toHaveBeenCalledWith({
        prompt: "# Test connection",
        suggestionId: "test",
      });
      expect(status).toEqual({
        connected: true,
        modelInfo: {
          name: "WCA",
          capabilities: ["completion", "chat", "generation", "contentmatching"],
        },
      });
    });

    it("should handle WCA connection failure", async () => {
      vi.mocked(mockWcaApi.completionRequest).mockRejectedValue(
        new Error("Connection failed"),
      );

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const status = await providerManager.testProviderConnection("wca");

      expect(status).toEqual({
        connected: false,
        error: "Connection failed",
      });
    });

    it("should test Google provider connection successfully", async () => {
      const mockStatus: ProviderStatus = {
        connected: true,
        modelInfo: {
          name: MODEL_NAMES.GEMINI_PRO,
          capabilities: ["completion", "chat", "generation"],
        },
      };

      vi.mocked(mockLlmProvider.getStatus).mockResolvedValue(mockStatus);

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const status =
        await providerManager.testProviderConnection("llmprovider");

      expect(mockLlmProvider.getStatus).toHaveBeenCalled();
      expect(status).toEqual(mockStatus);
    });

    it("should return error when provider not configured", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const status =
        await providerManager.testProviderConnection("llmprovider");

      expect(status).toEqual({
        connected: false,
        error: "Provider not configured",
      });
    });
  });

  describe("getAvailableProviders", () => {
    it("should return available providers with Google active", async () => {
      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const providers = providerManager.getAvailableProviders();

      expect(providers).toEqual([
        {
          type: PROVIDER_TYPES.WCA,
          displayName:
            "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant",
          active: false,
        },
        {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          active: true,
        },
      ]);
    });

    it("should return available providers with WCA active", async () => {
      mockSettingsManager.settings.lightSpeedService = {
        ...TEST_LIGHTSPEED_SETTINGS.WCA,
      };

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const providers = providerManager.getAvailableProviders();

      expect(providers).toEqual([
        {
          type: PROVIDER_TYPES.WCA,
          displayName:
            "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant",
          active: true,
        },
        {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          active: false,
        },
      ]);
    });

    it("should return all providers as inactive when lightspeed is disabled", async () => {
      mockSettingsManager.settings.lightSpeedService.enabled = false;

      providerManager = new ProviderManager(mockSettingsManager, mockWcaApi);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const providers = providerManager.getAvailableProviders();

      expect(providers.every((p) => !p.active)).toBe(true);
    });
  });
});
