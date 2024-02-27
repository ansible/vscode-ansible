import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";

export const playbookExplanation = async (
  extensionUri: vscode.Uri,
  lsclient: LanguageClient,
  lightSpeedAuthProvider: LightSpeedAuthenticationProvider
) => {
  if (!vscode.window.activeTextEditor) {
    return;
  }
  const document = vscode.window.activeTextEditor.document;
  if (document?.languageId !== "ansible") {
    return;
  }
  const content = document.getText();

  const accessToken = await lightSpeedAuthProvider.grantAccessToken();
  console.log(
    `BLABLABAL - lsclient.isRunning: ${lsclient.isRunning()} -- ${accessToken}`
  );
  const explanation: string = await lsclient.sendRequest(
    "playbook/explanation",
    { accessToken: accessToken, content: content }
  );

  PlaybookExplanationPanel.createOrShow(extensionUri, explanation);
};

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: false,
  };
}

/**
 * Manages cat coding webview panels
 */
export class PlaybookExplanationPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: PlaybookExplanationPanel | undefined;

  public static readonly viewType = "Explanation";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, explanation: string) {
    const panel = vscode.window.createWebviewPanel(
      PlaybookExplanationPanel.viewType,
      "Explanation",
      vscode.ViewColumn.Beside,
      getWebviewOptions(extensionUri)
    );

    PlaybookExplanationPanel.currentPanel = new PlaybookExplanationPanel(
      panel,
      extensionUri,
      explanation
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    explanation: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._refreshExplanation(this._panel.webview, explanation);
    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "alert":
            vscode.window.showErrorMessage(message.text);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public doRefactor() {
    // Send a message to the webview webview.
    // You can send any JSON serializable data.
    this._panel.webview.postMessage({ command: "refactor" });
  }

  public dispose() {
    PlaybookExplanationPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _refreshExplanation(webview: vscode.Webview, explanation: string) {
    this._panel.webview.html = this._getHtmlForWebview(webview, explanation);
  }

  private _getHtmlForWebview(webview: vscode.Webview, explanation: string) {
    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<title>Playbook explanation</title>
			</head>
			<body>
                <p>Here a summary of the playbook.</p>
                <p>And an explanation of the purpose of each task:

                <ul>
                    <li><p>My first task blabla</p></li>
                    <li><p>My second task is also doing blabla</p></li>
                </ul>

                ${explanation}
                </p>
			</body>
			</html>`;
  }
}
