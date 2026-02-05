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
  private static readonly SETTING_PREFIX = "lightspeed.setting.";
  private static readonly SECRET_PREFIX = "lightspeed.secret.";
  private static readonly CONNECTION_STATUS_PREFIX =
    "lightspeed.connectionStatus.";

  private static readonly DEFAULT_PROVIDER = "wca";

  constructor(private readonly context: ExtensionContext) {}

  /**
   * Get a setting value for a provider.
   * Automatically uses secrets storage for password fields.
   * Returns stored value (even if empty string) or default if never set.
   */
  async get(provider: string, key: string): Promise<string> {
    const providerInfo = this.getProviderInfo(provider);
    const field = providerInfo?.configSchema.find((f) => f.key === key);

    // Use secrets for password fields
    if (field?.type === "password") {
      const secretKey = `${LlmProviderSettings.SECRET_PREFIX}${provider}.${key}`;
      return (await this.context.secrets.get(secretKey)) ?? "";
    }

    // Use globalState for regular fields
    const stateKey = `${LlmProviderSettings.SETTING_PREFIX}${provider}.${key}`;
    const value = this.context.globalState.get<string>(stateKey);

    // If value exists in storage (even empty string), return it
    // This respects user's explicit choice to clear a field
    if (value !== undefined) {
      return value.trim();
    }

    // Only return defaults when value was never set (first time use)
    if (key === "apiEndpoint") {
      return providerInfo?.defaultEndpoint ?? "";
    }
    if (key === "modelName") {
      return providerInfo?.defaultModel ?? "";
    }

    return "";
  }

  /**
   * Set a setting value for a provider.
   * Automatically uses secrets storage for password fields.
   * Stores empty string (not undefined) when user explicitly clears a field.
   */
  async set(
    provider: string,
    key: string,
    value: string | undefined,
  ): Promise<void> {
    const providerInfo = this.getProviderInfo(provider);
    const field = providerInfo?.configSchema.find((f) => f.key === key);

    // Use secrets for password fields
    if (field?.type === "password") {
      const secretKey = `${LlmProviderSettings.SECRET_PREFIX}${provider}.${key}`;
      if (value) {
        await this.context.secrets.store(secretKey, value);
      } else {
        await this.context.secrets.delete(secretKey);
      }
      return;
    }

    // Use globalState for regular fields
    // Store empty string (not undefined) to distinguish "cleared" from "never set"
    const stateKey = `${LlmProviderSettings.SETTING_PREFIX}${provider}.${key}`;
    const trimmedValue = value?.trim() ?? "";
    await this.context.globalState.update(stateKey, trimmedValue);
  }

  /**
   * Get provider info from factory (single source of truth for defaults)
   */
  private getProviderInfo(providerType: string) {
    return providerFactory
      .getSupportedProviders()
      .find((p) => p.type === providerType);
  }

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

  getAllConnectionStatuses(): Record<string, boolean> {
    const providers = providerFactory.getSupportedProviders();
    const statuses: Record<string, boolean> = {};
    for (const provider of providers) {
      statuses[provider.type] = this.getConnectionStatus(provider.type);
    }
    return statuses;
  }

  /**
   * Get all settings for the current provider (useful for webview/settings manager)
   */
  async getAllSettings(): Promise<{
    provider: string;
    apiEndpoint: string;
    modelName: string | undefined;
    apiKey: string;
    connectionStatuses: Record<string, boolean>;
  }> {
    const currentProvider = this.getProvider();
    const apiEndpoint = await this.get(currentProvider, "apiEndpoint");
    const modelName = await this.get(currentProvider, "modelName");
    const apiKey = await this.get(currentProvider, "apiKey");

    return {
      provider: currentProvider,
      apiEndpoint,
      modelName: modelName || undefined,
      apiKey,
      connectionStatuses: this.getAllConnectionStatuses(),
    };
  }

  /**
   * Clear all settings (for testing or reset)
   */
  async clearAllSettings(): Promise<void> {
    await this.context.globalState.update(
      LlmProviderSettings.PROVIDER_KEY,
      undefined,
    );

    // Clear per-provider settings based on configSchema
    const providers = providerFactory.getSupportedProviders();
    for (const provider of providers) {
      // Clear all config fields
      for (const field of provider.configSchema) {
        if (field.type === "password") {
          await this.context.secrets.delete(
            `${LlmProviderSettings.SECRET_PREFIX}${provider.type}.${field.key}`,
          );
        } else {
          await this.context.globalState.update(
            `${LlmProviderSettings.SETTING_PREFIX}${provider.type}.${field.key}`,
            undefined,
          );
        }
      }
      // Clear connection status
      await this.context.globalState.update(
        `${LlmProviderSettings.CONNECTION_STATUS_PREFIX}${provider.type}`,
        undefined,
      );
    }
  }
}
