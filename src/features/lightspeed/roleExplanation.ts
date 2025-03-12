import * as vscode from "vscode";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import { isError, IError, UNKNOWN_ERROR } from "./utils/errors";
import * as marked from "marked";
import { lightSpeedManager } from "../../extension";
import {
  ExplanationResponseParams,
  GenerationListEntry,
} from "../../interfaces/lightspeed";
import { LightSpeedAPI } from "./api";

import { v4 as uuidv4 } from "uuid";
import { getOneClickTrialProvider } from "./utils/oneClickTrial";
import * as fs from "fs/promises";
import { getRoleNameFromFilePath } from "./utils/getRoleNameFromFilePath";
import { getRoleNamePathFromFilePath } from "./utils/getRoleNamePathFromFilePath";
import { getRoleYamlFiles } from "./utils/data";

function directoryContainsSomeRoleDirectories(files: string[]): boolean {
  const roleDirectories = [
    "tasks",
    "handlers",
    "templates",
    "files",
    "vars",
    "defaults",
    "meta",
  ];
  return files.some((file) => roleDirectories.includes(file));
}

export async function isDocumentInRole(
  document: vscode.TextDocument,
): Promise<boolean> {
  const fileNameParts = document.fileName.split("/");
  const rolesIndex = fileNameParts.findIndex((part) => part === "roles");
  if (rolesIndex >= 0 && rolesIndex + 1 < fileNameParts.length) {
    const dir = await fs.readdir(
      fileNameParts.slice(0, rolesIndex + 2).join("/"),
    );

    const containsRoleDirectories = directoryContainsSomeRoleDirectories(dir);
    if (containsRoleDirectories) {
      return true;
    }
  }
  return false;
}

export const roleExplanation = async (extensionUri: vscode.Uri) => {
  if (!vscode.window.activeTextEditor) {
    return;
  }
  const document = vscode.window.activeTextEditor.document;
  const documentInRole = await isDocumentInRole(document);

  if (!documentInRole) {
    return;
  }

  const explanationId = uuidv4();
  const currentPanel = RoleExplanationPanel.createOrShow(
    extensionUri,
    explanationId,
  );

  lightSpeedManager.apiInstance.feedbackRequest(
    { roleExplanation: { explanationId: explanationId } },
    false,
    false,
  );

  const roleName = getRoleNameFromFilePath(document.fileName);
  const rolePath = getRoleNamePathFromFilePath(document.fileName);

  const files = await getRoleYamlFiles(rolePath);

  currentPanel.setContent(
    `<div id="icons">
        <span class="codicon codicon-loading codicon-modifier-spin"></span>
        &nbsp;Generating the explanation for role: ${roleName}
      </div>`,
  );

  const lightSpeedStatusbarText =
    await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText();

  let markdown = "";
  lightSpeedManager.statusBarProvider.statusBar.text = `$(loading~spin) ${lightSpeedStatusbarText}`;
  try {
    await generateRoleExplanation(
      lightSpeedManager.apiInstance,
      files,
      roleName,
      explanationId,
    ).then(async (response: ExplanationResponseParams | IError) => {
      if (isError(response)) {
        const oneClickTrialProvider = getOneClickTrialProvider();
        if (!(await oneClickTrialProvider.showPopup(response))) {
          const errorMessage: string = `${response.message ?? UNKNOWN_ERROR} ${response.detail ?? ""}`;
          vscode.window.showErrorMessage(errorMessage);
          currentPanel.setContent(
            `<p><span class="codicon codicon-error"></span>The operation has failed:<p>${errorMessage}</p></p>`,
          );
        }
      } else {
        markdown = response.content;
        if (markdown.length === 0) {
          markdown = "### No explanation provided.";
        }
        const html_snippet = marked.parse(markdown) as string;
        currentPanel.setContent(html_snippet, true);
      }
    });
  } catch (e) {
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

async function generateRoleExplanation(
  apiInstance: LightSpeedAPI,
  files: GenerationListEntry[],
  roleName: string,
  explanationId: string,
): Promise<ExplanationResponseParams | IError> {
  const response: ExplanationResponseParams | IError =
    await apiInstance.roleExplanationRequest({
      files: files,
      roleName: roleName,
      explanationId: explanationId,
    });

  return response;
}

export class RoleExplanationPanel {
  public static readonly currentPanel: RoleExplanationPanel | undefined;

  public static readonly viewType = "Explanation";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, explanationId: string) {
    const panel = vscode.window.createWebviewPanel(
      RoleExplanationPanel.viewType,
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
          vscode.commands.executeCommand(
            "ansible.lightspeed.roleThumbsUpDown",
            {
              action: message.action,
              explanationId: explanationId,
            },
          );
          break;
      }
    });

    return new RoleExplanationPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.command === "alert") {
          vscode.window.showErrorMessage(message.text);
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
      "roleExplanation",
      "main.js",
    ]);
    const styleUri = getUri(webview, this._extensionUri, [
      "media",
      "roleExplanation",
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
				<title>Role explanation</title>
			</head>
			<body>
        <div class="roleExplanation">
          ${htmlSnippet}
          <div class="roleExplanationSpacer"></div>
        </div>
        ${showFeedbackBox ? feedbackBoxSnippet : ""}

        <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
			</body>
			</html>`;
  }
}
