import * as vscode from "vscode";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import { isError, UNKNOWN_ERROR } from "./utils/errors";
import * as marked from "marked";
import { lightSpeedManager } from "../../extension";
import { IError } from "./utils/errors";
import { ExplanationResponseParams } from "../../interfaces/lightspeed";
import { LightSpeedAPI } from "./api";

import { v4 as uuidv4 } from "uuid";
import * as yaml from "yaml";
import { getOneClickTrialProvider } from "./utils/oneClickTrial";

function getObjectKeys(content: string): string[] {
  try {
    const parsedAnsibleDocument = yaml.parse(content);
    const lastObject = parsedAnsibleDocument[parsedAnsibleDocument.length - 1];
    if (typeof lastObject === "object") {
      return Object.keys(lastObject);
    }
  } catch (error) {
    return [];
  }
  return [];
}

export function isPlaybook(content: string): boolean {
  for (const keyword of getObjectKeys(content)) {
    if (keyword === "hosts") {
      return true;
    }
  }
  return false;
}

export function findTasks(content: string): boolean {
  const tasksTags = ["tasks", "pre_tasks", "post_tasks", "handlers"];
  for (const keyword of getObjectKeys(content)) {
    if (tasksTags.includes(keyword)) {
      return true;
    }
  }
  return false;
}

export const playbookExplanation = async (extensionUri: vscode.Uri) => {
  if (!vscode.window.activeTextEditor) {
    return;
  }
  const document = vscode.window.activeTextEditor.document;
  if (document?.languageId !== "ansible") {
    return;
  }

  const content = document.getText();

  if (!isPlaybook(content)) {
    return;
  }

  const explanationId = uuidv4();
  const currentPanel = PlaybookExplanationPanel.createOrShow(
    extensionUri,
    explanationId,
  );

  if (!findTasks(content)) {
    currentPanel.setContent(
      `<p><span class="codicon codicon-info"></span>
      &nbsp;Explaining a playbook with no tasks in the playbook is not supported.</p>`,
    );
    return;
  }

  lightSpeedManager.apiInstance.feedbackRequest(
    { playbookExplanation: { explanationId: explanationId } },
    false,
    false,
  );

  currentPanel.setContent(
    `<div id="icons">
        <span class="codicon codicon-loading codicon-modifier-spin"></span>
        &nbsp;Generating the explanation for ${document.fileName.split("/").at(-1)}
      </div>`,
  );

  const lightSpeedStatusbarText =
    await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText();

  let markdown = "";
  lightSpeedManager.statusBarProvider.statusBar.text = `$(loading~spin) ${lightSpeedStatusbarText}`;
  try {
    generateExplanation(
      lightSpeedManager.apiInstance,
      content,
      explanationId,
    ).then(async (response: ExplanationResponseParams | IError) => {
      console.log(response);
      if (isError(response)) {
        const oneClickTrialProvider = getOneClickTrialProvider();
        const my_error = response as IError;
        if (!(await oneClickTrialProvider.showPopup(my_error))) {
          vscode.window.showErrorMessage(my_error.message ?? UNKNOWN_ERROR);
          currentPanel.setContent(
            `<p><span class="codicon codicon-error"></span>The operation has failed:<p>${my_error.message}</p></p>`,
          );
        }
      } else {
        markdown = response.content;
        const html_snippet = marked.parse(markdown) as string;
        currentPanel.setContent(html_snippet, true);
      }
    });
  } catch (e) {
    console.log(e);
    currentPanel.setContent(
      `<p><span class="codicon codicon-error"></span>
      &nbsp;Cannot load the explanation: <code>${e}</code></p>`,
    );
    return;
  } finally {
    lightSpeedManager.statusBarProvider.statusBar.text =
      lightSpeedStatusbarText;
  }
};

async function generateExplanation(
  apiInstance: LightSpeedAPI,
  content: string,
  explanationId: string,
): Promise<ExplanationResponseParams | IError> {
  const response: ExplanationResponseParams | IError =
    await apiInstance.explanationRequest({
      content: content,
      explanationId: explanationId,
    });

  return response;
}

export class PlaybookExplanationPanel {
  public static currentPanel: PlaybookExplanationPanel | undefined;

  public static readonly viewType = "Explanation";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, explanationId: string) {
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
          vscode.commands.executeCommand("ansible.lightspeed.thumbsUpDown", {
            action: message.action,
            explanationId: explanationId,
          });
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

  public setContent(htmlSnippet: string, showFeedbackBox = false) {
    this._panel.webview.html = this.buildFullHtml(htmlSnippet, showFeedbackBox);
  }

  private buildFullHtml(htmlSnippet: string, showFeedbackBox = false) {
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

    const feedbackBoxSnippet = `<div class="stickyFeedbackContainer">
    <div class="feedbackContainer">
    <vscode-button class="iconButton" appearance="icon" id="thumbsup-button">
        <span class="codicon codicon-thumbsup"></span>
    </vscode-button>
    <vscode-button class="iconButton" appearance="icon" id="thumbsdown-button">
        <span class="codicon codicon-thumbsdown"></span>
    </vscode-button>
    </div>
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
          ${htmlSnippet}
          <div class="playbookExplanationSpacer"></div>
        </div>
        ${showFeedbackBox ? feedbackBoxSnippet : ""}

        <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
			</body>
			</html>`;
  }
}
