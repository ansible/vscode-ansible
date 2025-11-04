import { LLMProvider } from "./base";
import { OpenAIProvider, OpenAIConfig } from "./openai";
import { GoogleProvider, GoogleConfig } from "./google";
import { LightSpeedServiceSettings } from "../../../interfaces/extensionSettings";
import {
  OPENAI_API_ENDPOINT,
  GOOGLE_API_ENDPOINT,
  WCA_API_ENDPOINT_DEFAULT,
  OPENAI_DEFAULT_MODEL,
  GOOGLE_DEFAULT_MODEL,
} from "../../../definitions/lightspeed";

export type ProviderType = "wca" | "openai" | "google" | "custom";

export interface ProviderFactory {
  createProvider(
    type: ProviderType,
    config: LightSpeedServiceSettings,
  ): LLMProvider;
  getSupportedProviders(): ProviderInfo[];
  validateProviderConfig(
    type: ProviderType,
    config: LightSpeedServiceSettings,
  ): boolean;
}

export interface ProviderInfo {
  type: ProviderType;
  name: string;
  displayName: string;
  description: string;
  configSchema: ConfigField[];
  defaultEndpoint?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: "string" | "password" | "number" | "boolean";
  required: boolean;
  placeholder?: string;
  description?: string;
}

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

      case "openai":
        if (!config.apiKey) {
          throw new Error(
            "API Key is required for OpenAI. Please set 'ansible.lightspeed.apiKey' in your settings.",
          );
        }
        // OpenAI endpoint is fixed - don't allow custom endpoints
        if (config.apiEndpoint && config.apiEndpoint !== OPENAI_API_ENDPOINT) {
          throw new Error(
            `Custom API endpoints are not supported for OpenAI provider. The endpoint is automatically set to '${OPENAI_API_ENDPOINT}'. Please remove 'ansible.lightspeed.apiEndpoint' from your settings or use 'custom' provider for custom endpoints.`,
          );
        }
        return new OpenAIProvider({
          apiKey: config.apiKey,
          apiEndpoint: OPENAI_API_ENDPOINT, // Fixed endpoint
          modelName: config.modelName || OPENAI_DEFAULT_MODEL,
          timeout: config.timeout || 30000,
          customHeaders: config.customHeaders || {},
        } as OpenAIConfig);

      case "google":
        if (!config.apiKey) {
          throw new Error(
            "API Key is required for Google Gemini. Please set 'ansible.lightspeed.apiKey' in your settings.",
          );
        }
        // Google doesn't support custom endpoints - uses SDK
        if (config.apiEndpoint && config.apiEndpoint !== GOOGLE_API_ENDPOINT) {
          throw new Error(
            `Custom API endpoints are not supported for Google Gemini provider. The endpoint is automatically configured. Please remove 'ansible.lightspeed.apiEndpoint' from your settings or use 'custom' provider for custom endpoints.`,
          );
        }
        return new GoogleProvider({
          apiKey: config.apiKey,
          modelName: config.modelName || GOOGLE_DEFAULT_MODEL,
          timeout: config.timeout || 30000,
        } as GoogleConfig);

      case "custom":
        if (!config.apiKey) {
          throw new Error(
            "API Key is required for custom provider. Please set 'ansible.lightspeed.apiKey' in your settings.",
          );
        }
        if (!config.apiEndpoint) {
          throw new Error(
            "API Endpoint is required for custom provider. Please set 'ansible.lightspeed.apiEndpoint' in your settings.",
          );
        }
        if (!config.modelName) {
          throw new Error(
            "Model Name is required for custom provider. Please set 'ansible.lightspeed.modelName' in your settings.",
          );
        }
        return new OpenAIProvider({
          apiKey: config.apiKey,
          apiEndpoint: config.apiEndpoint,
          modelName: config.modelName, // Required, no default
          timeout: config.timeout || 30000,
          customHeaders: config.customHeaders || {},
        } as OpenAIConfig);

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
        type: "openai",
        name: "openai",
        displayName: "OpenAI",
        description: "Direct access to OpenAI models",
        defaultEndpoint: OPENAI_API_ENDPOINT,
        configSchema: [
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "sk-...",
            description: "Your OpenAI API key",
          },
          {
            key: "modelName",
            label: "Model Name",
            type: "string",
            required: true,
            placeholder: "gpt-4",
            description: "The OpenAI model to use",
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
        type: "custom",
        name: "custom",
        displayName: "Custom Provider",
        description: "Configure a custom OpenAI-compatible API",
        configSchema: [
          {
            key: "apiEndpoint",
            label: "API Endpoint",
            type: "string",
            required: true,
            placeholder: "https://your-api.com/v1",
            description: "The base URL for your API",
          },
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "your-api-key",
            description: "Your API key",
          },
          {
            key: "modelName",
            label: "Model Name",
            type: "string",
            required: true,
            placeholder: "your-model-name",
            description: "The model identifier",
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

    // Validate API endpoint format for custom providers
    if (type === "custom" && config.apiEndpoint) {
      try {
        new URL(config.apiEndpoint);
      } catch {
        return false;
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
