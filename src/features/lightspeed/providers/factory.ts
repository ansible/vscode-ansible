import { LLMProvider } from "./base";
import { GoogleProvider, GoogleConfig } from "./google";
import { RHCustomProvider, RHCustomConfig } from "./rhcustom";
import { LightSpeedServiceSettings } from "../../../interfaces/extensionSettings";
import {
  GOOGLE_API_ENDPOINT,
  WCA_API_ENDPOINT_DEFAULT,
  GOOGLE_DEFAULT_MODEL,
  ProviderType,
} from "../../../definitions/lightspeed";
import { ProviderFactory, ProviderInfo } from "../../../interfaces/lightspeed";

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
        // Allow localhost URLs for testing, block other custom endpoints
        const isLocalhostUrl =
          config.apiEndpoint?.startsWith("http://localhost");
        if (
          config.apiEndpoint &&
          config.apiEndpoint !== GOOGLE_API_ENDPOINT &&
          !isLocalhostUrl
        ) {
          throw new Error(
            `Custom API endpoints are not supported for Google Gemini provider. The endpoint is automatically configured. Please remove 'ansible.lightspeed.apiEndpoint' from your settings.`,
          );
        }
        return new GoogleProvider({
          apiKey: config.apiKey,
          modelName: config.modelName || GOOGLE_DEFAULT_MODEL,
          timeout: config.timeout || 30000,
          baseUrl: isLocalhostUrl ? config.apiEndpoint : undefined,
        } as GoogleConfig);
      }

      case "rhcustom": {
        if (!config.apiKey || config.apiKey.trim() === "") {
          throw new Error(
            "API Key is required for Red Hat Custom provider. Please set 'ansible.lightspeed.apiKey' in your settings.",
          );
        }
        if (!config.apiEndpoint || config.apiEndpoint.trim() === "") {
          throw new Error(
            "Base URL is required for Red Hat Custom provider. Please set 'ansible.lightspeed.apiEndpoint' in your settings.",
          );
        }
        if (!config.modelName || config.modelName.trim() === "") {
          throw new Error(
            "Model name is required for Red Hat Custom provider. Please set 'ansible.lightspeed.modelName' in your settings.",
          );
        }
        
        // Validate that apiEndpoint is a valid URL
        try {
          const url = new URL(config.apiEndpoint);
          if (!url.protocol.startsWith("http")) {
            throw new Error("Base URL must use http:// or https:// protocol");
          }
        } catch (error) {
          if (error instanceof TypeError) {
            throw new Error(
              `Invalid base URL format: ${config.apiEndpoint}. Please provide a valid URL (e.g., https://example.com).`,
            );
          }
          throw error;
        }
        
        // Ensure we're using apiEndpoint as baseURL, not apiKey
        const baseURL = config.apiEndpoint.trim();
        const apiKey = config.apiKey.trim();
        
        console.log("[RHCustom Factory] Creating provider with:", {
          baseURL: baseURL,
          modelName: config.modelName,
          hasApiKey: !!apiKey,
          apiKeyLength: apiKey.length,
          timeout: config.timeout || 30000,
        });
        
        return new RHCustomProvider({
          apiKey: apiKey,
          modelName: config.modelName.trim(),
          baseURL: baseURL,
          timeout: config.timeout || 30000,
          maxTokens: config.maxTokens,
        } as RHCustomConfig);
      }

      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }

  getSupportedProviders(): ProviderInfo[] {
    return [
      {
        type: "wca",
        name: "wca",
        displayName:
          "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant",
        description:
          "Official Red Hat Ansible Lightspeed service with IBM watsonx Code Assistant",
        defaultEndpoint: WCA_API_ENDPOINT_DEFAULT,
        configSchema: [
          {
            key: "apiEndpoint",
            label: "Lightspeed URL",
            type: "string",
            required: true,
            placeholder: WCA_API_ENDPOINT_DEFAULT,
            description: "URL for Ansible Lightspeed service",
          },
          {
            key: "modelName",
            label: "Model ID Override",
            type: "string",
            required: false,
            placeholder: "Leave empty to use organization default",
            description:
              "Model ID to override your organization's default model (commercial users only)",
          },
        ],
      },
      {
        type: "google",
        name: "google",
        displayName: "Google Gemini",
        description: "Direct access to Google Gemini models",
        defaultEndpoint: GOOGLE_API_ENDPOINT,
        configSchema: [
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "AIza...",
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
        displayName: "Red Hat Custom",
        description:
          "Custom OpenAI-compatible API endpoint for Red Hat AI Services",
        defaultEndpoint: "",
        configSchema: [
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "api-key",
            description: "Your API key for authentication",
          },
          {
            key: "apiEndpoint",
            label: "Base URL",
            type: "string",
            required: true,
            placeholder: "https://...",
            description:
              "The base URL of the OpenAI-compatible API endpoint (must support /v1/chat/completions)",
          },
          {
            key: "modelName",
            label: "Model Name/ID",
            type: "string",
            required: true,
            placeholder: "model-name",
            description: "The model name or ID to use",
          },
          {
            key: "maxTokens",
            label: "Max Tokens",
            type: "number",
            required: false,
            placeholder: "4000",
            description:
              "Maximum tokens for generation. Default: 4000. Adjust based on your model's context length (e.g., 2048 for small models, 8000+ for larger models).",
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
