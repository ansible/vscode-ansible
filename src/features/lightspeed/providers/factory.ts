import { LLMProvider } from "@src/features/lightspeed/providers/base";
import {
  GoogleProvider,
  GoogleConfig,
} from "@src/features/lightspeed/providers/google";
import {
  RHCustomProvider,
  RHCustomConfig,
} from "@src/features/lightspeed/providers/rhcustom";
import { LightSpeedServiceSettings } from "@src/interfaces/extensionSettings";
import {
  GOOGLE_API_ENDPOINT,
  WCA_API_ENDPOINT_DEFAULT,
  GOOGLE_DEFAULT_MODEL,
  ProviderType,
} from "@src/definitions/lightspeed";
import { ProviderFactory, ProviderInfo } from "@src/interfaces/lightspeed";

export class LLMProviderFactory implements ProviderFactory {
  private static instance: LLMProviderFactory;

  public static getInstance(): LLMProviderFactory {
    if (!LLMProviderFactory.instance) {
      LLMProviderFactory.instance = new LLMProviderFactory();
    }
    return LLMProviderFactory.instance;
  }

  createProvider(
    type: ProviderType,
    config: LightSpeedServiceSettings,
  ): LLMProvider {
    switch (type) {
      case "wca":
        // WCA provider would be handled differently (using existing LightSpeedAPI)
        throw new Error(
          "WCA provider should be handled by existing LightSpeedAPI, not factory",
        );

      case "google": {
        if (!config.apiKey) {
          throw new Error(
            "API Key is required for Google Gemini. Please set 'ansible.lightspeed.apiKey' in your settings.",
          );
        }
        // Use custom endpoint if provided (allows v2, proxies, etc.)
        const customEndpoint =
          config.apiEndpoint && config.apiEndpoint !== GOOGLE_API_ENDPOINT
            ? config.apiEndpoint
            : undefined;

        return new GoogleProvider({
          apiKey: config.apiKey,
          modelName: config.modelName || GOOGLE_DEFAULT_MODEL,
          timeout: config.timeout || 30000,
          baseUrl: customEndpoint,
        } as GoogleConfig);
      }

      case "rhcustom":
        return this.createRHCustomProvider(config);

      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }

  private static parseMaxTokens(
    value: number | string | undefined | null,
    defaultValue = 1600,
  ): number {
    if (typeof value === "number") return value;
    const trimmed =
      value !== undefined && value !== null ? String(value).trim() : "";
    if (trimmed === "") return defaultValue;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  private createRHCustomProvider(
    config: LightSpeedServiceSettings,
  ): RHCustomProvider {
    if (!config.apiKey || config.apiKey.trim() === "") {
      throw new Error(
        "API Key is required for Red Hat AI. Please set it in the provider settings.",
      );
    }
    if (!config.modelName || config.modelName.trim() === "") {
      throw new Error(
        "Model name is required for Red Hat AI. Please set it in the provider settings.",
      );
    }
    if (!config.apiEndpoint || config.apiEndpoint.trim() === "") {
      throw new Error(
        "API endpoint is required for Red Hat AI. Please set it in the provider settings.",
      );
    }
    const maxTokens = LLMProviderFactory.parseMaxTokens(config.maxTokens);
    let baseURL = config.apiEndpoint.trim();
    while (baseURL.endsWith("/")) {
      baseURL = baseURL.slice(0, -1);
    }
    return new RHCustomProvider({
      apiKey: config.apiKey,
      modelName: config.modelName,
      baseURL,
      timeout: config.timeout || 30000,
      maxTokens,
    } as RHCustomConfig);
  }

  getSupportedProviders(): ProviderInfo[] {
    return [
      {
        type: "wca",
        name: "wca",
        displayName: "IBM watsonx",
        description:
          "Official Red Hat Ansible Lightspeed service with IBM watsonx Code Assistant",
        defaultEndpoint: WCA_API_ENDPOINT_DEFAULT,
        defaultModel: undefined, // WCA uses organization default
        usesOAuth: true,
        requiresApiKey: false,
        configSchema: [
          {
            key: "apiEndpoint",
            label: "Lightspeed URL",
            type: "string",
            required: true,
            placeholder: WCA_API_ENDPOINT_DEFAULT,
            description: "URL for Ansible Lightspeed service",
          },
        ],
      },
      {
        type: "google",
        name: "google",
        displayName: "Google Gemini",
        description: "Direct access to Google Gemini models",
        defaultEndpoint: GOOGLE_API_ENDPOINT,
        defaultModel: GOOGLE_DEFAULT_MODEL,
        usesOAuth: false,
        requiresApiKey: true,
        configSchema: [
          {
            key: "apiEndpoint",
            label: "API Endpoint",
            type: "string",
            required: false,
            placeholder: GOOGLE_API_ENDPOINT,
            description:
              "API endpoint URL (leave empty for default, only localhost URLs supported for testing)",
          },
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "",
            description: "Your Google AI API key",
          },
          {
            key: "modelName",
            label: "Model Name",
            type: "string",
            required: false,
            placeholder: "gemini-2.5-flash",
            description:
              "The Gemini model to use (optional, defaults to gemini-2.5-flash)",
          },
        ],
      },
      {
        type: "rhcustom",
        name: "rhcustom",
        displayName: "Red Hat AI",
        description: "Connect to custom OpenAI-compatible Red Hat AI models",
        defaultEndpoint: "",
        defaultModel: undefined,
        usesOAuth: false,
        requiresApiKey: true,
        configSchema: [
          {
            key: "apiEndpoint",
            label: "API Endpoint",
            type: "string",
            required: true,
            placeholder: "https://your-api.example.com",
            description: "Base URL of your custom deployment",
          },
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "",
            description: "Your API key for the custom endpoint",
          },
          {
            key: "modelName",
            label: "Model Name",
            type: "string",
            required: true,
            placeholder: "my-model",
            description: "The model name to use",
          },
          {
            key: "maxTokens",
            label: "Max Tokens",
            type: "number",
            required: false,
            placeholder: "1600",
            description:
              "Maximum tokens per response (optional, defaults to 1600)",
          },
        ],
      },
    ];
  }

  validateProviderConfig(
    type: ProviderType,
    config: LightSpeedServiceSettings,
  ): boolean {
    const providerInfo = this.getSupportedProviders().find(
      (p) => p.type === type,
    );
    if (!providerInfo) {
      return false;
    }

    // Check required fields
    for (const field of providerInfo.configSchema) {
      if (field.required) {
        const value = config[field.key as keyof LightSpeedServiceSettings];
        if (!value || (typeof value === "string" && value.trim() === "")) {
          return false;
        }
      }
    }

    // Special validation for WCA
    if (type === "wca") {
      // WCA requires valid endpoint but no API key
      if (!config.apiEndpoint || config.apiEndpoint.trim() === "") {
        return false;
      }
      return true;
    }

    return true;
  }
}

export const providerFactory = LLMProviderFactory.getInstance();
