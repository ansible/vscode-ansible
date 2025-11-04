import { LLMProvider, ProviderStatus } from "./providers/base";
import { providerFactory, ProviderType } from "./providers/factory";
import { SettingsManager } from "../../settings";
import { LightSpeedAPI } from "./api";
import {
  CompletionRequestParams,
  CompletionResponseParams,
} from "../../interfaces/lightspeed";
import {
  ChatRequestParams,
  ChatResponseParams,
  GenerationRequestParams,
  GenerationResponseParams,
} from "./providers/base";
import { isError } from "./utils/errors";

export class ProviderManager {
  private settingsManager: SettingsManager;
  private wcaApi: LightSpeedAPI;
  private llmProvider: LLMProvider | null = null;
  private providerStatus: Map<string, ProviderStatus> = new Map();

  constructor(settingsManager: SettingsManager, wcaApi: LightSpeedAPI) {
    this.settingsManager = settingsManager;
    this.wcaApi = wcaApi;
    this.initializeLlmProvider();
  }

  /**
   * Initialize LLM provider based on current settings
   */
  private async initializeLlmProvider(): Promise<void> {
    const lightspeedConfig = this.settingsManager.settings.lightSpeedService;

    // Only initialize LLM provider if it's not WCA
    if (!lightspeedConfig.enabled || lightspeedConfig.provider === "wca") {
      this.llmProvider = null;
      return;
    }

    try {
      this.llmProvider = providerFactory.createProvider(
        lightspeedConfig.provider as ProviderType,
        lightspeedConfig,
      );

      // Validate the provider configuration
      const status = await this.llmProvider.getStatus();
      this.providerStatus.set(lightspeedConfig.provider, status);

      if (!status.connected) {
        console.warn(
          `LLM provider ${lightspeedConfig.provider} failed to connect:`,
          status.error,
        );
        // Store the error for display to user
        this.providerStatus.set(lightspeedConfig.provider, {
          connected: false,
          error: status.error || "Failed to connect to provider",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to initialize LLM provider";
      console.error("Failed to initialize LLM provider:", errorMessage);
      this.llmProvider = null;
      // Store the error for display to user
      this.providerStatus.set(lightspeedConfig.provider, {
        connected: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Refresh provider configuration when settings change
   */
  async refreshProviders(): Promise<void> {
    await this.initializeLlmProvider();
  }

  /**
   * Get the current active provider (WCA or LLM)
   */
  getActiveProvider(): "wca" | "llmprovider" | null {
    const lightspeedConfig = this.settingsManager.settings.lightSpeedService;

    if (!lightspeedConfig.enabled) {
      return null;
    }

    if (lightspeedConfig.provider === "wca") {
      return "wca";
    }

    // If provider is set to an LLM provider (not WCA), return llmprovider
    // even if initialization failed - we'll show the error message
    if (lightspeedConfig.provider && lightspeedConfig.provider !== "wca") {
      return "llmprovider";
    }

    return null;
  }

  /**
   * Get provider status for UI display
   */
  getProviderStatus(
    providerType: "wca" | "llmprovider",
  ): ProviderStatus | null {
    if (providerType === "wca") {
      // For WCA, we can check if user is authenticated
      return {
        connected: this.settingsManager.settings.lightSpeedService.enabled,
        modelInfo: {
          name: "WCA",
          capabilities: ["completion", "chat", "generation", "contentmatching"],
        },
      };
    }

    const lightspeedConfig = this.settingsManager.settings.lightSpeedService;
    return this.providerStatus.get(lightspeedConfig.provider) || null;
  }

  /**
   * Route completion request to appropriate provider
   */
  async completionRequest(
    params: CompletionRequestParams,
  ): Promise<CompletionResponseParams> {
    const activeProvider = this.getActiveProvider();

    if (activeProvider === "llmprovider" && this.llmProvider) {
      return await this.llmProvider.completionRequest(params);
    }

    if (activeProvider === "wca") {
      return await this.wcaApi.completionRequest(params);
    }

    throw new Error("No active provider available for completion requests");
  }

  /**
   * Route chat request to appropriate provider
   */
  async chatRequest(params: ChatRequestParams): Promise<ChatResponseParams> {
    const activeProvider = this.getActiveProvider();

    if (activeProvider === "llmprovider" && this.llmProvider) {
      return await this.llmProvider.chatRequest(params);
    }

    if (activeProvider === "wca") {
      // WCA doesn't have a direct chat API, so we'll simulate it
      // In a real implementation, this might use a different endpoint
      throw new Error("Chat requests not supported with WCA provider");
    }

    throw new Error("No active provider available for chat requests");
  }

  /**
   * Route playbook generation to appropriate provider
   */
  async generatePlaybook(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams> {
    const activeProvider = this.getActiveProvider();
    const lightspeedConfig = this.settingsManager.settings.lightSpeedService;

    if (activeProvider === "llmprovider") {
      if (!this.llmProvider) {
        // Get the error message from provider status
        const status = this.providerStatus.get(lightspeedConfig.provider);
        const errorMessage = status?.error || "Provider not initialized";
        throw new Error(errorMessage);
      }
      return await this.llmProvider.generatePlaybook(params);
    }

    if (activeProvider === "wca") {
      // Use existing WCA generation API
      const wcaParams = {
        text: params.prompt,
        createOutline: true,
        generationId: "playbook-gen-" + Date.now(),
      };
      const response = await this.wcaApi.playbookGenerationRequest(wcaParams);

      // Handle both success and error responses
      if (isError(response)) {
        throw new Error(
          response.message || response.code || "Playbook generation failed",
        );
      } else {
        return {
          content: response.playbook || "",
          model: "wca",
        };
      }
    }

    throw new Error("No active provider available for playbook generation");
  }

  /**
   * Route role generation to appropriate provider
   */
  async generateRole(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams> {
    const activeProvider = this.getActiveProvider();
    const lightspeedConfig = this.settingsManager.settings.lightSpeedService;

    if (activeProvider === "llmprovider") {
      if (!this.llmProvider) {
        // Get the error message from provider status
        const status = this.providerStatus.get(lightspeedConfig.provider);
        const errorMessage = status?.error || "Provider not initialized";
        throw new Error(errorMessage);
      }
      return await this.llmProvider.generateRole(params);
    }

    if (activeProvider === "wca") {
      // Use existing WCA generation API
      const wcaParams = {
        text: params.prompt,
        createOutline: true,
        generationId: "role-gen-" + Date.now(),
      };
      const response = await this.wcaApi.roleGenerationRequest(wcaParams);

      // Handle both success and error responses
      if (isError(response)) {
        throw new Error(
          response.message || response.code || "Role generation failed",
        );
      } else {
        return {
          content: response.role || "",
          model: "wca",
        };
      }
    }

    throw new Error("No active provider available for role generation");
  }

  /**
   * Test provider connection
   */
  async testProviderConnection(
    providerType: "wca" | "llmprovider",
  ): Promise<ProviderStatus> {
    if (providerType === "wca") {
      try {
        // Test WCA connection by making a simple API call
        const testParams = {
          prompt: "# Test connection",
          suggestionId: "test",
        };
        await this.wcaApi.completionRequest(testParams);
        return {
          connected: true,
          modelInfo: {
            name: "WCA",
            capabilities: [
              "completion",
              "chat",
              "generation",
              "contentmatching",
            ],
          },
        };
      } catch (error) {
        return {
          connected: false,
          error:
            error instanceof Error ? error.message : "WCA connection failed",
        };
      }
    }

    if (providerType === "llmprovider" && this.llmProvider) {
      return await this.llmProvider.getStatus();
    }

    return {
      connected: false,
      error: "Provider not configured",
    };
  }

  /**
   * Get available provider types
   */
  getAvailableProviders(): Array<{
    type: string;
    displayName: string;
    active: boolean;
  }> {
    const supportedProviders = providerFactory.getSupportedProviders();
    const providers = [];

    for (const provider of supportedProviders) {
      const isActive =
        this.settingsManager.settings.lightSpeedService.provider ===
          provider.type &&
        this.settingsManager.settings.lightSpeedService.enabled;

      providers.push({
        type: provider.type,
        displayName: provider.displayName,
        active: isActive,
      });
    }

    return providers;
  }
}
