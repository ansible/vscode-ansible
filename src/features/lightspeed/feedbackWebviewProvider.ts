import {
  Disposable,
  Webview,
  WebviewPanel,
  window,
  Uri,
  ViewColumn,
} from "vscode";
import {
  getWebviewContent,
  setWebviewMessageListener,
} from "./utils/feedbackView";

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
      extensionUri,
    );

    // Set an event listener to listen for messages passed from the webview context
    this._setWebviewMessageListener(this._panel.webview);
  }

  public static render(extensionUri: Uri) {
    if (LightspeedFeedbackWebviewProvider.currentPanel) {
      // If the webview panel already exists reveal it
      LightspeedFeedbackWebviewProvider.currentPanel._panel.reveal(
        ViewColumn.One,
      );
    } else {
      // If a webview panel does not already exist create and show a new one
      const panel = window.createWebviewPanel(
        "ansibleLightSpeedFeedback",
        "Ansible Lightspeed Feedback",
        ViewColumn.One,
        {
          // Enable JavaScript in the webview
          enableScripts: true,
          // Restrict the webview to only load resources from the `out` directory
          localResourceRoots: [
            Uri.joinPath(extensionUri, "out"),
            Uri.joinPath(extensionUri, "media"),
          ],
        },
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
    return getWebviewContent(webview, extensionUri);
  }

  private async _setWebviewMessageListener(webview: Webview) {
    await setWebviewMessageListener(webview, this._disposables);
  }
}
