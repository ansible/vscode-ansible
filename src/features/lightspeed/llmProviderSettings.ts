import * as vscode from "vscode";
import { ExtensionContext } from "vscode";
import { providerFactory } from "@src/features/lightspeed/providers/factory";

/**
 * Service for managing LLM provider settings.
 * Uses VS Code's globalState for regular settings and secrets for sensitive data.
 */
export class LlmProviderSettings {
  private static readonly PROVIDER_KEY = "lightspeed.provider";
  private static readonly SETTING_PREFIX = "lightspeed.setting.";
  private static readonly SECRET_PREFIX = "lightspeed.secret.";
  private static readonly CONNECTION_STATUS_PREFIX =
    "lightspeed.connectionStatus.";
  private static readonly MIGRATION_KEY = "lightspeed.migratedFromSettings";
  private static readonly DEFAULT_PROVIDER = "wca";

  constructor(private readonly context: ExtensionContext) {}

  /**
   * One time import of deprecated settings.json values into Panel storage.
   * Must be called once during extension activation.
   */
  async migrateFromSettingsJson(): Promise<void> {
    if (
      this.context.globalState.get<boolean>(LlmProviderSettings.MIGRATION_KEY)
    ) {
      return;
    }

    const cfg = vscode.workspace.getConfiguration("ansible.lightspeed");
    const inspect = (key: string) => {
      const i = cfg.inspect<string>(key);
      return i?.workspaceValue ?? i?.globalValue;
    };

    // Import provider first — it determines where other fields are stored
    const legacyProvider = inspect("provider");
    if (
      legacyProvider &&
      this.context.globalState.get(LlmProviderSettings.PROVIDER_KEY) ===
        undefined
    ) {
      await this.setProvider(legacyProvider);
    }

    // Import remaining fields scoped to the resolved provider
    const targetProvider = this.getProvider();
    const providerInfo = this.getProviderInfo(targetProvider);

    for (const key of ["apiEndpoint", "modelName", "apiKey"]) {
      const legacy = inspect(key);
      if (!legacy) continue;

      const field = providerInfo?.configSchema.find((f) => f.key === key);
      if (!field) continue;

      if (field.type === "password") {
        const secretKey = `${LlmProviderSettings.SECRET_PREFIX}${targetProvider}.${key}`;
        if ((await this.context.secrets.get(secretKey)) === undefined) {
          await this.context.secrets.store(secretKey, legacy);
        }
      } else {
        const stateKey = `${LlmProviderSettings.SETTING_PREFIX}${targetProvider}.${key}`;
        if (this.context.globalState.get<string>(stateKey) === undefined) {
          await this.context.globalState.update(stateKey, legacy.trim());
        }
      }
    }

    await this.context.globalState.update(
      LlmProviderSettings.MIGRATION_KEY,
      true,
    );
  }

  /**
   * Get a setting value for a provider.
   */
  async get(provider: string, key: string): Promise<string> {
    const providerInfo = this.getProviderInfo(provider);
    const field = providerInfo?.configSchema.find((f) => f.key === key);

    if (field?.type === "password") {
      const secretKey = `${LlmProviderSettings.SECRET_PREFIX}${provider}.${key}`;
      return (await this.context.secrets.get(secretKey)) ?? "";
    }

    const stateKey = `${LlmProviderSettings.SETTING_PREFIX}${provider}.${key}`;
    const value = this.context.globalState.get<string>(stateKey);
    if (value !== undefined) {
      return value.trim();
    }

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
   */
  async set(
    provider: string,
    key: string,
    value: string | undefined,
  ): Promise<void> {
    const providerInfo = this.getProviderInfo(provider);
    const field = providerInfo?.configSchema.find((f) => f.key === key);

    if (field?.type === "password") {
      const secretKey = `${LlmProviderSettings.SECRET_PREFIX}${provider}.${key}`;
      if (value) {
        await this.context.secrets.store(secretKey, value);
      } else {
        await this.context.secrets.delete(secretKey);
      }
      return;
    }

    const stateKey = `${LlmProviderSettings.SETTING_PREFIX}${provider}.${key}`;
    await this.context.globalState.update(stateKey, value?.trim() ?? "");
  }

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

  async getAllSettings(): Promise<{
    provider: string;
    apiEndpoint: string;
    modelName: string | undefined;
    apiKey: string;
    maxTokens?: string;
    connectionStatuses: Record<string, boolean>;
  }> {
    const currentProvider = this.getProvider();
    const apiEndpoint = await this.get(currentProvider, "apiEndpoint");
    const modelName = await this.get(currentProvider, "modelName");
    const apiKey = await this.get(currentProvider, "apiKey");
    const maxTokens = await this.get(currentProvider, "maxTokens");

    return {
      provider: currentProvider,
      apiEndpoint,
      modelName: modelName || undefined,
      apiKey,
      maxTokens: maxTokens || undefined,
      connectionStatuses: this.getAllConnectionStatuses(),
    };
  }

  async clearAllSettings(): Promise<void> {
    await this.context.globalState.update(
      LlmProviderSettings.PROVIDER_KEY,
      undefined,
    );

    const providers = providerFactory.getSupportedProviders();
    for (const provider of providers) {
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
      await this.context.globalState.update(
        `${LlmProviderSettings.CONNECTION_STATUS_PREFIX}${provider.type}`,
        undefined,
      );
    }
  }
}
