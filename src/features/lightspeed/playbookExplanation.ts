import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import * as marked from "marked";
import { SettingsManager } from "../../settings";

export const playbookExplanation = async (
  extensionUri: vscode.Uri,
  client: LanguageClient,
  lightSpeedAuthProvider: LightSpeedAuthenticationProvider,
  settingsManager: SettingsManager
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
  const explanation: string = await client.sendRequest("playbook/explanation", {
    accessToken: accessToken,
    URL: settingsManager.settings.lightSpeedService.URL,
    content: content,
  });

  PlaybookExplanationPanel.createOrShow(extensionUri, explanation);
};

export class PlaybookExplanationPanel {
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
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "media"),
        ],
        enableCommandUris: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.onDidReceiveMessage((message) => {
      const command = message.command;
      switch (command) {
        case "thumbsUp":
        case "thumbsDown":
          vscode.commands.executeCommand("ansible.lightspeed.thumbsUpDown");
          break;
      }
    });

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
    this._panel.webview.html = this.getHtmlForWebview(webview, explanation);
  }

  private getHtmlForWebview(webview: vscode.Webview, explanation: string) {
    const webviewUri = getUri(webview, this._extensionUri, [
      "out",
      "client",
      "webview",
      "apps",
      "lightspeed",
      "playbookExplanation",
      "main.js",
    ]);
    const styleUri = getUri(webview, this._extensionUri, [
      "media",
      "playbookGeneration",
      "style.css",
    ]);
    const codiconsUri = getUri(webview, this._extensionUri, [
      "media",
      "codicons",
      "codicon.css",
    ]);
    const nonce = getNonce();
    const markdown = explanation;
    const html = marked.parse(markdown);
    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource};">
        <link rel="stylesheet" href="${codiconsUri}">
        <link rel="stylesheet" href="${styleUri}">
				<title>Playbook explanation</title>
			</head>
			<body>
        <div class="playbookGeneration">
          ${html}
        </div>
        <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
			</body>
			</html>`;
  }
}
