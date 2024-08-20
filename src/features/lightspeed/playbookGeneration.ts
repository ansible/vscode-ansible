import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import { Webview, Uri, WebviewPanel } from "vscode";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import { isLightspeedEnabled, lightSpeedManager } from "../../extension";
import { LightspeedUser } from "./lightspeedUser";
import { IError } from "./utils/errors";
import { GenerationResponseParams } from "../../interfaces/lightspeed";
import {
  LightSpeedCommands,
  PlaybookGenerationActionType,
} from "../../definitions/lightspeed";
import { isError, UNKNOWN_ERROR } from "./utils/errors";
import { getOneClickTrialProvider } from "./utils/oneClickTrial";
import { LightSpeedAPI } from "./api";

let currentPanel: WebviewPanel | undefined;
let wizardId: string | undefined;
let currentPage: number | undefined;

async function openNewPlaybookEditor(playbook: string) {
  const options = {
    language: "ansible",
    content: playbook,
  };

  const doc = await vscode.workspace.openTextDocument(options);
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
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

async function sendActionEvent(
  action: PlaybookGenerationActionType,
  toPage?: number | undefined,
) {
  if (currentPanel && wizardId) {
    const fromPage = currentPage;
    currentPage = toPage;
    try {
      lightSpeedManager.apiInstance.feedbackRequest(
        {
          playbookGenerationAction: {
            wizardId,
            action,
            fromPage,
            toPage,
          },
        },
        process.env.TEST_LIGHTSPEED_ACCESS_TOKEN !== undefined,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      vscode.window.showErrorMessage(e.message);
    }
  }
}

async function generatePlaybook(
  apiInstance: LightSpeedAPI,
  text: string,
  outline: string | undefined,
  generationId: string,
  panel: vscode.WebviewPanel,
): Promise<GenerationResponseParams | IError> {
  try {
    panel.webview.postMessage({ command: "startSpinner" });
    const createOutline = outline === undefined;

    const response: GenerationResponseParams | IError =
      await apiInstance.generationRequest({
        text,
        outline,
        createOutline,
        generationId,
        wizardId,
      });
    return response;
  } finally {
    panel.webview.postMessage({ command: "stopSpinner" });
  }
}

export async function showPlaybookGenerationPage(
  extensionUri: vscode.Uri,
  lightspeedAuthenticatedUser: LightspeedUser,
) {
  // Check if Lightspeed is enabled or not.  If it is not, return without opening the panel.
  if (!(await isLightspeedEnabled())) {
    return;
  }

  const accessToken =
    await lightspeedAuthenticatedUser.getLightspeedUserAccessToken();
  if (!accessToken) {
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

  panel.onDidDispose(async () => {
    await sendActionEvent(PlaybookGenerationActionType.CLOSE_CANCEL, undefined);
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
          if (!message.outline) {
            generatePlaybook(
              lightSpeedManager.apiInstance,
              message.text,
              undefined,
              message.generationId,
              panel,
            ).then(async (response: GenerationResponseParams | IError) => {
              if (isError(response)) {
                const oneClickTrialProvider = getOneClickTrialProvider();
                if (!(await oneClickTrialProvider.showPopup(response))) {
                  vscode.window.showErrorMessage(
                    response.message ?? UNKNOWN_ERROR,
                  );
                }
              } else {
                panel.webview.postMessage({
                  command: "outline",
                  outline: response,
                });
              }
            });
          } else {
            panel.webview.postMessage({
              command: "outline",
              outline: {
                playbook: message.playbook,
                outline: message.outline,
                generationId: message.generationId,
              },
            });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
        }
        break;
      }

      case "generateCode": {
        let { playbook, generationId } = message;
        const outline = message.outline;
        const darkMode = message.darkMode;
        if (!playbook) {
          try {
            const response = await generatePlaybook(
              lightSpeedManager.apiInstance,
              message.text,
              message.outline,
              message.generationId,
              panel,
            );
            if (isError(response)) {
              vscode.window.showErrorMessage(response.message ?? UNKNOWN_ERROR);
              break;
            }
            playbook = response.playbook;
            generationId = response.generationId;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (e: any) {
            vscode.window.showErrorMessage(e.message);
            break;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let syntaxHighlighter: any;
        try {
          syntaxHighlighter =
            await require(/* webpackIgnore: true */ "../../syntaxHighlighter/src/syntaxHighlighter");
        } catch (error) {
          syntaxHighlighter =
            await require(/* webpackIgnore: true */ "../../../../syntaxHighlighter/src/syntaxHighlighter");
        }
        const html = await syntaxHighlighter.codeToHtml(
          playbook,
          darkMode ? "dark-plus" : "light-plus",
          "yaml",
        );

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
      case "transition": {
        const { toPage } = message;
        await sendActionEvent(PlaybookGenerationActionType.TRANSITION, toPage);
        break;
      }
      case "openEditor": {
        const { playbook } = message;
        await openNewPlaybookEditor(playbook);
        await sendActionEvent(
          PlaybookGenerationActionType.CLOSE_ACCEPT,
          undefined,
        );
        // Clear wizardId to suppress another CLOSE event at dispose()
        wizardId = undefined;
        panel?.dispose();
        break;
      }
    }
  });

  panel.title = "Ansible Lightspeed";
  panel.webview.html = getWebviewContent(panel.webview, extensionUri);
  panel.webview.postMessage({ command: "init" });

  await sendActionEvent(PlaybookGenerationActionType.OPEN, 1);
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
