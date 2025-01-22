import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import { Webview, Uri, workspace } from "vscode";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import { isLightspeedEnabled, lightSpeedManager } from "../../extension";
import { IError } from "./utils/errors";
import {
  RoleGenerationResponseParams,
  RoleGenerationListEntry,
} from "../../interfaces/lightspeed";
import {
  WizardGenerationActionType,
  LightSpeedCommands,
} from "../../definitions/lightspeed";
import { isError, UNKNOWN_ERROR } from "./utils/errors";
import { getOneClickTrialProvider } from "./utils/oneClickTrial";
import { LightSpeedAPI } from "./api";
import { getCollectionsFromWorkspace } from "./roleGeneration/collectionSelectorElement";

let wizardId: string | undefined = uuidv4();
let currentPage: number | undefined;
let files: RoleGenerationListEntry[] = [];

function contentMatch(generationId: string, files: RoleGenerationListEntry[]) {
  for (const file of files) {
    lightSpeedManager.contentMatchesProvider.suggestionDetails = [
      {
        suggestionId: generationId,
        suggestion: file.content,
        isPlaybook: false,
      },
    ];
  }
  // Show training matches for the accepted suggestion.
  vscode.commands.executeCommand(
    LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES,
  );
}

async function sendActionEvent(
  action: WizardGenerationActionType,
  toPage?: number,
) {
  if (wizardId) {
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

async function generateRole(
  apiInstance: LightSpeedAPI,
  text: string,
  outline: string | undefined,
  generationId: string,
  panel: vscode.WebviewPanel,
): Promise<RoleGenerationResponseParams | IError> {
  try {
    panel.webview.postMessage({ command: "startSpinner" });
    const createOutline = outline === undefined;

    const response: RoleGenerationResponseParams | IError =
      await apiInstance.roleGenerationRequest({
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

async function fileExists(uri: Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch (e) {
    if (e instanceof vscode.FileSystemError && e.code === "FileNotFound") {
      return false;
    }
  }
  return true;
}

export async function showRoleGenerationPage(extensionUri: vscode.Uri) {
  // Check if Lightspeed is enabled or not.  If it is not, return without opening the panel.
  if (!(await isLightspeedEnabled())) {
    vscode.window.showErrorMessage("Lightspeed is not enabled.");
    return;
  }

  function addLog(message: string) {
    panel.webview.postMessage({
      command: "addGenerateRoleLogEntry",
      content: message,
    });
  }

  async function getRoleBaseDir(fqcn: string, roleName: string): Promise<Uri> {
    const collectionFound = (await getCollectionsFromWorkspace()).filter(
      (e) => e.fqcn === fqcn,
    );
    if (collectionFound.length === 0) {
      addLog("<strong>Collection not found in the workspace!</strong>");
      throw new Error();
    } else if (collectionFound.length !== 1) {
      addLog(
        `<strong>Too many directories found for collection ${fqcn}!</strong>`,
      );
      throw new Error();
    }
    const roleBaseDirUri = vscode.Uri.file(
      `${collectionFound[0].path}/roles/${roleName}`,
    );
    return roleBaseDirUri;
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
    await sendActionEvent(WizardGenerationActionType.CLOSE_CANCEL, undefined);
    wizardId = undefined;
  });

  panel.webview.onDidReceiveMessage(async (message) => {
    const command = message.command;
    switch (command) {
      case "reset": {
        wizardId = uuidv4();
        files = [];
        break;
      }
      case "outline": {
        try {
          if (!message.outline) {
            generateRole(
              lightSpeedManager.apiInstance,
              message.text,
              undefined,
              message.generationId,
              panel,
            ).then(async (response: RoleGenerationResponseParams | IError) => {
              if (isError(response)) {
                const oneClickTrialProvider = getOneClickTrialProvider();
                if (!(await oneClickTrialProvider.showPopup(response))) {
                  const errorMessage: string = `${response.message ?? UNKNOWN_ERROR} ${response.detail ?? ""}`;
                  vscode.window.showErrorMessage(errorMessage);
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
                role: message.role,
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
        const text = message.text as string;
        const outline = message.outline as string;
        const generationId = uuidv4();
        if (files.length === 0) {
          try {
            const response = await generateRole(
              lightSpeedManager.apiInstance,
              text,
              outline,
              generationId,
              panel,
            );
            if (isError(response)) {
              const errorMessage: string = `${response.message ?? UNKNOWN_ERROR} ${response.detail ?? ""}`;
              vscode.window.showErrorMessage(errorMessage);
              break;
            }
            files = response.files;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (e: any) {
            vscode.window.showErrorMessage(e.message);
            break;
          }
        }

        panel.webview.postMessage({
          command: "displayFiles",
          payload: {
            files: files,
          },
        });

        contentMatch(generationId, files);
        break;
      }
      case "transition": {
        const { toPage } = message;
        await sendActionEvent(WizardGenerationActionType.TRANSITION, toPage);
        break;
      }

      case "resetOutline": {
        vscode.window
          .showInformationMessage(
            "Are you sure?",
            {
              modal: true,
              detail: "Resetting the outline will loose your changes.",
            },
            "Ok",
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .then((value: any) => {
            if (value === "Ok") {
              panel.webview.postMessage({
                command: "resetOutline",
              });
            }
          });
        break;
      }

      case "checkRoleName": {
        const roleName: string = message.roleName;
        const fqcn: string = message.fqcn;

        const roleBaseDirUri = await getRoleBaseDir(fqcn, roleName);

        if (roleName.length > 0 && (await fileExists(roleBaseDirUri))) {
          panel.webview.postMessage({
            command: "invalidRoleName",
          });
        } else {
          panel.webview.postMessage({
            command: "validRoleName",
          });
        }
        break;
      }

      case "saveRole": {
        const roleName: string = message.roleName;
        const fqcn: string = message.fqcn;

        const roleBaseDirUri = await getRoleBaseDir(fqcn, roleName);

        const promises = files.map(async (f) => {
          const dirUri = vscode.Uri.joinPath(
            roleBaseDirUri,
            `/${f.file_type}s`,
          );
          const fileUri = vscode.Uri.joinPath(
            roleBaseDirUri,
            `/${f.file_type}s/main.yml`,
          );
          await workspace.fs.createDirectory(dirUri);
          if (await fileExists(fileUri)) {
            addLog(
              `<span class="codicon codicon-warning"></span><strong>File already exists</strong> (${fileUri})!`,
            );
            return;
          }
          await workspace.fs.writeFile(
            fileUri,
            new TextEncoder().encode(f.content),
          );

          const linkUri = {
            scheme: "file",
            path: fileUri.fsPath,
            authority: "",
          };

          const link = `command:vscode.open?${encodeURIComponent(JSON.stringify(linkUri))}`;
          addLog(
            `<a href="${link}">tasks/${roleName}/${f.file_type}s/main.yml</a> saved`,
          );
        });
        await Promise.all(promises);

        break;
      }
    }
  });

  panel.title = "Ansible Lightspeed";
  panel.webview.html = await getWebviewContent(panel.webview, extensionUri);
  panel.webview.postMessage({ command: "init" });

  await sendActionEvent(WizardGenerationActionType.OPEN, 1);
}

export async function getWebviewContent(webview: Webview, extensionUri: Uri) {
  const webviewUri = getUri(webview, extensionUri, [
    "out",
    "client",
    "webview",
    "apps",
    "lightspeed",
    "roleGeneration",
    "main.js",
  ]);
  const styleUri = getUri(webview, extensionUri, [
    "media",
    "roleGeneration",
    "style.css",
  ]);
  const codiconsUri = getUri(webview, extensionUri, [
    "media",
    "codicons",
    "codicon.css",
  ]);
  const nonce = getNonce();

  webview.postMessage({
    command: "displayCollectionList",
    collectionList: await getCollectionsFromWorkspace(),
  });

  return /*html*/ `
  <!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${codiconsUri}">
    <link rel="stylesheet" href="${styleUri}">
    <title>Playbook</title>
</head>

<body>
    <div class="roleGeneration">
        <h2 id="main-header">Create a role with Ansible Lightspeed</h2>
        <div class="pageNumber" id="page-number">1 of 3</div>

        <div id="roleInfo">
          <a href="https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html">Learn more about roles🔗</a>
        </div>
        <div class="dropdown-container" id="collectionSelectorContainer">
          <label for="selectedCollectionName">Select the collection to create role in:</label>
          <vscode-dropdown id="selectedCollectionName" position="below">
          </vscode-dropdown>
          <p>
          A collection can contain one or more roles in the roles/ directory and these are almost
          identical to standalone roles, except you need to move plugins out of the individual
          roles, and use the FQCN in some places, as detailed in the next section.
          </p>
        </div>
        <div class="promptContainer">
          <p>
            "<span id="prompt"></span>"&nbsp;
            <a class="backAnchor" id="backAnchorPrompt">Edit</a>
          </p>
          <p>
            Collection name: "<span id="collectionName"></span>"&nbsp;
            <a class="backAnchor" id="backAnchorCollectionName">Edit</a>
          </p>
        </div>
        <div id="roleNameContainer">
            Role name: <vscode-text-field id="roleName" value=""></vscode-text-field>
        </div>
        <div id="errorContainer"><div class="icon"><i class="codicon codicon-warning"></i> <span id="errorMessage" /></div></div>
        <div class="firstMessage">
          <h4>What do you want the role to accomplish?</h4>
        </div>
        <div class="secondMessage">
          <h4>Review the suggested steps for your role and modify as needed.</h3>
        </div>
        <div class="thirdMessage">
          <h4>The following role was generated for you:</h3>
        </div>
        <div class="mainContainer">
          <div class="editArea">
            <vscode-text-area rows=5 resize="vertical"
                placeholder="I want to write a role that will..."
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
          <div id=filesOutput />

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
                Install and configure Nginx
              </p>
            </div>
        </div>
        <div class="continueButtonContainer">
            <vscode-button class="biggerButton" id="continue-button">
                Continue
            </vscode-button>
        </div>
        <div class="generateRoleContainer">
          <vscode-button class="biggerButton" id="generateButton">
              Generate role
          </vscode-button>
          <vscode-button class="biggerButton" id="backButton" appearance="secondary">
              Back
          </vscode-button>
        </div>
        <div class="saveRoleContainer">
          <ul id="saveRoleLogArea"  placeholder="Output of the command execution"
           readonly></ul>
          <vscode-button class="biggerButton" id="saveRoleButton">
              Save files
          </vscode-button>
          <vscode-button class="biggerButton" id="backToPage2Button" appearance="secondary">
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
