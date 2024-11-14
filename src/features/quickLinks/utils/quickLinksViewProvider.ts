import {
  CancellationToken,
  Uri,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from "vscode";
import { getWebviewQuickLinks } from "../quickLinksView";
import { getSystemDetails } from "../../utils/getSystemDetails";

export class QuickLinksWebviewViewProvider implements WebviewViewProvider {
  public static readonly viewType = "ansible-home";

  constructor(private readonly _extensionUri: Uri) {
    // no action
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken,
  ) {
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

  private _getWebviewQuickLinks(webview: Webview, extensionUri: Uri) {
    return getWebviewQuickLinks(webview, extensionUri);
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
      }
    }, undefined);
  }
}
