import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, window, Uri, Webview } from "vscode";
import { SettingsManager } from "../../settings";
import { providerFactory } from "./providers/factory";
import { ProviderManager } from "./providerManager";
import { LlmProviderSettings } from "./llmProviderSettings";

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

  private constructor(
    panel: WebviewPanel,
    private readonly context: ExtensionContext,
    settingsManager: SettingsManager,
    providerManager: ProviderManager,
    llmProviderSettings: LlmProviderSettings,
  ) {
    this._panel = panel;
    this.settingsManager = settingsManager;
    this.providerManager = providerManager;
    this.llmProviderSettings = llmProviderSettings;

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

    webview.postMessage({
      command: "providerSettings",
      providers: providers,
      currentProvider: settings.provider,
      apiKey: settings.apiKey,
      modelName: settings.modelName ?? "",
      apiEndpoint: settings.apiEndpoint,
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

      // Update model name if provided
      await this.llmProviderSettings.setModelName(
        message.modelName || undefined,
      );

      // Update API endpoint if provided
      await this.llmProviderSettings.setApiEndpoint(
        message.apiEndpoint || undefined,
      );

      // Send updated settings back to webview immediately for fast UI response
      await this.sendProviderSettings(this._panel.webview);

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
