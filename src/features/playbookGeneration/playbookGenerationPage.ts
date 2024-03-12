import * as vscode from "vscode";
import { Webview, Uri } from "vscode";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";

export function openNewPlaybookEditor() {
  const options = {
    language: "ansible",
  };
  // cSpell: disable
  const content = `---
  # Create an azure network...
  #   Description: "Create an azure network peering between VNET named VNET_1 and VNET named VNET_2"
  #   This playbook will perform the following tass by this order:
  #
  #     1. Create VNET named VNET_1
  #     2. Create VNET named VNET_2
  #     3. Create virtual network peering
  - name: Create an azure network...
    hosts: all
    vars:
      resource_group: MY_RESOURCE_GROUP
    tasks:
      - name: Create VNET named VNET_1
        azure.azcollection.azure_rm_virtualnetwork:
          resource_group: "{{ resource_group }}"
          name: VNET_1
          address_prefixes: 10.10.0.60/16

      - name: Create VNET named VNET_2
        azure.azcollection.azure_rm_virtualnetwork:
          resource_group: "{{ resource_group }}"
          name: VNET_2
          address_prefixes: 10.10.0.80/16

      - name: Create virtual network peering
        azure.azcollection.azure_rm_virtualnetworkpeering:
          resource_group: "{{ resource_group }}"
          name: VNET_1_2
          virtual_network:
            name: VNET_2
          remote_virtual_network:
            name: VNET_1
          allow_virtual_network_access: true
          allow_forwarded_traffic: true
          use_remote_gateways: true
`;
  // cSpell: enable

  return vscode.workspace
    .openTextDocument({
      language: options.language,
    })
    .then((doc) => vscode.window.showTextDocument(doc))
    .then((editor) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editBuilder = (textEdit: any) => {
        textEdit.insert(new vscode.Position(0, 0), String(content));
      };

      return editor
        .edit(editBuilder, {
          undoStopBefore: true,
          undoStopAfter: false,
        })
        .then(() => editor);
    });
}

export function showPlaybookGenerationPage(extensionUri: vscode.Uri) {
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

  panel.webview.onDidReceiveMessage((message) => {
    const command = message.command;
    switch (command) {
      case "updateHtml":
        panel!.webview.html = getWebviewContent(
          panel!.webview,
          extensionUri,
          2,
        );
        break;
      case "createPlaybook":
        openNewPlaybookEditor();
        panel?.dispose();
        break;
      case "thumbsUp":
      case "thumbsDown":
        vscode.commands.executeCommand("ansible.lightspeed.thumbsUpDown");
        break;
    }
  });

  panel.title = "Create a playbook";
  panel.webview.html = getWebviewContent(panel.webview, extensionUri);
}

export function getWebviewContent(
  webview: Webview,
  extensionUri: Uri,
  index = 1,
) {
  const webviewUri = getUri(webview, extensionUri, [
    "out",
    "client",
    "webview",
    "apps",
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

  const html1 = /*html*/ `
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
        <h2>Create a playbook</h2>
        <h4>1 of 2</h4>
        <h3>What would you want the playbook to accomplish?</h3>
        <div class="editArea">
            <vscode-text-area rows=25 resize="none"
                placeholder="Describe with as much details as you can, in your own words."
                id="playbook-text-area">
                <vscode-button class="bigIconButton" id="submit-button">
                    <span class="codicon codicon-run-all"></span>
                </vscode-button>
            </vscode-text-area>
            <div class="editUndoFeedbackContainer">
              <div class="editUndoContainer">
                  <vscode-button class="buttonBorder" appearance="secondary" id="edit-button">
                      Edit
                  </vscode-button>
                  <vscode-button class="buttonBorder" appearance="secondary" id="undo-button">
                      Undo
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
            <div class="examplesButtonContainer">
              <vscode-button class="biggerButton awsExample" id="aws-example" appearance="secondary">
                  Create an EC2 instance on AWS
              </vscode-button>
              <vscode-button class="biggerButton azureExample" id="azure-example1" appearance="secondary">
                  Create VNET peering on Azure
              </vscode-button>
              <vscode-button class="biggerButton azureExample" id="azure-example2" appearance="secondary">
                  Create a network interface with VNET
              </vscode-button>
            </div>
            <div class="restartButtonContainer">
                <vscode-button class="iconButton" appearance="icon" id="restart-button">
                    <span class="codicon codicon-debug-restart"></span>
                </vscode-button>
            </div>
        </div>
        <div class="continueButtonContainer">
            <vscode-button class="biggerButton" id="continue-button">
                Continue
            </vscode-button>
        </div>
    </div>
    <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
</body>

</html>
  `;

  const html2 = /*html*/ `
  <!DOCTYPE html>
  <html lang="en">

  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <link rel="stylesheet" href="${codiconsUri}">
      <link rel="stylesheet" href="${styleUri}">
      <title>Playbook</title>
  </head>

  <body>
      <div class="playbookGeneration">
          <h2>Create a playbook</h2>
          <h4>2 of 2</h4>
          <div class="inputSection">
              <h3>Which hosts will this playbook apply to?</h3>
              <div class="editArea">
                  <vscode-text-field class="textFieldFullWidth" placeholder="localhost (default)">
                  </vscode-text-field>
                  <p>
                      This will define hosts this playbook will run on, as specified in your
                      <a href="https://redhat.com">inventory</a> file.
                      <a href="https://redhat.com">Learn more</a>
                  </p>
              </div>
          </div>
          <div class="inputSection">
              <h3>Any variables you want to add?</h3>
              <div class="editArea">
                  <vscode-text-area rows=3 resize="none" placeholder="Enter variables">
                  </vscode-text-area >
                  <p>
                      Tip: Recommended to manage your variables in an external file.
                      <a href="https://redhat.com">Learn more</a>
                  </p>
              </div>
              <div class="createPlaybookContainer">
                <vscode-button class="biggerButton" id="create-button">
                    Create playbook
                </vscode-button>
              </div>
          </div>
      </div>
      <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
  </body>

  </html>
  `;

  return index === 1 ? html1 : html2;
}
