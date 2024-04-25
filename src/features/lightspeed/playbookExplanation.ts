import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import * as marked from "marked";
import { SettingsManager } from "../../settings";
import { lightSpeedManager } from "../../extension";
import { LightspeedUser } from "./lightspeedUser";

export const playbookExplanation = async (
  extensionUri: vscode.Uri,
  client: LanguageClient,
  lightspeedAuthenticatedUser: LightspeedUser,
  settingsManager: SettingsManager,
) => {
  if (!vscode.window.activeTextEditor) {
    return;
  }
  const document = vscode.window.activeTextEditor.document;
  if (document?.languageId !== "ansible") {
    return;
  }
  const currentPanel = PlaybookExplanationPanel.createOrShow(extensionUri);
  currentPanel.setContent(
    `<div id="icons">
        <span class="codicon codicon-loading codicon-modifier-spin"></span>
        Loading the explanation for ${document.fileName.split("/").at(-1)}
      </div>`,
  );

  const content = document.getText();
  const lightSpeedStatusbarText =
    await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText(true);

  const accessToken =
    await lightspeedAuthenticatedUser.getLightspeedUserAccessToken();
  let markdown = "";
  lightSpeedManager.statusBarProvider.statusBar.text = `$(loading~spin) ${lightSpeedStatusbarText}`;
  try {
    markdown = await client.sendRequest("playbook/explanation", {
      accessToken: accessToken,
      URL: settingsManager.settings.lightSpeedService.URL,
      content: content,
    });
  } catch (e) {
    console.log(e);
    currentPanel.setContent(
      `<p><span class="codicon codicon-error"></span>Cannot load the explanation: <code>${e}</code></p>`,
    );
    return;
  } finally {
    lightSpeedManager.statusBarProvider.statusBar.text =
      lightSpeedStatusbarText;
  }

  const html_snippet = await marked.parse(markdown);
  currentPanel.setContent(html_snippet, true);
};

export class PlaybookExplanationPanel {
  public static currentPanel: PlaybookExplanationPanel | undefined;

  public static readonly viewType = "Explanation";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
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
      },
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

    return new PlaybookExplanationPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "alert":
            vscode.window.showErrorMessage(message.text);
            return;
        }
      },
      null,
      this._disposables,
    );
  }

  public setContent(html_snippet: string, showFeedbackBox = false) {
    this._panel.webview.html = this.buildFullHtml(
      html_snippet,
      showFeedbackBox,
    );
  }

  private buildFullHtml(html_snippet: string, showFeedbackBox = false) {
    const webview = this._panel.webview;
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

    const feedbackBoxSnippet = `<div class="feedbackContainer">
    <vscode-button class="iconButton" appearance="icon" id="thumbsup-button">
        <span class="codicon codicon-thumbsup"></span>
    </vscode-button>
    <vscode-button class="iconButton" appearance="icon" id="thumbsdown-button">
        <span class="codicon codicon-thumbsdown"></span>
    </vscode-button>
    </div>`;

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${
          webview.cspSource
        }; font-src ${webview.cspSource};">
        <link rel="stylesheet" href="${codiconsUri}">
        <link rel="stylesheet" href="${styleUri}">
				<title>Playbook explanation</title>
			</head>
			<body>
        <div class="playbookGeneration">
          ${html_snippet}
        </div>
        ${showFeedbackBox ? feedbackBoxSnippet : ""}

        <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
			</body>
			</html>`;
  }
}
