import {
  Disposable,
  Webview,
  WebviewPanel,
  window,
  Uri,
  ViewColumn,
} from "vscode";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";

export class LightspeedFeedbackWebviewProvider {
  public static currentPanel: LightspeedFeedbackWebviewProvider | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, extensionUri: Uri) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set the HTML content for the webview panel
    this._panel.webview.html = this._getWebviewContent(
      this._panel.webview,
      extensionUri
    );

    // Set an event listener to listen for messages passed from the webview context
    this._setWebviewMessageListener(this._panel.webview);
  }

  public static render(extensionUri: Uri) {
    if (LightspeedFeedbackWebviewProvider.currentPanel) {
      // If the webview panel already exists reveal it
      LightspeedFeedbackWebviewProvider.currentPanel._panel.reveal(
        ViewColumn.One
      );
    } else {
      // If a webview panel does not already exist create and show a new one
      const panel = window.createWebviewPanel(
        "ansibleLightSpeedFeedback",
        "Ansible LightSpeed Feedback",
        ViewColumn.One,
        {
          // Enable JavaScript in the webview
          enableScripts: true,
          // Restrict the webview to only load resources from the `out` directory
          localResourceRoots: [
            Uri.joinPath(extensionUri, "out"),
            Uri.joinPath(extensionUri, "media"),
          ],
        }
      );

      LightspeedFeedbackWebviewProvider.currentPanel =
        new LightspeedFeedbackWebviewProvider(panel, extensionUri);
    }
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    LightspeedFeedbackWebviewProvider.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) associated with the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
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
                <div class="sentiment-selector">
                    <input id="very-negative" value=1 type="radio" name="sentiment" value="very-negative" />
                    <label class="sentiment very-negative" for="very-negative"></label>
                    <input id="negative" value=2 type="radio" name="sentiment" value="negative" />
                    <label class="sentiment negative"for="negative"></label>
                    <input id="neutral" value=3 type="radio" name="sentiment" value="neutral" />
                    <label class="sentiment neutral"for="neutral"></label>
                    <input id="positive" value=4 type="radio" name="sentiment" value="positive" />
                    <label class="sentiment positive"for="positive"></label>
                    <input id="very-positive" value=5 type="radio" name="sentiment" value="very-positive" />
                    <label class="sentiment very-positive"for="very-positive"></label>
                </div>
              </section>
            </section>
            <section class="component-section">
                <p class="required">Tell us why?</p>
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

  private _setWebviewMessageListener(webview: Webview) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webview.onDidReceiveMessage(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (message: any) => {
        const error = message.error;
        if (error) {
          window.showErrorMessage(error);
          return;
        } else {
          window.showInformationMessage("Thanks for your feedback!");
        }
        console.log("-----message------", message);
      },
      undefined,
      this._disposables
    );
  }
}
