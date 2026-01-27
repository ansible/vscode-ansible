import { ExtensionContext } from "vscode";
import { providerFactory } from "./providers/factory";

/**
 * Service for managing LLM provider settings.
 * Uses VS Code's globalState for regular settings and secrets storage for sensitive data.
 * This keeps LLM provider configuration out of VS Code's Settings UI.
 * Defaults are read from providerFactory for single source of truth.
 */
export class LlmProviderSettings {
  private static readonly PROVIDER_KEY = "lightspeed.provider";
  private static readonly MODEL_NAME_PREFIX = "lightspeed.modelName.";
  private static readonly API_ENDPOINT_PREFIX = "lightspeed.apiEndpoint.";
  private static readonly API_KEY_SECRET_PREFIX = "lightspeed.apiKey.";
  private static readonly CONNECTION_STATUS_PREFIX =
    "lightspeed.connectionStatus.";

  private static readonly DEFAULT_PROVIDER = "wca";

  constructor(private readonly context: ExtensionContext) {}

  /**
   * Get provider info from factory (single source of truth for defaults)
   */
  private getProviderInfo(providerType: string) {
    return providerFactory
      .getSupportedProviders()
      .find((p) => p.type === providerType);
  }

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

  // Model Name (stored per-provider)
  getModelName(provider?: string): string | undefined {
    const targetProvider = provider ?? this.getProvider();
    const key = `${LlmProviderSettings.MODEL_NAME_PREFIX}${targetProvider}`;
    const value = this.context.globalState.get<string>(key);

    // Return stored value if set
    if (value?.trim()) {
      return value.trim();
    }

    // Return default model from factory (single source of truth)
    const providerInfo = this.getProviderInfo(targetProvider);
    return providerInfo?.defaultModel;
  }

  async setModelName(
    value: string | undefined,
    provider?: string,
  ): Promise<void> {
    const targetProvider = provider ?? this.getProvider();
    const key = `${LlmProviderSettings.MODEL_NAME_PREFIX}${targetProvider}`;
    await this.context.globalState.update(key, value?.trim() || undefined);
  }

  // API Endpoint (stored per-provider)
  getApiEndpoint(provider?: string): string {
    const targetProvider = provider ?? this.getProvider();
    const key = `${LlmProviderSettings.API_ENDPOINT_PREFIX}${targetProvider}`;
    const endpoint = this.context.globalState.get<string>(key);

    // Return stored endpoint if set
    if (endpoint) {
      return endpoint;
    }

    // Return default endpoint from factory (single source of truth)
    const providerInfo = this.getProviderInfo(targetProvider);
    return providerInfo?.defaultEndpoint ?? "";
  }

  async setApiEndpoint(
    value: string | undefined,
    provider?: string,
  ): Promise<void> {
    const targetProvider = provider ?? this.getProvider();
    const key = `${LlmProviderSettings.API_ENDPOINT_PREFIX}${targetProvider}`;
    await this.context.globalState.update(key, value || undefined);
  }

  // API Key (stored securely in secrets, per-provider)
  async getApiKey(provider?: string): Promise<string> {
    const targetProvider = provider ?? this.getProvider();
    const secretKey = `${LlmProviderSettings.API_KEY_SECRET_PREFIX}${targetProvider}`;
    return (await this.context.secrets.get(secretKey)) ?? "";
  }

  async setApiKey(value: string | undefined, provider?: string): Promise<void> {
    const targetProvider = provider ?? this.getProvider();
    const secretKey = `${LlmProviderSettings.API_KEY_SECRET_PREFIX}${targetProvider}`;

    if (value) {
      await this.context.secrets.store(secretKey, value);
    } else {
      await this.context.secrets.delete(secretKey);
    }
  }

  // Connection Status (stored per-provider)
  getConnectionStatus(provider?: string): boolean {
    const targetProvider = provider ?? this.getProvider();
    const key = `${LlmProviderSettings.CONNECTION_STATUS_PREFIX}${targetProvider}`;
    return this.context.globalState.get<boolean>(key) ?? false;
  }

  async setConnectionStatus(
    connected: boolean,
    provider?: string,
  ): Promise<void> {
    const targetProvider = provider ?? this.getProvider();
    const key = `${LlmProviderSettings.CONNECTION_STATUS_PREFIX}${targetProvider}`;
    await this.context.globalState.update(key, connected);
  }

  // Get connection status for all providers
  getAllConnectionStatuses(): Record<string, boolean> {
    const providers = providerFactory.getSupportedProviders();
    const statuses: Record<string, boolean> = {};
    for (const provider of providers) {
      statuses[provider.type] = this.getConnectionStatus(provider.type);
    }
    return statuses;
  }

  // Bulk getter for all settings (useful for webview)
  async getAllSettings(): Promise<{
    provider: string;
    modelName: string | undefined;
    apiEndpoint: string;
    apiKey: string;
    connectionStatuses: Record<string, boolean>;
  }> {
    return {
      provider: this.getProvider(),
      modelName: this.getModelName(),
      apiEndpoint: this.getApiEndpoint(),
      apiKey: await this.getApiKey(),
      connectionStatuses: this.getAllConnectionStatuses(),
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
    // Clear per-provider settings from factory (single source of truth)
    const providers = providerFactory.getSupportedProviders();
    for (const provider of providers) {
      await this.context.globalState.update(
        `${LlmProviderSettings.MODEL_NAME_PREFIX}${provider.type}`,
        undefined,
      );
      await this.context.globalState.update(
        `${LlmProviderSettings.API_ENDPOINT_PREFIX}${provider.type}`,
        undefined,
      );
      await this.context.secrets.delete(
        `${LlmProviderSettings.API_KEY_SECRET_PREFIX}${provider.type}`,
      );
      await this.context.globalState.update(
        `${LlmProviderSettings.CONNECTION_STATUS_PREFIX}${provider.type}`,
        undefined,
      );
    }
  }
}
