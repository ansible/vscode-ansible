import { Webview, Uri } from "vscode";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";

export function getWebviewQuickLinks(webview: Webview, extensionUri: Uri) {
  const styleUri = getUri(webview, extensionUri, [
    "media",
    "quickLinks",
    "quickLinksStyle.css",
  ]);

  const codiconsUri = getUri(webview, extensionUri, [
    "media",
    "codicons",
    "codicon.css",
  ]);

  const lightspeed_logo = getUri(webview, extensionUri, [
    "media",
    "quickLinks",
    "lightspeed.png",
  ]);

  const webviewUri = getUri(webview, extensionUri, [
    "out",
    "client",
    "webview",
    "apps",
    "quickLinks",
    "quickLinksApp.js",
  ]);

  const nonce = getNonce();

  return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">

    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource};">
      <title>Ansible Development Tools</title>
      <link rel="stylesheet" href="${styleUri}">
      <link rel="stylesheet" href="${codiconsUri}">
    </head>

    <body>
    <div id="quickLinksView">
      <div id="system-readiness" class="statusDisplay"></div>

      <div class="index-list start-container">
        <h3>LAUNCH</h3>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.content-creator.menu" title="Ansible Development Tools welcome page">
                <span class="codicon codicon-rocket"></span> Getting Started
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="https://docs.redhat.com/en/documentation/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant/2.x_latest/html-single/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant_user_guide/index#using-code-bot-for-suggestions_lightspeed-user-guide" title="Ansible code bot documentation">
                <span class="codicon codicon-rocket"></span> Ansible code bot
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="https://ansible.readthedocs.io/projects/dev-tools/" title="Ansible Development Tools documentation">
                <span class="codicon codicon-rocket"></span> Documentation
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.extension-settings.open" title="Ansible extension settings">
                <span class="codicon codicon-settings-gear"></span> Settings
              </a>
            </h3>
          </div>
        <h3>INITIALIZE</h3>
        <p>Initialize a new Ansible project</p>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.content-creator.create-ansible-collection" title="Create a collection project">
                <span class="codicon codicon-new-file"></span> Collection project
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.content-creator.create-ansible-project" title="Create a playbook project">
                <span class="codicon codicon-new-file"></span> Playbook project
              </a>
            </h3>
          </div>
        <h3>ADD</h3>
        <p>Add resources to an existing Ansible project</p>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.content-creator.add-plugin" title="Add a plugin to an existing collection">
                <span class="codicon codicon-new-file"></span> Collection plugin
                <span class="new-badge">NEW</span>
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.content-creator.create-devcontainer" title="Create a devcontainer and add it to an existing Ansible project">
                <span class="codicon codicon-new-file"></span> Devcontainer
                <span class="new-badge">NEW</span>
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.content-creator.create-devfile" title="Create a devfile and add it to an existing Ansible project">
                <span class="codicon codicon-new-file"></span> Devfile
                <span class="new-badge">NEW</span>
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.content-creator.create-execution-env-file" title="Create an Execution Environment file">
                <span class="codicon codicon-new-file"></span> Execution environment template
                <span class="new-badge">NEW</span>
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.lightspeed.playbookGeneration" title="Generate a playbook with Ansible Lightspeed">
                <span class="codicon codicon-new-file"></span> Playbook
                <img class="category-icon icon-widget" src=${lightspeed_logo} alt="(powered by Ansible Lightspeed)" title="Generate a playbook with Ansible Lightspeed"/>
              </a>
            </h3>
          </div>
          <div class="catalogue">
            <h3>
              <a href="command:ansible.create-empty-playbook" title="Create a playbook template">
                <span class="codicon codicon-new-file"></span> Playbook template
              </a>
            </h3>
          </div>
    </div>
    <!-- Component registration code -->
    <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
    </body>
    </html>
    `;
}
