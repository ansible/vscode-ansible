import {
  CancellationToken,
  Uri,
  window,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from "vscode";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";

export class LightspeedFeedbackViewProvider implements WebviewViewProvider {
  public static readonly viewType = "lightspeed-feedback-webview";

  constructor(private readonly _extensionUri: Uri) {}

  public resolveWebviewView(
    webviewView: WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken
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
      this._extensionUri
    );

    // Sets up an event listener to listen for messages passed from the webview view context
    // and executes code based on the message that is received
    this._setWebviewMessageListener(webviewView);
  }

  private _getWebviewContent(webview: Webview, extensionUri: Uri) {
    const webviewUri = getUri(webview, extensionUri, [
      "out",
      "client",
      "webview.js",
    ]);
    const styleUri = getUri(webview, extensionUri, ["media", "style.css"]);
    const nonce = getNonce();

    return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="${styleUri}">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <title>Ansible Lightspeed Feedback!</title>
      </head>
      <body>
        <form id="feedback-form">
          <section class="component-container">
            <h3>How was your experience?</h3>
            <section class="sentiment-button">
              <vscode-button appearance="icon" id="very-negative">😞</vscode-button>
              <vscode-button appearance="icon" id="negative">🙁</vscode-button>
              <vscode-button appearance="icon" id="neutral">😐</vscode-button>
              <vscode-button appearance="icon" id="positive">🙂</vscode-button>
              <vscode-button appearance="icon" id="very-positive">😀</vscode-button>
            </section>
          </section>
          <section class="component-section">
              <p>Tell us why?</p>
              <vscode-text-area maxlength="512" cols="29" resize="both" id="sentiment-comment"></vscode-text-area>
          </section>
          <section class="component-section">
              <vscode-button id="sentiment-submit">Send</vscode-button>
          </section>
      <vscode-divider></vscode-divider>
      <section class="component-container">
          <h3>Tell us more</h3>
            <section class="component-section">
              <vscode-dropdown id="issue-type-dropdown" class="issue-dropdown">
                <vscode-option selected value="select-issue-type">Select Issue type</vscode-option>
                <vscode-option value="bug-report">Bug report</vscode-option>
                <vscode-option value="feature-request">Feature request</vscode-option>
                <vscode-option value="suggestion-feedback">Suggestion feedback</vscode-option>
              </vscode-dropdown>
            </section>
              <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
        </form>
      </body>
    </html>
    `;
  }

  private _setWebviewMessageListener(webviewView: WebviewView) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webviewView.webview.onDidReceiveMessage((message: any) => {
      const error = message.error;
      if (error) {
        window.showErrorMessage(error);
        return;
      }
      window.showInformationMessage(message);
      console.log("-----message------", message);
    });
  }
}
