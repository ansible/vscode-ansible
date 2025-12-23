import {
  CancellationToken,
  ExtensionContext,
  Uri,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
  workspace,
  ConfigurationTarget,
} from "vscode";
import { SettingsManager } from "../../settings";
import { providerFactory } from "./providers/factory";
import { ProviderManager } from "./providerManager";

export class LlmProviderWebviewViewProvider implements WebviewViewProvider {
  public static readonly viewType = "llm-provider-webview";

  private webviewView: WebviewView | undefined;
  private readonly settingsManager: SettingsManager;
  private readonly providerManager: ProviderManager;

  constructor(
    private readonly _extensionUri: Uri,
    private readonly _context: ExtensionContext,
    settingsManager: SettingsManager,
    providerManager: ProviderManager,
  ) {
    this.settingsManager = settingsManager;
    this.providerManager = providerManager;
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
    const lightspeedConfig = workspace.getConfiguration("ansible.lightspeed");

    const currentProvider = lightspeedConfig.get<string>("provider", "wca");
    const apiKey = lightspeedConfig.get<string>("apiKey", "");
    const modelName = lightspeedConfig.get<string>("modelName", "");

    webview.postMessage({
      command: "providerSettings",
      providers: providers,
      currentProvider: currentProvider,
      apiKey: apiKey,
      modelName: modelName,
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
  }) {
    try {
      const lightspeedConfig =
        workspace.getConfiguration("ansible.lightspeed");

      // Update provider
      await lightspeedConfig.update(
        "provider",
        message.provider,
        ConfigurationTarget.Workspace,
      );

      // Update API key if provided (for non-WCA providers)
      if (message.provider !== "wca" && message.apiKey) {
        await lightspeedConfig.update(
          "apiKey",
          message.apiKey,
          ConfigurationTarget.Workspace,
        );
      }

      // Update model name if provided
      if (message.modelName) {
        await lightspeedConfig.update(
          "modelName",
          message.modelName,
          ConfigurationTarget.Workspace,
        );
      }

      // Reinitialize settings
      await this.settingsManager.reinitialize();

      // Refresh provider manager
      await this.providerManager.refreshProviders();
    } catch (error) {
      console.error("Failed to save provider settings:", error);
    }
  }
}
