import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, window, Uri, Webview, commands } from "vscode";
import { SettingsManager } from "../../settings";
import { providerFactory } from "./providers/factory";
import { ProviderManager } from "./providerManager";
import { LlmProviderSettings } from "./llmProviderSettings";
import { LightSpeedCommands } from "../../definitions/lightspeed";
import { LightspeedUser } from "./lightspeedUser";
import { QuickLinksWebviewViewProvider } from "../quickLinks/utils/quickLinksViewProvider";

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

  private async sendProviderSettings(webview: Webview) {
    const providers = providerFactory.getSupportedProviders();
    const settings = await this.llmProviderSettings.getAllSettings();

    // Check WCA connection status from actual session
    const wcaConnected = await this.lightspeedUser.isAuthenticated();
    const connectionStatuses = { ...settings.connectionStatuses };
    connectionStatuses["wca"] = wcaConnected;

    // Persist WCA status
    await this.llmProviderSettings.setConnectionStatus(wcaConnected, "wca");

    // Build configs for ALL providers so webview has correct values
    const providerConfigs: Record<
      string,
      { apiKey: string; modelName: string; apiEndpoint: string }
    > = {};
    for (const provider of providers) {
      const providerType = provider.type;
      providerConfigs[providerType] = {
        apiKey: await this.llmProviderSettings.getApiKey(providerType),
        modelName: this.llmProviderSettings.getModelName(providerType) ?? "",
        apiEndpoint: this.llmProviderSettings.getApiEndpoint(providerType),
      };
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
    apiKey: string;
    modelName: string;
    apiEndpoint: string;
  }) {
    try {
      // Update provider
      await this.llmProviderSettings.setProvider(message.provider);

      // Update API key for the specific provider (stored per-provider)
      // Only update if a key is provided - don't clear existing keys
      if (message.provider !== "wca" && message.apiKey) {
        await this.llmProviderSettings.setApiKey(
          message.apiKey,
          message.provider,
        );
      }

      // Update model name for the specific provider (stored per-provider)
      await this.llmProviderSettings.setModelName(
        message.modelName || undefined,
        message.provider,
      );

      // Update API endpoint for the specific provider (stored per-provider)
      await this.llmProviderSettings.setApiEndpoint(
        message.apiEndpoint || undefined,
        message.provider,
      );

      // Reset connection status when settings are changed (require re-connect)
      // Skip for WCA since it uses OAuth, not config changes
      if (message.provider !== "wca") {
        await this.llmProviderSettings.setConnectionStatus(
          false,
          message.provider,
        );
      }

      // Send updated settings back to webview immediately for fast UI response
      await this.sendProviderSettings(this._panel.webview);

      // Refresh the QuickLinks sidebar to show updated provider info
      this.quickLinksProvider?.refreshProviderInfo();

      // Run heavy operations in background (don't block UI)
      this.settingsManager.reinitialize().then(() => {
        this.providerManager.refreshProviders().catch((error) => {
          console.error("Failed to refresh providers:", error);
        });
      });
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

      // Send updated settings back to webview
      await this.sendProviderSettings(this._panel.webview);

      // Refresh the QuickLinks sidebar to show updated provider info
      this.quickLinksProvider?.refreshProviderInfo();

      // Reinitialize settings manager in background
      this.settingsManager.reinitialize().then(() => {
        this.providerManager.refreshProviders().catch((error) => {
          console.error("Failed to refresh providers:", error);
        });
      });
    } catch (error) {
      console.error("Failed to activate provider:", error);
    }
  }

  private async handleConnectProvider(providerType: string, webview: Webview) {
    console.log(`[LlmProviderPanel] handleConnectProvider called for: ${providerType}`);

    try {
      // Set this provider as active
      console.log(`[LlmProviderPanel] Setting provider to: ${providerType}`);
      await this.llmProviderSettings.setProvider(providerType);
      console.log(`[LlmProviderPanel] Provider set. Current provider: ${this.llmProviderSettings.getProvider()}`);

      // Connect using backend's stored values
      if (providerType === "wca") {
        console.log(`[LlmProviderPanel] WCA detected, triggering OAuth flow...`);

        // For WCA, trigger OAuth flow
        await commands.executeCommand(
          LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
        );
        console.log(`[LlmProviderPanel] OAuth command executed`);

        // Wait a bit for the OAuth flow to complete, then refresh
        // The actual status will be checked on next sendProviderSettings call
        setTimeout(async () => {
          console.log(`[LlmProviderPanel] Checking WCA auth status...`);
          const isAuth = await this.lightspeedUser.isAuthenticated();
          console.log(`[LlmProviderPanel] WCA isAuthenticated: ${isAuth}`);
          
          // Show notification based on auth result
          if (isAuth) {
            window.showInformationMessage(
              "Successfully connected to Watson Code Assistant."
            );
            await this.llmProviderSettings.setConnectionStatus(true, providerType);
          } else {
            window.showErrorMessage(
              "Failed to connect to Watson Code Assistant. Please try again or check your credentials."
            );
            await this.llmProviderSettings.setConnectionStatus(false, providerType);
          }
          
          // Send result back to webview
          webview.postMessage({
            command: "connectionResult",
            provider: providerType,
            connected: isAuth,
            error: isAuth ? undefined : "Authentication failed or was cancelled.",
          });
          
          await this.sendProviderSettings(webview);
          // Also refresh the QuickLinks sidebar
          this.quickLinksProvider?.refreshProviderInfo();
        }, 2000); // Increased timeout to give OAuth more time
      } else {
        // For other providers (e.g., Google), validate using getStatus()
        const result = await this.validateProviderConnection(providerType);
        await this.llmProviderSettings.setConnectionStatus(
          result.connected,
          providerType,
        );

        // Show VS Code notification for success or failure
        if (result.connected) {
          window.showInformationMessage(
            `Successfully connected to ${providerType.toUpperCase()} provider.`
          );
        } else {
          window.showErrorMessage(
            `Failed to connect to ${providerType.toUpperCase()}: ${result.error}`
          );
        }

        // Send result back to webview
        webview.postMessage({
          command: "connectionResult",
          provider: providerType,
          connected: result.connected,
          error: result.error,
        });

        // Refresh all settings
        await this.sendProviderSettings(webview);
        // Also refresh the QuickLinks sidebar
        this.quickLinksProvider?.refreshProviderInfo();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Connection failed";
      console.error(`Failed to connect provider ${providerType}:`, error);
      
      // Show error notification
      window.showErrorMessage(
        `Failed to connect to ${providerType.toUpperCase()}: ${errorMessage}`
      );
      
      webview.postMessage({
        command: "connectionResult",
        provider: providerType,
        connected: false,
        error: errorMessage,
      });
    }
  }

  private async validateProviderConnection(
    providerType: string,
  ): Promise<{ connected: boolean; error?: string }> {
    try {
      // Get current settings for the specific provider (per-provider storage)
      const apiKey = await this.llmProviderSettings.getApiKey(providerType);
      const modelName = this.llmProviderSettings.getModelName(providerType);
      const storedEndpoint =
        this.llmProviderSettings.getApiEndpoint(providerType);

      if (!apiKey) {
        return { connected: false, error: "API key is required. Please enter your API key in the settings." };
      }

      // For Google provider, only use endpoint if it's localhost (for testing)
      // Otherwise, let the factory use the default endpoint
      let apiEndpoint = storedEndpoint;
      if (providerType === "google") {
        const isLocalhostUrl = storedEndpoint?.startsWith("http://localhost");
        apiEndpoint = isLocalhostUrl ? storedEndpoint : "";
      }

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
        return { connected: false, error: status.error || "Failed to connect to the provider." };
      }
      return { connected: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
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
