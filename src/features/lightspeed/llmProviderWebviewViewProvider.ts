import {
  CancellationToken,
  ExtensionContext,
  Uri,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from "vscode";
import { SettingsManager } from "../../settings";
import { providerFactory } from "./providers/factory";
import { ProviderManager } from "./providerManager";
import { LlmProviderSettings } from "./llmProviderSettings";

export class LlmProviderWebviewViewProvider implements WebviewViewProvider {
  public static readonly viewType = "llm-provider-webview";

  private webviewView: WebviewView | undefined;
  private readonly settingsManager: SettingsManager;
  private readonly providerManager: ProviderManager;
  private readonly llmProviderSettings: LlmProviderSettings;

  constructor(
    private readonly _extensionUri: Uri,
    private readonly _context: ExtensionContext,
    settingsManager: SettingsManager,
    providerManager: ProviderManager,
    llmProviderSettings: LlmProviderSettings,
  ) {
    this.settingsManager = settingsManager;
    this.providerManager = providerManager;
    this.llmProviderSettings = llmProviderSettings;
  }

  public async refreshWebView() {
    if (!this.webviewView) {
      return;
    }
    // Send updated settings to the webview
    await this.sendProviderSettings(this.webviewView.webview);
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken,
  ) {
    this.webviewView = webviewView;

    // Allow scripts in the webview
    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        Uri.joinPath(this._extensionUri, "out"),
        Uri.joinPath(this._extensionUri, "media"),
      ],
    };

    // Set up message listener
    this._setWebviewMessageListener(webviewView.webview);

    // Set the HTML content
    webviewView.webview.html = this._getWebviewContent(webviewView.webview);
  }

  private _getWebviewContent(
    webview: Webview,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ) {
    return __getWebviewHtml__({
      // vite dev mode
      serverUrl: `${process.env.VITE_DEV_SERVER_URL}webviews/llm-provider.html`,
      // vite prod mode
      webview,
      context: this._context,
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
    webview.onDidReceiveMessage(async (message) => {
      const command = message.command;

      switch (command) {
        case "getProviderSettings":
          await this.sendProviderSettings(webview);
          break;

        case "saveProviderSettings":
          await this.handleSaveSettings(message);
          break;
      }
    }, undefined);
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

      // Update API key if provided (for non-WCA providers)
      if (message.provider !== "wca") {
        await this.llmProviderSettings.setApiKey(message.apiKey || undefined);
      } else {
        // Clear API key when switching to WCA (uses OAuth)
        await this.llmProviderSettings.setApiKey(undefined);
      }

      // Update model name if provided
      await this.llmProviderSettings.setModelName(
        message.modelName || undefined,
      );

      // Update API endpoint if provided
      await this.llmProviderSettings.setApiEndpoint(
        message.apiEndpoint || undefined,
      );

      // Reinitialize settings
      await this.settingsManager.reinitialize();

      // Refresh provider manager
      await this.providerManager.refreshProviders();

      // Send updated settings back to webview (with defaults applied)
      if (this.webviewView) {
        await this.sendProviderSettings(this.webviewView.webview);
      }
    } catch (error) {
      console.error("Failed to save provider settings:", error);
    }
  }
}
