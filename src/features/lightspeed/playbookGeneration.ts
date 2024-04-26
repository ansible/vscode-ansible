import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { Webview, Uri } from "vscode";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";
import { SettingsManager } from "../../settings";
import { isLightspeedEnabled } from "../../extension";
import { LightspeedUser } from "./lightspeedUser";

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
  return await editor.edit(editBuilder, {
    undoStopBefore: true,
    undoStopAfter: false,
  });
}

async function generatePlaybook(
  content: string,
  client: LanguageClient,
  lightspeedAuthenticatedUser: LightspeedUser,
  settingsManager: SettingsManager,
  panel: vscode.WebviewPanel,
) {
  const accessToken =
    await lightspeedAuthenticatedUser.getLightspeedUserAccessToken();
  if (!accessToken) {
    panel.webview.postMessage({ command: "exception" });
  }

  const playbook: string = await client.sendRequest("playbook/generation", {
    accessToken,
    URL: settingsManager.settings.lightSpeedService.URL,
    content,
  });

  return playbook;
}

async function summarizeInput(
  content: string,
  client: LanguageClient,
  lightspeedAuthenticatedUser: LightspeedUser,
  settingsManager: SettingsManager,
  panel: vscode.WebviewPanel,
) {
  const accessToken =
    await lightspeedAuthenticatedUser.getLightspeedUserAccessToken();
  if (!accessToken) {
    panel.webview.postMessage({ command: "exception" });
  }

  const summary: string = await client.sendRequest("playbook/summary", {
    accessToken,
    URL: settingsManager.settings.lightSpeedService.URL,
    content,
  });

  return summary;
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

  panel.webview.onDidReceiveMessage(async (message) => {
    const command = message.command;
    switch (command) {
      case "generatePlaybook":
        const playbook = await generatePlaybook(
          // TODO
          message.content,
          client,
          lightspeedAuthenticatedUser,
          settingsManager,
          panel,
        );
        panel?.dispose();
        await openNewPlaybookEditor(playbook);
        break;
      case "summarizeInput":
        const summary = await summarizeInput(
          // TODO
          message.content,
          client,
          lightspeedAuthenticatedUser,
          settingsManager,
          panel,
        );
        panel.webview.postMessage({ command: "summary", summary });
        break;
      case "thumbsUp":
      case "thumbsDown":
        vscode.commands.executeCommand("ansible.lightspeed.thumbsUpDown");
        break;
    }
  });

  panel.title = "Generate a playbook";
  panel.webview.html = getWebviewContent(panel.webview, extensionUri);
  panel.webview.postMessage({ command: "focus" });
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
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource};">
    <link rel="stylesheet" href="${codiconsUri}">
    <link rel="stylesheet" href="${styleUri}">
    <title>Playbook</title>
</head>

<body>
    <div class="playbookGeneration">
        <h2>Generate a playbook with Ansible Lightspeed</h2>
        <div class="firstMessage">
          <h3>What do you want the playbook to accomplish?</h3>
        </div>
        <div class="secondMessage">
          <h3>Do the following steps look right to you?</h3>
        </div>
        <div class="mainContainer">
          <div class="editArea">
            <vscode-text-area rows=5 resize="vertical"
                placeholder="Describe the goal in your own words."
                id="playbook-text-area">
            </vscode-text-area>
            <div class="spinnerContainer">
              <span class="codicon-spinner codicon-loading codicon-modifier-spin" id="loading"></span>
            </div>
          </div>
          <div class="bigIconButtonContainer">
            <vscode-button class="bigIconButton" id="submit-button" disabled>
              <span class="codicon codicon-send" id="submit-icon"></span>
           </vscode-button>
          </div>
          <div class="resetFeedbackContainer">
            <div class="resetContainer">
                <vscode-button class="buttonBorder" appearance="secondary" id="reset-button">
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
    </div>
    </div>
    <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
</body>

</html>
  `;
}
