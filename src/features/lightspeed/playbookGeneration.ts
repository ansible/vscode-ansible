import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import { LanguageClient } from "vscode-languageclient/node";
import { Webview, Uri, WebviewPanel } from "vscode";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import { SettingsManager } from "../../settings";
import { isLightspeedEnabled, lightSpeedManager } from "../../extension";
import { LightspeedUser } from "./lightspeedUser";
import { GenerationResponse } from "@ansible/ansible-language-server/src/interfaces/lightspeedApi";
import { LightSpeedCommands } from "../../definitions/lightspeed";

let currentPanel: WebviewPanel | undefined;
let wizardId: string | undefined;

async function openNewPlaybookEditor(playbook: string) {
  const options = {
    language: "ansible",
  };

  const doc = await vscode.workspace.openTextDocument({
    language: options.language,
  });
  const editor = await vscode.window.showTextDocument(doc);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editBuilder = (textEdit: any) => {
    textEdit.insert(new vscode.Position(0, 0), String(playbook));
  };

  await editor.edit(editBuilder, {
    undoStopBefore: true,
    undoStopAfter: false,
  });
}

function contentMatch(generationId: string, playbook: string) {
  lightSpeedManager.contentMatchesProvider.suggestionDetails = [
    {
      suggestionId: generationId,
      suggestion: playbook,
      isPlaybook: true,
    },
  ];
  // Show training matches for the accepted suggestion.
  vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES,
  );
}

async function generatePlaybook(
  text: string,
  outline: string | undefined,
  generationId: string,
  client: LanguageClient,
  lightspeedAuthenticatedUser: LightspeedUser,
  settingsManager: SettingsManager,
  panel: vscode.WebviewPanel,
): Promise<GenerationResponse> {
  const accessToken =
    await lightspeedAuthenticatedUser.getLightspeedUserAccessToken();
  if (!accessToken) {
    panel.webview.postMessage({ command: "exception" });
  }

  const createOutline = true;
  const playbook: GenerationResponse = await client.sendRequest(
    "playbook/generation",
    {
      accessToken,
      URL: settingsManager.settings.lightSpeedService.URL,
      text,
      outline,
      createOutline,
      generationId,
      wizardId,
    },
  );
  return playbook;
}

export async function showPlaybookGenerationPage(
  extensionUri: vscode.Uri,
  client: LanguageClient,
  lightspeedAuthenticatedUser: LightspeedUser,
  settingsManager: SettingsManager,
) {
  // Check if Lightspeed is enabled or not.  If it is not, return without opening the panel.
  if (!(await isLightspeedEnabled())) {
    return;
  }

  if (currentPanel) {
    currentPanel.reveal();
    return;
  }

  // Create a new panel and update the HTML
  const panel = vscode.window.createWebviewPanel(
    "noteDetailView",
    "Title",
    vscode.ViewColumn.One,
    {
      // Enable JavaScript in the webview
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, "out"),
        vscode.Uri.joinPath(extensionUri, "media"),
      ],
      enableCommandUris: true,
      retainContextWhenHidden: true,
    },
  );

  panel.onDidDispose(() => {
    currentPanel = undefined;
    wizardId = undefined;
  });
  currentPanel = panel;
  wizardId = uuidv4();

  panel.webview.onDidReceiveMessage(async (message) => {
    const command = message.command;
    switch (command) {
      case "outline": {
        try {
          let outline: GenerationResponse;
          if (!message.outline) {
            outline = await generatePlaybook(
              message.text,
              undefined,
              message.generationId,
              client,
              lightspeedAuthenticatedUser,
              settingsManager,
              panel,
            );
          } else {
            outline = {
              playbook: message.playbook,
              outline: message.outline,
              generationId: message.generationId,
            };
          }
          panel.webview.postMessage({ command: "outline", outline });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          panel.webview.postMessage({ command: "exception" });
          vscode.window.showErrorMessage(e.message);
        }
        break;
      }
      case "thumbsUp":
      case "thumbsDown":
        vscode.commands.executeCommand("ansible.lightspeed.thumbsUpDown", {
          action: message.action,
          generationId: message.generationId,
        });
        break;

      case "generateCode": {
        let { playbook, generationId, outline } = message;
        const darkMode = message.darkMode;
        if (!playbook) {
          try {
            const playbookResponse = await generatePlaybook(
              message.text,
              message.outline,
              message.generationId,
              client,
              lightspeedAuthenticatedUser,
              settingsManager,
              panel,
            );
            playbook = playbookResponse.playbook;
            generationId = playbookResponse.generationId;
            outline = playbookResponse.outline;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (e: any) {
            panel.webview.postMessage({ command: "exception" });
            vscode.window.showErrorMessage(e.message);
            break;
          }
        }

        const html = await (
          await require("../utils/syntaxHighlighter")
        ).codeToHtml(playbook, darkMode ? "dark-plus" : "light-plus", "yaml");

        panel.webview.postMessage({
          command: "playbook",
          playbook: {
            playbook,
            generationId,
            outline,
            html,
          },
        });

        contentMatch(generationId, playbook);
        break;
      }
      case "openEditor": {
        const { playbook } = message;
        panel?.dispose();
        await openNewPlaybookEditor(playbook);
        break;
      }
    }
  });

  panel.title = "Ansible Lightspeed";
  panel.webview.html = getWebviewContent(panel.webview, extensionUri);
  panel.webview.postMessage({ command: "init" });
}

export function getWebviewContent(webview: Webview, extensionUri: Uri) {
  const webviewUri = getUri(webview, extensionUri, [
    "out",
    "client",
    "webview",
    "apps",
    "lightspeed",
    "playbookGeneration",
    "main.js",
  ]);
  const styleUri = getUri(webview, extensionUri, [
    "media",
    "playbookGeneration",
    "style.css",
  ]);
  const codiconsUri = getUri(webview, extensionUri, [
    "media",
    "codicons",
    "codicon.css",
  ]);
  const nonce = getNonce();

  return /*html*/ `
  <!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};'">
    <link rel="stylesheet" href="${codiconsUri}">
    <link rel="stylesheet" href="${styleUri}">
    <title>Playbook</title>
</head>

<body>
    <div class="playbookGeneration">
        <h2 id="main-header">Create a playbook with Ansible Lightspeed</h2>
        <div class="pageNumber" id="page-number">1 of 3</div>
        <div class="promptContainer">
          <span>
            "<span id="prompt"></span>"&nbsp;
            <a class="backAnchor" id="back-anchor">Edit</a>
          </span>
        </div>
        <div class="firstMessage">
          <h4>What do you want the playbook to accomplish?</h3>
        </div>
        <div class="secondMessage">
          <h4>Review the suggested steps for your playbook and modify as needed.</h3>
        </div>
        <div class="thirdMessage">
          <h4>The following playbook was generated for you:</h3>
        </div>
        <div class="mainContainer">
          <div class="editArea">
            <vscode-text-area rows=5 resize="vertical"
                placeholder="I want to write a playbook that will..."
                id="playbook-text-area">
            </vscode-text-area>
            <div class="outlineContainer">
              <ol id="outline-list" contentEditable="true">
                <li></li>
              </ol>
            </div>
            <div class="spinnerContainer">
              <span class="codicon-spinner codicon-loading codicon-modifier-spin" id="loading"></span>
            </div>
          </div>
          <div class="formattedPlaybook">
            <span id="formatted-code"></span>
          </div>
          <div class="bigIconButtonContainer">
            <vscode-button class="biggerButton" id="submit-button" disabled>
              Analyze
            </vscode-button>
          </div>
          <div class="resetFeedbackContainer">
            <div class="resetContainer">
                <vscode-button appearance="secondary" id="reset-button" disabled>
                    Reset
                </vscode-button>
            </div>
            <div class="feedbackContainer">
              <vscode-button class="iconButton" appearance="icon" id="thumbsup-button">
                <span class="codicon codicon-thumbsup"></span>
              </vscode-button>
              <vscode-button class="iconButton" appearance="icon" id="thumbsdown-button">
                <span class="codicon codicon-thumbsdown"></span>
              </vscode-button>
            </div>
            </div>
        </div>
        <div class="examplesContainer">
            <h4>Examples</h4>
            <div class="exampleTextContainer">
              <p>
                Create IIS websites on port 8080 and 8081 and open firewall
              </p>
            </div>
            <div class="exampleTextContainer">
              <p>
                Create a RHEL 9.2 Azure virtual machine named RHEL-VM in resource group named
                RH attached to the VNET my-vnet and subnet my-subnet with a public ip address and
                a security group to allow traffic over port 22.
              </p>
            </div>
            <div class="exampleTextContainer">
              <p>
                Create a t2.micro EC2 instance using image id ami-01cc36e92a4e9a428 in region
                east-us-1 in the tenancy B918A05F-80C1-46C7-A85F-CB4B12472970 using
                subnet-0a908847e7212345 with a public ip and with key name test-servers and
                with security group ssh-servers and a tag "env:develop", then output the
                public ip and the private ip address through a debug message.
              </p>
            </div>
        </div>
        <div class="continueButtonContainer">
            <vscode-button class="biggerButton" id="continue-button">
                Continue
            </vscode-button>
        </div>
        <div class="generatePlaybookContainer">
          <vscode-button class="biggerButton" id="generate-button">
              Generate playbook
          </vscode-button>
          <vscode-button class="biggerButton" id="back-button" appearance="secondary">
              Back
          </vscode-button>
        </div>
        <div class="openEditorContainer">
          <vscode-button class="biggerButton" id="open-editor-button">
              Open editor
          </vscode-button>
          <vscode-button class="biggerButton" id="back-to-page2-button" appearance="secondary">
              Back
          </vscode-button>
        </div>
    </div>
    </div>
    <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
</body>

</html>
  `;
}
