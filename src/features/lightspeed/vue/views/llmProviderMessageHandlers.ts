import type { Webview } from "vscode";
import { window, commands } from "vscode";
import { SettingsManager } from "../../../../settings";
import { providerFactory } from "../../providers/factory";
import { ProviderManager } from "../../providerManager";
import { LlmProviderSettings } from "../../llmProviderSettings";
import { LightSpeedCommands } from "../../../../definitions/lightspeed";
import { LightspeedUser } from "../../lightspeedUser";
import { QuickLinksWebviewViewProvider } from "../../../quickLinks/utils/quickLinksViewProvider";
import { ProviderInfo } from "../../../../interfaces/lightspeed";

interface LlmProviderMessage {
  command: string;
  provider?: string;
  config?: Record<string, string>;
}

/**
 * Dependencies required by LlmProviderMessageHandlers.
 */
export interface LlmProviderDependencies {
  settingsManager: SettingsManager;
  providerManager: ProviderManager;
  llmProviderSettings: LlmProviderSettings;
  lightspeedUser: LightspeedUser;
  quickLinksProvider?: QuickLinksWebviewViewProvider;
}

/**
 * Handles all message processing for the LLM Provider webview.
 * Separates business logic from panel lifecycle management.
 */
export class LlmProviderMessageHandlers {
  private readonly settingsManager: SettingsManager;
  private readonly providerManager: ProviderManager;
  private readonly llmProviderSettings: LlmProviderSettings;
  private readonly lightspeedUser: LightspeedUser;
  private readonly quickLinksProvider?: QuickLinksWebviewViewProvider;
  private webview?: Webview;

  constructor(deps: LlmProviderDependencies) {
    this.settingsManager = deps.settingsManager;
    this.providerManager = deps.providerManager;
    this.llmProviderSettings = deps.llmProviderSettings;
    this.lightspeedUser = deps.lightspeedUser;
    this.quickLinksProvider = deps.quickLinksProvider;
  }

  /**
   * Set the webview reference for message handlers.
   */
  public setWebview(webview: Webview): void {
    this.webview = webview;
  }

  /**
   * Handle incoming messages from the webview.
   */
  public async handleMessage(message: LlmProviderMessage): Promise<void> {
    if (!this.webview) {
      console.error("[LlmProviderMessageHandlers] Webview not set");
      return;
    }

    switch (message.command) {
      case "getProviderSettings":
        await this.sendProviderSettings();
        break;

      case "saveProviderSettings":
        await this.handleSaveSettings(message);
        break;

      case "activateProvider":
        if (message.provider) {
          await this.handleActivateProvider(message.provider);
        }
        break;

      case "connectProvider":
        if (message.provider) {
          await this.handleConnectProvider(message.provider);
        }
        break;
    }
  }

  /**
   * Send current provider settings to the webview.
   */
  public async sendProviderSettings(): Promise<void> {
    if (!this.webview) return;

    const providers = providerFactory.getSupportedProviders();
    const settings = await this.llmProviderSettings.getAllSettings();
    const connectionStatuses = { ...settings.connectionStatuses };

    // Build configs dynamically based on each provider's configSchema
    const providerConfigs: Record<string, Record<string, string>> = {};
    for (const provider of providers) {
      const config: Record<string, string> = {};
      for (const field of provider.configSchema) {
        config[field.key] = await this.llmProviderSettings.get(
          provider.type,
          field.key,
        );
      }
      providerConfigs[provider.type] = config;
    }

    this.webview.postMessage({
      command: "providerSettings",
      providers: providers,
      currentProvider: settings.provider,
      providerConfigs: providerConfigs,
      connectionStatuses: connectionStatuses,
    });
  }

  /**
   * Get provider info by type from factory.
   */
  private getProviderInfo(providerType: string): ProviderInfo | undefined {
    return providerFactory
      .getSupportedProviders()
      .find((p) => p.type === providerType);
  }

  /**
   * Common pattern for updating UI and refreshing providers after changes.
   */
  private async updateAndNotify(): Promise<void> {
    await this.sendProviderSettings();
    this.quickLinksProvider?.refreshProviderInfo();

    // Run heavy operations in background (don't block UI)
    this.settingsManager.reinitialize().then(() => {
      this.providerManager.refreshProviders().catch((error) => {
        console.error("Failed to refresh providers:", error);
      });
    });
  }

  /**
   * Handle saving provider settings.
   */
  private async handleSaveSettings(message: {
    provider?: string;
    config?: Record<string, string>;
  }): Promise<void> {
    if (!message.provider || !message.config) return;

    try {
      const providerInfo = this.getProviderInfo(message.provider);

      // Update active provider
      await this.llmProviderSettings.setProvider(message.provider);

      // Save each field from the dynamic config based on configSchema
      if (providerInfo) {
        for (const field of providerInfo.configSchema) {
          const value = message.config[field.key];
          // Skip apiKey only if provider doesn't require it
          // (but still save empty value to clear existing key)
          if (field.key === "apiKey" && !providerInfo.requiresApiKey) {
            continue;
          }
          await this.llmProviderSettings.set(
            message.provider,
            field.key,
            value,
          );
        }
      }

      // Reset connection status when settings are changed (require re-connect)
      await this.llmProviderSettings.setConnectionStatus(
        false,
        message.provider,
      );

      await this.updateAndNotify();
    } catch (error) {
      console.error("Failed to save provider settings:", error);
    }
  }

  /**
   * Handle activating a provider without resetting connection status.
   */
  private async handleActivateProvider(providerType: string): Promise<void> {
    try {
      await this.llmProviderSettings.setProvider(providerType);
      await this.updateAndNotify();
    } catch (error) {
      console.error("Failed to activate provider:", error);
    }
  }

  /**
   * Handle connecting to a provider.
   */
  private async handleConnectProvider(providerType: string): Promise<void> {
    if (!this.webview) return;

    console.log(
      `[LlmProviderMessageHandlers] handleConnectProvider called for: ${providerType}`,
    );

    try {
      await this.llmProviderSettings.setProvider(providerType);
      const providerInfo = this.getProviderInfo(providerType);

      if (providerInfo?.usesOAuth) {
        await this.connectWithOAuth(providerType, providerInfo);
      } else {
        await this.connectWithApiKey(providerType, providerInfo);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Connection failed";
      console.error(`Failed to connect provider ${providerType}:`, error);

      window.showErrorMessage(
        `Failed to connect to ${providerType.toUpperCase()}: ${errorMessage}`,
      );

      this.webview.postMessage({
        command: "connectionResult",
        provider: providerType,
        connected: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Handle connection result - show notification, update status, notify webview.
   */
  private async handleConnectionResult(
    providerType: string,
    displayName: string,
    connected: boolean,
    error: string | undefined,
  ): Promise<void> {
    if (!this.webview) return;

    await this.llmProviderSettings.setConnectionStatus(connected, providerType);

    if (connected) {
      window.showInformationMessage(
        `Successfully connected to ${displayName}.`,
      );
    } else {
      window.showErrorMessage(`Failed to connect to ${displayName}: ${error}`);
    }

    this.webview.postMessage({
      command: "connectionResult",
      provider: providerType,
      connected,
      error,
    });

    await this.sendProviderSettings();
    this.quickLinksProvider?.refreshProviderInfo();
  }

  /**
   * Connect to an OAuth-based provider (e.g., WCA).
   */
  private async connectWithOAuth(
    providerType: string,
    providerInfo: ProviderInfo | undefined,
  ): Promise<void> {
    await commands.executeCommand(LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST);

    // Wait for the OAuth flow to complete, then check status
    setTimeout(async () => {
      const isAuth = await this.lightspeedUser.isAuthenticated();
      const displayName =
        providerInfo?.displayName || providerType.toUpperCase();
      const error = isAuth
        ? undefined
        : "Authentication failed or was cancelled.";

      await this.handleConnectionResult(
        providerType,
        displayName,
        isAuth,
        error,
      );
    }, 2000);
  }

  /**
   * Connect to an API key-based provider (e.g., Google).
   */
  private async connectWithApiKey(
    providerType: string,
    providerInfo: ProviderInfo | undefined,
  ): Promise<void> {
    const result = await this.validateProviderConnection(providerType);
    const displayName = providerInfo?.displayName || providerType.toUpperCase();

    await this.handleConnectionResult(
      providerType,
      displayName,
      result.connected,
      result.error,
    );
  }

  /**
   * Validate connection to a provider.
   */
  private async validateProviderConnection(
    providerType: string,
  ): Promise<{ connected: boolean; error?: string }> {
    try {
      const providerInfo = this.getProviderInfo(providerType);

      const apiKey = await this.llmProviderSettings.get(providerType, "apiKey");
      const modelName = await this.llmProviderSettings.get(
        providerType,
        "modelName",
      );
      const storedEndpoint = await this.llmProviderSettings.get(
        providerType,
        "apiEndpoint",
      );

      if (providerInfo?.requiresApiKey && !apiKey) {
        return {
          connected: false,
          error:
            "API key is required. Please enter your API key in the settings.",
        };
      }

      // Use stored endpoint as-is (allows custom endpoints, v2, proxies, etc.)
      const apiEndpoint = storedEndpoint || "";

      const provider = providerFactory.createProvider(
        providerType as "google",
        {
          apiKey,
          modelName,
          apiEndpoint,
          enabled: true,
          provider: providerType,
          timeout: 30000,
          suggestions: { enabled: true, waitWindow: 0 },
        },
      );

      const status = await provider.getStatus();
      if (!status.connected) {
        return {
          connected: false,
          error: status.error || "Failed to connect to the provider.",
        };
      }
      return { connected: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(`Provider validation failed for ${providerType}:`, error);
      return { connected: false, error: errorMessage };
    }
  }
}
