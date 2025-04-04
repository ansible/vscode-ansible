import { Disposable, Webview, Uri, commands } from "vscode";
import { getUri } from "../../utils/getUri";
import { getNonce } from "../../utils/getNonce";

export function getWebviewContentWithLoginForm(
  webview: Webview,
  extensionUri: Uri,
) {
  const webviewUri = getUri(webview, extensionUri, [
    "out",
    "client",
    "webview",
    "apps",
    "lightspeed",
    "explorer",
    "main.js",
  ]);
  const styleUri = getUri(webview, extensionUri, [
    "media",
    "lightspeedExplorerView",
    "style.css",
  ]);
  const nonce = getNonce();

  return /*html*/ `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${styleUri}">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <title>Ansible Lightspeed Explorer!</title>
    </head>
    <body>
    <div id="lightspeedExplorerView">
      Experience smarter automation using Ansible Lightspeed with watsonx Code Assistant solutions for your playbook. <a href="https://www.redhat.com/en/engage/project-wisdom">Learn more</a><br />
      <form id="playbook-explanation-form">
        <div class="button-container">
          <section class="component-section">
            <vscode-button id="lightspeed-explorer-connect" class="lightspeedExplorerButton">Connect</vscode-button>
          </section>
        </div>
        <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
      </form>
    </div>
    </body>
  </html>
        `;
}

export function getWebviewContentWithActiveSession(
  webview: Webview,
  extensionUri: Uri,
  content: string,
  has_playbook_opened: boolean,
  has_role_opened: boolean,
) {
  const webviewUri = getUri(webview, extensionUri, [
    "out",
    "client",
    "webview",
    "apps",
    "lightspeed",
    "explorer",
    "main.js",
  ]);
  const styleUri = getUri(webview, extensionUri, [
    "media",
    "lightspeedExplorerView",
    "style.css",
  ]);
  const nonce = getNonce();
  const generatePlaybookForm = `<div class="button-container">
  <form id="playbook-generation-form">
    <vscode-button id="lightspeed-explorer-playbook-generation-submit" class="lightspeedExplorerButton">Generate a playbook</vscode-button>
  <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
  </form>
  </div>`;
  const explainPlaybookForm = `<div class="button-container">
  <form id="playbook-explanation-form">
    <vscode-button id="lightspeed-explorer-playbook-explanation-submit" class="lightspeedExplorerButton" ${
      has_playbook_opened
        ? ""
        : "disabled title='The file in the active editor view is not an Ansible playbook' "
    }>Explain the current playbook</vscode-button>
  <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
  </form>
  </div>`;
  const generateRoleForm = `<div class="button-container">
  <form id="role-generation-form">
    <vscode-button id="lightspeed-explorer-role-generation-submit" class="lightspeedExplorerButton">Generate a role</vscode-button>
  <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
  </form>
  </div>`;
  const explainRoleForm = `<div class="button-container">
  <form id="role-explanation-form">
    <vscode-button id="lightspeed-explorer-role-explanation-submit" class="lightspeedExplorerButton" ${
      has_role_opened
        ? ""
        : "disabled title='The file in the active editor view is not part of an Ansible role' "
    }>Explain the current role</vscode-button>
  <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
  </form>
  </div>`;

  return /*html*/ `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
        webview.cspSource
      }; script-src 'nonce-${nonce}';">
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${styleUri}">
      <title>Ansible Lightspeed Explorer!</title>
    </head>
    <body>
    <body>
    <div id="lightspeedExplorerView">
      ${content}
      ${generatePlaybookForm}
      ${explainPlaybookForm}
      ${generateRoleForm}
      ${explainRoleForm}
    </div>
    </body>
  </html>
        `;
}

export function setWebviewMessageListener(
  webview: Webview,
  disposables: Disposable[] = [],
) {
  webview.onDidReceiveMessage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (message: any) => {
      console.log(
        `Lightspeed explorer - Message received: ${JSON.stringify(message)}}`,
      );
      const command = message.command;

      switch (command) {
        case "connect":
          commands.executeCommand("ansible.lightspeed.oauth");
          return;
        case "generate":
          commands.executeCommand("ansible.lightspeed.playbookGeneration");
          return;
        case "explain":
          commands.executeCommand("ansible.lightspeed.playbookExplanation");
          return;
        case "generateRole":
          commands.executeCommand("ansible.lightspeed.roleGeneration");
          return;
        case "explainRole":
          commands.executeCommand("ansible.lightspeed.roleExplanation");
          return;
      }
    },
    undefined,
    disposables,
  );
}
