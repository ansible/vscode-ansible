import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, window, Uri, Webview, commands } from "vscode";
import { SettingsManager } from "../../settings";
import { providerFactory } from "./providers/factory";
import { ProviderManager } from "./providerManager";
import { LlmProviderSettings } from "./llmProviderSettings";
import { LightSpeedCommands } from "../../definitions/lightspeed";
import { LightspeedUser } from "./lightspeedUser";
import { QuickLinksWebviewViewProvider } from "../quickLinks/utils/quickLinksViewProvider";
import { ProviderInfo } from "../../interfaces/lightspeed";

/**
 * Main panel for LLM Provider settings.
 * Opens as a full webview panel in the editor area.
 */
export class LlmProviderPanel {
  public static currentPanel: LlmProviderPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private readonly settingsManager: SettingsManager;
  private readonly providerManager: ProviderManager;
  private readonly llmProviderSettings: LlmProviderSettings;
  private readonly lightspeedUser: LightspeedUser;
  private readonly quickLinksProvider?: QuickLinksWebviewViewProvider;

  private constructor(
    panel: WebviewPanel,
    private readonly context: ExtensionContext,
    settingsManager: SettingsManager,
    providerManager: ProviderManager,
    llmProviderSettings: LlmProviderSettings,
    lightspeedUser: LightspeedUser,
    quickLinksProvider?: QuickLinksWebviewViewProvider,
  ) {
    this._panel = panel;
    this.settingsManager = settingsManager;
    this.providerManager = providerManager;
    this.llmProviderSettings = llmProviderSettings;
    this.lightspeedUser = lightspeedUser;
    this.quickLinksProvider = quickLinksProvider;

    // Set up panel lifecycle
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set the HTML content
    this._panel.webview.html = this._getWebviewContent(this._panel.webview);

    // Set up message listener
    this._setWebviewMessageListener(this._panel.webview);

    // Send initial settings
    this.sendProviderSettings(this._panel.webview);
  }

  /**
   * Renders the LLM Provider panel or reveals it if already open.
   */
  public static render(
    context: ExtensionContext,
    settingsManager: SettingsManager,
    providerManager: ProviderManager,
    llmProviderSettings: LlmProviderSettings,
    lightspeedUser: LightspeedUser,
    quickLinksProvider?: QuickLinksWebviewViewProvider,
  ) {
    if (LlmProviderPanel.currentPanel) {
      LlmProviderPanel.currentPanel._panel.reveal(ViewColumn.One);
    } else {
      const panel = window.createWebviewPanel(
        "llm-provider-settings",
        "LLM Provider Settings",
        ViewColumn.One,
        {
          enableScripts: true,
          enableCommandUris: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            Uri.joinPath(context.extensionUri, "out"),
            Uri.joinPath(context.extensionUri, "media"),
          ],
        },
      );

      LlmProviderPanel.currentPanel = new LlmProviderPanel(
        panel,
        context,
        settingsManager,
        providerManager,
        llmProviderSettings,
        lightspeedUser,
        quickLinksProvider,
      );
    }
  }

  /**
   * Refreshes the webview with updated settings.
   */
  public async refreshWebView() {
    await this.sendProviderSettings(this._panel.webview);
  }

  private _getWebviewContent(webview: Webview) {
    return __getWebviewHtml__({
      // vite dev mode
      serverUrl: `${process.env.VITE_DEV_SERVER_URL}webviews/llm-provider.html`,
      // vite prod mode
      webview,
      context: this.context,
      inputName: "llm-provider",
    });
  }

  /**
   * Get provider info by type from factory
   */
  private getProviderInfo(providerType: string): ProviderInfo | undefined {
    return providerFactory
      .getSupportedProviders()
      .find((p) => p.type === providerType);
  }

  /**
   * Common pattern for updating UI and refreshing providers after changes
   */
  private async updateAndNotify(): Promise<void> {
    await this.sendProviderSettings(this._panel.webview);
    this.quickLinksProvider?.refreshProviderInfo();

    // Run heavy operations in background (don't block UI)
    this.settingsManager.reinitialize().then(() => {
      this.providerManager.refreshProviders().catch((error) => {
        console.error("Failed to refresh providers:", error);
      });
    });
  }

  private async sendProviderSettings(webview: Webview) {
    const providers = providerFactory.getSupportedProviders();
    const settings = await this.llmProviderSettings.getAllSettings();
    const connectionStatuses = { ...settings.connectionStatuses };

    // Check connection status for OAuth providers from actual session
    for (const provider of providers) {
      if (provider.usesOAuth) {
        const isConnected = await this.lightspeedUser.isAuthenticated();
        connectionStatuses[provider.type] = isConnected;
        await this.llmProviderSettings.setConnectionStatus(
          isConnected,
          provider.type,
        );
      }
    }

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

    webview.postMessage({
      command: "providerSettings",
      providers: providers,
      currentProvider: settings.provider,
      providerConfigs: providerConfigs,
      connectionStatuses: connectionStatuses,
    });
  }

  private _setWebviewMessageListener(webview: Webview) {
    webview.onDidReceiveMessage(
      async (message) => {
        const command = message.command;

        switch (command) {
          case "getProviderSettings":
            await this.sendProviderSettings(webview);
            break;

          case "saveProviderSettings":
            await this.handleSaveSettings(message);
            break;

          case "activateProvider":
            await this.handleActivateProvider(message.provider);
            break;

          case "connectProvider":
            await this.handleConnectProvider(message.provider, webview);
            break;
        }
      },
      undefined,
      this._disposables,
    );
  }

  private async handleSaveSettings(message: {
    provider: string;
    config: Record<string, string>;
  }) {
    try {
      const providerInfo = this.getProviderInfo(message.provider);

      // Update active provider
      await this.llmProviderSettings.setProvider(message.provider);

      // Save each field from the dynamic config based on configSchema
      if (providerInfo) {
        for (const field of providerInfo.configSchema) {
          const value = message.config[field.key];
          // Skip apiKey if provider doesn't require it or value is empty
          if (field.key === "apiKey" && (!providerInfo.requiresApiKey || !value)) {
            continue;
          }
          await this.llmProviderSettings.set(message.provider, field.key, value);
        }
      }

      // Reset connection status when settings are changed (require re-connect)
      // Skip for OAuth providers since they use OAuth, not config changes
      if (!providerInfo?.usesOAuth) {
        await this.llmProviderSettings.setConnectionStatus(
          false,
          message.provider,
        );
      }

      await this.updateAndNotify();
    } catch (error) {
      console.error("Failed to save provider settings:", error);
    }
  }

  /**
   * Handles activating a provider without resetting connection status.
   * Used when user clicks "Activate" button (provider is already connected).
   */
  private async handleActivateProvider(providerType: string) {
    try {
      // Only update the active provider - don't touch connection status
      await this.llmProviderSettings.setProvider(providerType);
      await this.updateAndNotify();
    } catch (error) {
      console.error("Failed to activate provider:", error);
    }
  }

  private async handleConnectProvider(providerType: string, webview: Webview) {
    console.log(
      `[LlmProviderPanel] handleConnectProvider called for: ${providerType}`,
    );

    try {
      // Set this provider as active
      await this.llmProviderSettings.setProvider(providerType);
      const providerInfo = this.getProviderInfo(providerType);

      // Route to appropriate connection method based on provider flags
      if (providerInfo?.usesOAuth) {
        await this.connectWithOAuth(providerType, providerInfo, webview);
      } else {
        await this.connectWithApiKey(providerType, providerInfo, webview);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Connection failed";
      console.error(`Failed to connect provider ${providerType}:`, error);

      window.showErrorMessage(
        `Failed to connect to ${providerType.toUpperCase()}: ${errorMessage}`,
      );

      webview.postMessage({
        command: "connectionResult",
        provider: providerType,
        connected: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Handle connection result - show notification, update status, notify webview
   */
  private async handleConnectionResult(
    providerType: string,
    displayName: string,
    connected: boolean,
    error: string | undefined,
    webview: Webview,
  ): Promise<void> {
    await this.llmProviderSettings.setConnectionStatus(connected, providerType);

    if (connected) {
      window.showInformationMessage(`Successfully connected to ${displayName}.`);
    } else {
      window.showErrorMessage(`Failed to connect to ${displayName}: ${error}`);
    }

    webview.postMessage({
      command: "connectionResult",
      provider: providerType,
      connected,
      error,
    });

    await this.sendProviderSettings(webview);
    this.quickLinksProvider?.refreshProviderInfo();
  }

  /**
   * Connect to an OAuth-based provider (e.g., WCA)
   */
  private async connectWithOAuth(
    providerType: string,
    providerInfo: ProviderInfo | undefined,
    webview: Webview,
  ): Promise<void> {
    // Trigger OAuth flow
    await commands.executeCommand(LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST);

    // Wait for the OAuth flow to complete, then check status
    setTimeout(async () => {
      const isAuth = await this.lightspeedUser.isAuthenticated();
      const displayName = providerInfo?.displayName || providerType.toUpperCase();
      const error = isAuth ? undefined : "Authentication failed or was cancelled.";

      await this.handleConnectionResult(providerType, displayName, isAuth, error, webview);
    }, 2000);
  }

  /**
   * Connect to an API key-based provider (e.g., Google)
   */
  private async connectWithApiKey(
    providerType: string,
    providerInfo: ProviderInfo | undefined,
    webview: Webview,
  ): Promise<void> {
    const result = await this.validateProviderConnection(providerType);
    const displayName = providerInfo?.displayName || providerType.toUpperCase();

    await this.handleConnectionResult(
      providerType,
      displayName,
      result.connected,
      result.error,
      webview,
    );
  }

  private async validateProviderConnection(
    providerType: string,
  ): Promise<{ connected: boolean; error?: string }> {
    try {
      const providerInfo = this.getProviderInfo(providerType);

      // Get current settings using generic API
      const apiKey = await this.llmProviderSettings.get(providerType, "apiKey");
      const modelName = await this.llmProviderSettings.get(
        providerType,
        "modelName",
      );
      const storedEndpoint = await this.llmProviderSettings.get(
        providerType,
        "apiEndpoint",
      );

      // Check if API key is required but not provided
      if (providerInfo?.requiresApiKey && !apiKey) {
        return {
          connected: false,
          error:
            "API key is required. Please enter your API key in the settings.",
        };
      }

      // Only use custom endpoint if it's localhost (for testing)
      // Otherwise, let the factory use the default endpoint
      const isLocalhostUrl = storedEndpoint?.startsWith("http://localhost");
      const apiEndpoint = isLocalhostUrl ? storedEndpoint : "";

      // Create a temporary provider instance to validate
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

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    LlmProviderPanel.currentPanel = undefined;

    // Dispose of the panel and all disposables
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
