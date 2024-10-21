/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import * as ini from "ini";
import { getBinDetail } from "../contentCreator/utils";
import { Log } from "../../utils/logger";

export class AnsibleWelcomePage {
  public static currentPanel: AnsibleWelcomePage | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private readonly walkthroughs: [] = [];
  private readonly _logger: Log;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._logger = new Log();
    this.walkthroughs =
      vscode.extensions.getExtension(
        "redhat.ansible",
      )?.packageJSON?.contributes?.walkthroughs;
    this._panel = panel;
    this._panel.webview.html = this._getWebviewContent(
      this._panel.webview,
      extensionUri,
    );
    this._setWebviewMessageListener(this._panel.webview);
    this._panel.onDidDispose(
      () => {
        this.dispose();
      },
      null,
      this._disposables,
    );
  }

  public static render(extensionUri: vscode.Uri) {
    if (AnsibleWelcomePage.currentPanel) {
      AnsibleWelcomePage.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "content-creator-menu",
        "Ansible Development Tools",
        vscode.ViewColumn.One,
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

      AnsibleWelcomePage.currentPanel = new AnsibleWelcomePage(
        panel,
        extensionUri,
      );
    }
  }

  public dispose() {
    AnsibleWelcomePage.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
  ) {
    const webviewUri = getUri(webview, extensionUri, [
      "out",
      "client",
      "webview",
      "apps",
      "welcomePage",
      "welcomePageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "welcomePage",
      "style.css",
    ]);

    const codiconsUri = getUri(webview, extensionUri, [
      "media",
      "codicons",
      "codicon.css",
    ]);

    const logo = getUri(webview, extensionUri, [
      "media",
      "welcomePage",
      "logo.png",
    ]);

    const renderWalkthroughList = this.walkthroughs
      .map((item: any) => {
        return `<button
        class="walkthrough-item"
        x-dispatch="selectCategory:redhat.ansible#${item.id}"
        id=redhat.ansible#${item.id}
        title="${item.description}">
          <div class="featured-badge"></div>
          <div class="main-content">
            <img class="category-icon icon-widget" src=${logo} alt="Ansible"/>
            <h3 class="category-title max-lines-3" x-category-title-for="redhat.ansible#${item.id}">
              ${item.title}
            </h3>
            <div class="no-badge"></div>
            <a class="codicon codicon-close hide-category-button"
              tabindex="0"
              x-dispatch="hideCategory:redhat.ansible#${item.id}"
              title="Hide"
              role="button"
              aria-label="Hide">
            </a>
          </div>
          <div class="description-content">
            ${item.description}
          </div>
          <div class="category-progress"
            x-data-category-id="redhat.ansible#discover-ansible-development-tools">
            <div class="progress-bar-outer" role="progressbar">
              <div class="progress-bar-inner" aria-valuemin="0" aria-value="1" aria-valuemax="4" title="1 of 4 steps complete" style="width: 25%;">
              </div>
            </div>
          </div>
        </button>`;
      })
      .join("");

    return /*html*/ `
    <html>

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
      <div class="playbookGenerationContainer">
        <div class="playbookGenerationSlideCategories">
          <div class="playbookGenerationCategoriesContainer">
            <div class="header">
              <h1 class="title caption">Ansible Development Tools</h1>
              <p class="subtitle description">Create, test and deploy Ansible content in your IT environment</p>

              <div id="system-readiness" class="statusDisplay"></div>

            </div>
            <div class="categories-column-left">
              <div class="index-list start-container">
                <h2>Start</h2>
                <div class="catalogue">
                  <h3>
                    <a href="command:ansible.content-creator.create-ansible-project">
                    <span class="codicon codicon-file-zip"></span> New playbook project
                    </a>
                  </h3>
                  <p>Create a foundational framework and structure for setting your Ansible project with playbooks, roles, variables, templates, and other files.</p>
                </div>
                <div class="catalogue">
                  <h3>
                    <a href="command:ansible.content-creator.create-ansible-collection">
                    <span class="codicon codicon-file-zip"></span> New collection project
                    </a>
                  </h3>
                  <p>Create a structure for your Ansible collection that includes modules, plugins, molecule scenarios and tests.
                  </p>
                </div>
                <div class="catalogue">
                  <h3>
                    <a href="command:ansible.create-playbook-options">
                    <span class="codicon codicon-new-file"></span> New playbook
                    </a>
                  </h3>
                  <p>Create a new playbook
                  </p>
                </div>
                <!-- <div class="catalogue">
                  <h3>
                    <a href="command:ansible.content-creator.create-ansible-collection">
                    <span class="codicon codicon-layers"></span> New execution environment
                    </a>
                  </h3>
                  <p>Create a new execution environment.
                  </p>
                </div> -->
                <!-- <div class="catalogue">
                  <h3>
                    <a href="command:ansible.content-creator.create-ansible-collection">
                    <span class="codicon codicon-symbol-property"></span> Launch Ansible Navigator
                    </a>
                  </h3>
                  <p>Create a new execution environment.
                  </p>
                </div> -->
                <div class="catalogue">
                  <h3>
                    <a href="https://docs.redhat.com/en/documentation/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant/2.x_latest/html-single/red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant_user_guide/index#using-code-bot-for-suggestions_lightspeed-user-guide">
                    <span class="codicon codicon-symbol-property"></span> Go to Ansible code bot
                    </a>
                  </h3>
                  <p>Scans your code repositories to recommend code quality improvements.
                  </p>
                </div>
                <div class="catalogue">
                  <h3>
                    <a href="command:workbench.action.files.openFile">
                    <span class="codicon codicon-symbol-property"></span> Explain playbook
                    </a>
                  </h3>
                  <p>Explain a playbook
                  </p>
                </div>
              </div>

              <!-- <div class="index-list start-container">
                <h2>Recent</h2>
                <p>No recent activity</p>
              </div> -->

              <div class="index-list start-container">
                <h2>Learn</h2>
                <div class="catalogue">
                  <h3>
                    <a href="https://docs.ansible.com">
                      Ansible documentation
                      <span class="codicon codicon-link-external"></span>
                    </a>
                  </h3>
                  <p>Explore Ansible documentation, examples and more.</p>
                </div>
                <div class="catalogue">
                  <h3>
                    <a href="https://docs.ansible.com/ansible/latest/getting_started/index.html">
                      Learn Ansible development
                      <span class="codicon codicon-link-external"></span>
                    </a>
                  </h3>
                  <p>End to end course that will help you master automation development.</p>
                </div>
                <div class="catalogue">
                  <h3>Once you are in the YAML file:</h3>
                  <p>click Ctrl+L to fire the Ansible Lightspeed AI assistance for editing and explaining code.</p>
                </div>
              </div>

              <div class="shadow"></div>
              <div class="shadow"></div>
              <div class="shadow"></div>
            </div>
            <div class="categories-column-right">
              <div class="index-list getting-started">
                <div id="system-check">
                  <div class="icon">
                    <h2>Walkthroughs</h2>
                  </div>

                  <ul id="walkthrough-list">
                    ${renderWalkthroughList}
                  </ul>

                  <!-- <div id=install-status class="statusDisplay"></div> -->

                  <!-- <div class="refresh-button-div">
                    <vscode-button id="refresh">
                      <span class="codicon codicon-refresh"></span>
                      &nbsp; Refresh
                    </vscode-button>
                  </div> -->

                </div>
              </div>
              <div class="shadow"></div>
              <div class="shadow"></div>
              <div class="shadow"></div>
            </div>
            <div class="footer">
              <p></p>
            </div>
          </div>
        </div>
      </div>

      <!-- Component registration code -->
      <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
    </body>

    </html>
    `;
  }

  private _setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      async (message) => {
        const command = message.message || message.command;
        switch (command) {
          case "set-system-status-view":
            await this.getSystemDetails(webview);
            return;

          case "walkthrough":
            await this.openWalkthrough(message.walkthrough);
        }
      },
      undefined,
      this._disposables,
    );
  }

  private async openWalkthrough(walkthrough: string) {
    vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      walkthrough,
      false,
    );
  }

  private async getSystemDetails(webView: vscode.Webview) {
    const systemInfo: any = {};

    // get ansible version and path
    const ansibleVersion = await getBinDetail("ansible", "--version");
    if (ansibleVersion !== "failed") {
      const versionInfo = ini.parse(ansibleVersion.toString());

      const versionInfoObjKeys = Object.keys(versionInfo);

      // return empty if ansible --version fails to execute
      if (versionInfoObjKeys.length === 0) {
        console.debug("[ansible-creator] No version information from ansible");
      }

      const ansibleCoreVersion = versionInfoObjKeys[0].includes(" [")
        ? versionInfoObjKeys[0].split(" [")
        : versionInfoObjKeys[0].split(" ");

      systemInfo["ansible version"] = ansibleCoreVersion[1]
        .slice(0, -1)
        .split(" ")
        .pop()
        ?.trim();

      systemInfo["ansible location"] = versionInfo["executable location"];
    }

    // get python version
    const pythonVersion = await getBinDetail("python3", "--version");
    if (pythonVersion !== "failed") {
      systemInfo["python version"] = pythonVersion
        .toString()
        .trim()
        .split(" ")
        .pop()
        ?.trim();
    }

    // get python path
    const pythonPathResult = await getBinDetail(
      "python3",
      '-c "import sys; print(sys.executable)"',
    );
    if (pythonPathResult !== "failed") {
      systemInfo["python location"] = pythonPathResult.toString().trim();
    }

    // get ansible-creator version
    const ansibleCreatorVersion = await getBinDetail(
      "ansible-creator",
      "--version",
    );
    if (ansibleCreatorVersion !== "failed") {
      systemInfo["ansible-creator version"] = ansibleCreatorVersion
        .toString()
        .trim();
    }

    // get ansible-creator version
    const ansibleDevEnvironmentVersion = await getBinDetail("ade", "--version");
    if (ansibleDevEnvironmentVersion !== "failed") {
      systemInfo["ansible-dev-environment version"] =
        ansibleDevEnvironmentVersion.toString().trim();
    }

    // send the system details to the webview
    webView.postMessage({ command: "systemDetails", arguments: systemInfo });
  }
}
