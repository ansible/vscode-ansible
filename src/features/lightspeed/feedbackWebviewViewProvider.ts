import {
  CancellationToken,
  Uri,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from "vscode";
import {
  getWebviewContent,
  setWebviewMessageListener,
} from "./utils/feedbackView";

export class LightspeedFeedbackWebviewViewProvider
  implements WebviewViewProvider
{
  public static readonly viewType = "lightspeed-feedback-webview";

  constructor(private readonly _extensionUri: Uri) {
    // do nothing
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
      localResourceRoots: [
        Uri.joinPath(this._extensionUri, "out"),
        Uri.joinPath(this._extensionUri, "media"),
      ],
    };
    console.log("localResourceRoots", [
      Uri.joinPath(this._extensionUri, "out"),
      Uri.joinPath(this._extensionUri, "media"),
    ]);
    // Set the HTML content that will fill the webview view
    webviewView.webview.html = this._getWebviewContent(
      webviewView.webview,
      this._extensionUri,
    );

    // Sets up an event listener to listen for messages passed from the webview view context
    // and executes code based on the message that is received
    this._setWebviewMessageListener(webviewView);
  }

  private _getWebviewContent(webview: Webview, extensionUri: Uri) {
    return getWebviewContent(webview, extensionUri);
  }

  private _setWebviewMessageListener(webviewView: WebviewView) {
    return setWebviewMessageListener(webviewView.webview);
  }
}
