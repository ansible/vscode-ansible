import { ExtensionContext } from "vscode";

/**
 * Service for managing LLM provider settings.
 * Uses VS Code's globalState for regular settings and secrets storage for sensitive data.
 * This keeps LLM provider configuration out of VS Code's Settings UI.
 */
export class LlmProviderSettings {
  private static readonly PROVIDER_KEY = "lightspeed.provider";
  private static readonly MODEL_NAME_KEY = "lightspeed.modelName";
  private static readonly API_ENDPOINT_KEY = "lightspeed.apiEndpoint";
  private static readonly API_KEY_SECRET = "lightspeed.apiKey";

  private static readonly DEFAULT_PROVIDER = "wca";
  private static readonly DEFAULT_WCA_ENDPOINT =
    "https://c.ai.ansible.redhat.com";
  private static readonly DEFAULT_GOOGLE_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta";
  private static readonly DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash";

  constructor(private readonly context: ExtensionContext) {}

  // Provider
  getProvider(): string {
    return (
      this.context.globalState.get<string>(LlmProviderSettings.PROVIDER_KEY) ??
      LlmProviderSettings.DEFAULT_PROVIDER
    );
  }

  async setProvider(value: string): Promise<void> {
    await this.context.globalState.update(
      LlmProviderSettings.PROVIDER_KEY,
      value,
    );
  }

  // Model Name
  getModelName(): string | undefined {
    const value = this.context.globalState.get<string>(
      LlmProviderSettings.MODEL_NAME_KEY,
    );

    // Return stored value if set
    if (value?.trim()) {
      return value.trim();
    }

    // Return default model based on provider
    const provider = this.getProvider();
    if (provider === "google") {
      return LlmProviderSettings.DEFAULT_GOOGLE_MODEL;
    }

    // WCA doesn't have a default model (uses org default)
    return undefined;
  }

  async setModelName(value: string | undefined): Promise<void> {
    await this.context.globalState.update(
      LlmProviderSettings.MODEL_NAME_KEY,
      value?.trim() || undefined,
    );
  }

  // API Endpoint
  getApiEndpoint(): string {
    const provider = this.getProvider();
    const endpoint = this.context.globalState.get<string>(
      LlmProviderSettings.API_ENDPOINT_KEY,
    );

    // Return stored endpoint if set
    if (endpoint) {
      return endpoint;
    }

    // Default endpoints based on provider
    if (provider === "wca") {
      return LlmProviderSettings.DEFAULT_WCA_ENDPOINT;
    }
    if (provider === "google") {
      return LlmProviderSettings.DEFAULT_GOOGLE_ENDPOINT;
    }

    return "";
  }

  async setApiEndpoint(value: string | undefined): Promise<void> {
    await this.context.globalState.update(
      LlmProviderSettings.API_ENDPOINT_KEY,
      value || undefined,
    );
  }

  // API Key (stored securely in secrets)
  async getApiKey(): Promise<string> {
    return (
      (await this.context.secrets.get(LlmProviderSettings.API_KEY_SECRET)) ?? ""
    );
  }

  async setApiKey(value: string | undefined): Promise<void> {
    if (value) {
      await this.context.secrets.store(
        LlmProviderSettings.API_KEY_SECRET,
        value,
      );
    } else {
      await this.context.secrets.delete(LlmProviderSettings.API_KEY_SECRET);
    }
  }

  // Bulk getter for all settings (useful for webview)
  async getAllSettings(): Promise<{
    provider: string;
    modelName: string | undefined;
    apiEndpoint: string;
    apiKey: string;
  }> {
    return {
      provider: this.getProvider(),
      modelName: this.getModelName(),
      apiEndpoint: this.getApiEndpoint(),
      apiKey: await this.getApiKey(),
    };
  }

  // Bulk setter for all settings
  async setAllSettings(settings: {
    provider?: string;
    modelName?: string;
    apiEndpoint?: string;
    apiKey?: string;
  }): Promise<void> {
    if (settings.provider !== undefined) {
      await this.setProvider(settings.provider);
    }
    if (settings.modelName !== undefined) {
      await this.setModelName(settings.modelName);
    }
    if (settings.apiEndpoint !== undefined) {
      await this.setApiEndpoint(settings.apiEndpoint);
    }
    if (settings.apiKey !== undefined) {
      await this.setApiKey(settings.apiKey);
    }
  }

  // Clear all settings (for testing or reset)
  async clearAllSettings(): Promise<void> {
    await this.context.globalState.update(
      LlmProviderSettings.PROVIDER_KEY,
      undefined,
    );
    await this.context.globalState.update(
      LlmProviderSettings.MODEL_NAME_KEY,
      undefined,
    );
    await this.context.globalState.update(
      LlmProviderSettings.API_ENDPOINT_KEY,
      undefined,
    );
    await this.context.secrets.delete(LlmProviderSettings.API_KEY_SECRET);
  }
}
