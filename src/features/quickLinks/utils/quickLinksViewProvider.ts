import {
  CancellationToken,
  ExtensionContext,
  Uri,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from "vscode";
import { getSystemDetails } from "../../utils/getSystemDetails";
import { LlmProviderSettings } from "../../lightspeed/llmProviderSettings";
import { providerFactory } from "../../lightspeed/providers/factory";

export class QuickLinksWebviewViewProvider implements WebviewViewProvider {
  public static readonly viewType = "ansible-home";
  private _webviewView: WebviewView | undefined;

  constructor(
    private readonly _extensionUri: Uri,
    private readonly _context: ExtensionContext,
    private readonly _llmProviderSettings?: LlmProviderSettings,
  ) {
    // no action
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken,
  ) {
    this._webviewView = webviewView;

    // Allow scripts in the webview
    webviewView.webview.options = {
      // Enable JavaScript in the webview
      enableScripts: true,
      // Restrict the webview to only load resources from the `out` and `media` directory
      enableCommandUris: true,
      localResourceRoots: [
        Uri.joinPath(this._extensionUri, "out"),
        Uri.joinPath(this._extensionUri, "media"),
      ],
    };
    this._setWebviewMessageListener(webviewView.webview);

    // Set the HTML content that will fill the webview view
    webviewView.webview.html = this._getWebviewQuickLinks(
      webviewView.webview,
      this._extensionUri,
    );
  }

  /**
   * Refresh the webview with updated provider info
   */
  public refreshProviderInfo() {
    if (this._webviewView && this._llmProviderSettings) {
      this.sendActiveProviderInfo(this._webviewView.webview);
    }
  }

  private _getWebviewQuickLinks(webview: Webview, extensionUri: Uri) {
    // Use the new Vue-based webview
    return this._getVueWebviewContent(webview, extensionUri);
  }

  private _getVueWebviewContent(
    webview: Webview,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    extensionUri: Uri,
  ) {
    return __getWebviewHtml__({
      // vite dev mode
      serverUrl: `${process.env.VITE_DEV_SERVER_URL}webviews/quick-links.html`,
      // vite prod mode
      webview,
      context: this._context,
      inputName: "quick-links",
    });
  }

  private _setWebviewMessageListener(webview: Webview) {
    let currentSystemInfo;
    webview.onDidReceiveMessage(async (message) => {
      const command = message.message || message.command;
      if (command === "set-system-status-view") {
        currentSystemInfo = await getSystemDetails();
        webview.postMessage({
          command: "systemDetails",
          arguments: currentSystemInfo,
        });
      } else if (command === "getActiveProvider") {
        this.sendActiveProviderInfo(webview);
      }
    }, undefined);
  }

  private sendActiveProviderInfo(webview: Webview) {
    if (!this._llmProviderSettings) {
      webview.postMessage({
        command: "activeProviderInfo",
        providerType: "wca",
        providerDisplayName: "Watson Code Assistant",
        isConnected: false,
      });
      return;
    }

    const providerType = this._llmProviderSettings.getProvider();
    const isConnected =
      this._llmProviderSettings.getConnectionStatus(providerType);

    // Get display name from provider factory
    const providers = providerFactory.getSupportedProviders();
    const providerInfo = providers.find((p) => p.type === providerType);
    const displayName = providerInfo?.displayName || providerType;

    webview.postMessage({
      command: "activeProviderInfo",
      providerType: providerType,
      providerDisplayName: displayName,
      isConnected: isConnected,
    });
  }
}
