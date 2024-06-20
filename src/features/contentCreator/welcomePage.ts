/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import * as ini from "ini";
import { getBinDetail } from "./utils";

export class AnsibleCreatorMenu {
  public static currentPanel: AnsibleCreatorMenu | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getWebviewContent(
      this._panel.webview,
      extensionUri,
    );
    this._setWebviewMessageListener(this._panel.webview);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static render(extensionUri: vscode.Uri) {
    if (AnsibleCreatorMenu.currentPanel) {
      AnsibleCreatorMenu.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "content-creator-menu",
        "Ansible Content Creator",
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

      AnsibleCreatorMenu.currentPanel = new AnsibleCreatorMenu(
        panel,
        extensionUri,
      );
    }
  }

  public dispose() {
    AnsibleCreatorMenu.currentPanel = undefined;

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
      "contentCreator",
      "welcomePageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "welcomePageStyle.css",
    ]);

    const codiconsUri = getUri(webview, extensionUri, [
      "media",
      "codicons",
      "codicon.css",
    ]);

    const contentCreatorIcon = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "icons",
      "ansible-logo-red.png",
    ]);

    const initIcon = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "icons",
      "ansible-creator-init.png",
    ]);

    const sampleIcon = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "icons",
      "ansible-creator-sample.png",
    ]);

    const createIcon = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "icons",
      "ansible-creator-create.png",
    ]);

    return /*html*/ `
      <html>

        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource};">
          <title>AAA</title>
          <link rel="stylesheet" href="${styleUri}">
          <link rel="stylesheet" href="${codiconsUri}">
        </head>

        <body>
          <div class="intro">
            <div class="heading">
              <img src="${contentCreatorIcon}" alt="Ansible Creator Icon">
              <h1>nsible Content Creator</h1>
            </div>

            <p>A tool for scaffolding ansible content.
              <vscode-link href="https://github.com/ansible-community/ansible-creator#ansible-creator">Read our docs</vscode-link>
              to learn more about this tool.</p>

            <div id="system-check">
              <div class="icon">
                <p>System requirements:</p>
              </div>

              <div id=install-status></div>

              <div class="refresh-button-div">
                <vscode-button id="refresh">
                  <span class="codicon codicon-refresh"></span>
                  &nbsp; Refresh
                </vscode-button>
              </div>

            </div>
          </div>

          <vscode-divider role="presentation"></vscode-divider>

          <div class="menu">
            <div class="menu-item">
              <vscode-link href="command:ansible.content-creator.create-ansible-collection">
                <img src="${initIcon}" alt="Ansible Creator Icon">
              </vscode-link>
                <p class="menu-item-heading">Initialize ansible collection</p>
            </div>

            <div class="menu-item">
              <vscode-link href="command:ansible.lightspeed.playbookGeneration">
                <img src="${createIcon}" alt="Ansible Creator Icon">
              </vscode-link>
                <p class="menu-item-heading">Create ansible content</p>
            </div>

            <div class="menu-item">
              <vscode-link href="command:ansible.content-creator.sample">
                <img src="${sampleIcon}" alt="Ansible Creator Icon">
              </vscode-link>
                <p class="menu-item-heading">Open sample manifest file</p>
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
        const command = message.message;
        switch (command) {
          case "refresh-page":
            await this.refreshPage();
            return;

          case "set-system-status-view":
            await this.getSystemDetails(webview);
            return;
        }
      },
      undefined,
      this._disposables,
    );
  }

  private async refreshPage() {
    await vscode.commands.executeCommand(
      "workbench.action.webview.reloadWebviewAction",
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
