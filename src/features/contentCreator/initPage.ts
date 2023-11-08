/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as cp from "child_process";
import * as os from "os";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { AnsibleCreatorInitInterface } from "./types";
import { withInterpreter } from "../utils/commandRunner";
import { SettingsManager } from "../../settings";

export class AnsibleCreatorInit {
  public static currentPanel: AnsibleCreatorInit | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getWebviewContent(
      this._panel.webview,
      extensionUri
    );
    this._setWebviewMessageListener(this._panel.webview);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static render(extensionUri: vscode.Uri) {
    if (AnsibleCreatorInit.currentPanel) {
      AnsibleCreatorInit.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "content-creator-init",
        "Ansible Content Creator: Init",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(extensionUri, "out"),
            vscode.Uri.joinPath(extensionUri, "media"),
          ],
          enableCommandUris: true,
          retainContextWhenHidden: true,
        }
      );

      AnsibleCreatorInit.currentPanel = new AnsibleCreatorInit(
        panel,
        extensionUri
      );
    }
  }

  public dispose() {
    AnsibleCreatorInit.currentPanel = undefined;

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
    extensionUri: vscode.Uri
  ) {
    const webviewUri = getUri(webview, extensionUri, [
      "out",
      "client",
      "webview",
      "apps",
      "contentCreator",
      "initPageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "initPageStyle.css",
    ]);

    const codiconsUri = getUri(webview, extensionUri, [
      "media",
      "codicons",
      "codicon.css",
    ]);

    const homeDir = os.homedir();
    const tempDir = os.tmpdir();

    return /*html*/ `
      <html>

        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource};">
          <title>AAA</title>
          <link rel="stylesheet" href="${styleUri}">
          <link rel="stylesheet" href="${codiconsUri}">
        </head>

        <body>
            <h1>Ansible Creator: Init</h1>
            <form id="init-form">
              <section class="component-container">

                <vscode-text-field id="namespace-name" form="init-form" placeholder="Enter namespace name" size="512">Namespace
                  *</vscode-text-field>
                <vscode-text-field id="collection-name" form="init-form" placeholder="Enter collection name" size="512">Collection
                  *</vscode-text-field>

                <div id="full-collection-name" class="full-collection-name">
                  <p>Collection name:&nbsp</p>
                </div>

                <vscode-text-field id="path-url" class="required" form="init-form" placeholder="${homeDir}/.ansible/collections/ansible_collections"
                  size="512">Init path
                  <section slot="end" class="explorer-icon">
                    <vscode-button id="folder-explorer" appearance="icon">
                      <span class="codicon codicon-folder-opened"></span>
                    </vscode-button>
                  </section>
                </vscode-text-field>

                <div id="full-collection-path" class="full-collection-name">
                  <p>Collection path:&nbsp</p>
                </div>

                <div class="verbose-div">
                  <div class="dropdown-container">
                    <label for="verbosity-dropdown">Verbosity</label>
                    <vscode-dropdown id="verbosity-dropdown">
                      <vscode-option>Off</vscode-option>
                      <vscode-option>Low</vscode-option>
                      <vscode-option>Medium</vscode-option>
                      <vscode-option>High</vscode-option>
                    </vscode-dropdown>
                  </div>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="log-to-file-checkbox" form="init-form">Log to output to file <br><i>Default path:
                      ${tempDir}/ansible-creator.log.</i></vscode-checkbox>
                </div>

                <div id="log-to-file-options-div">
                  <vscode-text-field id="log-file-path" class="required" form="init-form" placeholder="${tempDir}/ansible-creator.log"
                    size="512">Log file path
                    <section slot="end" class="explorer-icon">
                    <vscode-button id="file-explorer" appearance="icon">
                      <span class="codicon codicon-file"></span>
                    </vscode-button>
                  </section>
                  </vscode-text-field>

                  <vscode-checkbox id="log-file-append-checkbox" form="init-form">Append</i></vscode-checkbox>

                  <div class="log-level-div">
                    <div class="dropdown-container">
                      <label for="log-level-dropdown">Log level</label>
                      <vscode-dropdown id="log-level-dropdown">
                        <vscode-option>Debug</vscode-option>
                        <vscode-option>Info</vscode-option>
                        <vscode-option>Warning</vscode-option>
                        <vscode-option>Error</vscode-option>
                        <vscode-option>Critical</vscode-option>
                      </vscode-dropdown>
                    </div>
                  </div>

                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="force-checkbox" form="init-form">Force <br><i>Forcing re-initialization might
                      delete the existing work in the specified directory.</i></vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button id="clear-button" form="init-form" appearance="secondary">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear All
                  </vscode-button>
                  <vscode-button id="create-button" form="init-form">
                    <span class="codicon codicon-run-all"></span>
                    &nbsp; Create
                  </vscode-button>
                </div>

                <br>
                <vscode-divider></vscode-divider>
                <br>
                <vscode-text-area id="log-text-area" cols="512" rows="10" placeholder="Output of the command execution"
                  resize="vertical" readonly>Logs</vscode-text-area>

                <div class="group-buttons">
                  <vscode-button id="clear-logs-button" form="init-form" appearance="secondary">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button id="copy-logs-button" form="init-form" appearance="secondary">
                    <span class="codicon codicon-copy"></span>
                    &nbsp; Copy Logs
                  </vscode-button>
                  <vscode-button id="open-log-file-button" form="init-form" appearance="secondary" disabled>
                    <span class="codicon codicon-open-preview"></span>
                    &nbsp; Open Log File
                  </vscode-button>
                  <vscode-button id="open-folder-button" form="init-form" disabled>
                    <span class="codicon codicon-folder-active"></span>
                    &nbsp; Open Collection
                  </vscode-button>
                </div>
              </section>
            </form>

          <!-- Component registration code -->
          <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
        </body>
      </html>
    `;
  }

  private _setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      async (message: any) => {
        const command = message.command;
        let payload;

        switch (command) {
          case "open-explorer":
            payload = message.payload;
            const selectedUri = await this.openExplorerDialog(
              payload.selectOption
            );
            webview.postMessage({
              command: "file-uri",
              arguments: { selectedUri: selectedUri },
            });
            return;

          case "init-create":
            payload = message.payload as AnsibleCreatorInitInterface;
            await this.runInitCommand(payload, webview);
            return;

          case "init-copy-logs":
            payload = message.payload;
            vscode.env.clipboard.writeText(payload.initExecutionLogs);
            await vscode.window.showInformationMessage(
              "Logs copied to clipboard"
            );
            return;

          case "init-open-log-file":
            payload = message.payload;
            await this.openLogFile(payload.logFileUrl);
            return;

          case "init-open-scaffolded-folder":
            payload = message.payload;
            await this.openFolderInWorkspace(payload.scaffoldedFolderUrl);
            return;
        }
      },
      undefined,
      this._disposables
    );
  }

  public async openExplorerDialog(selectOption: string) {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: "Select",
      canSelectFiles: selectOption === "file",
      canSelectFolders: selectOption === "folder",
      defaultUri: vscode.Uri.parse(os.homedir()),
    };

    let selectedUri;
    await vscode.window.showOpenDialog(options).then((fileUri) => {
      if (fileUri && fileUri[0]) {
        selectedUri = fileUri[0].fsPath;
      }
    });

    return selectedUri;
  }

  public async runInitCommand(
    payload: AnsibleCreatorInitInterface,
    webView: vscode.Webview
  ) {
    const {
      namespaceName,
      collectionName,
      initPath,
      logToFile,
      logFilePath,
      logFileAppend,
      logLevel,
      verbosity,
      isForced,
    } = payload;

    let ansibleCreatorInitCommand = `ansible-creator init ${namespaceName}.${collectionName} --no-ansi`;

    const initPathUrl = initPath
      ? initPath
      : `${os.homedir()}/.ansible/collections/ansible_collections`;

    ansibleCreatorInitCommand += ` --init-path=${initPathUrl}`;

    if (isForced) {
      ansibleCreatorInitCommand += " --force";
    }

    switch (verbosity) {
      case "Off":
        ansibleCreatorInitCommand += "";
        break;
      case "Low":
        ansibleCreatorInitCommand += " -v";
        break;
      case "Medium":
        ansibleCreatorInitCommand += " -vv";
        break;
      case "High":
        ansibleCreatorInitCommand += " -vvv";
        break;
    }

    let logFilePathUrl = "";

    if (logToFile) {
      if (logFilePath) {
        logFilePathUrl = logFilePath;
      } else {
        logFilePathUrl = `${os.tmpdir()}/ansible-creator.log`;
      }

      ansibleCreatorInitCommand += ` --lf=${logFilePathUrl}`;

      ansibleCreatorInitCommand += ` --ll=${logLevel.toLowerCase()}`;

      if (logFileAppend) {
        ansibleCreatorInitCommand += ` --la=true`;
      } else {
        ansibleCreatorInitCommand += ` --la=false`;
      }
    }

    console.debug("[ansible-creator] command: ", ansibleCreatorInitCommand);

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const [command, runEnv] = withInterpreter(
      extSettings.settings,
      ansibleCreatorInitCommand,
      ""
    );

    let commandOutput = "";
    let commandPassed = true;

    const collectionUrl = vscode.Uri.joinPath(
      vscode.Uri.parse(initPathUrl),
      namespaceName,
      collectionName
    ).fsPath;

    const commandExecution = cp.exec(command, {
      env: runEnv,
      cwd: os.homedir(),
    });

    // fail
    commandExecution.stderr?.on("data", async function (data) {
      commandOutput += await data.toString();
      commandPassed = false;
      await webView.postMessage({
        command: "execution-log",
        arguments: {
          commandOutput: commandOutput,
          logFileUrl: logFilePathUrl,
        },
      });
    });

    // pass
    commandExecution.stdout?.on("data", async function (data) {
      commandOutput += await data.toString();
      await webView.postMessage({
        command: "execution-log",
        arguments: {
          commandOutput: commandOutput,
          logFileUrl: logFilePathUrl,
        },
      });
    });

    // exit
    commandExecution.on("exit", async function (code) {
      commandOutput += `\nProcess exited with status: ${
        commandPassed ? "success" : "failure"
      } and code: ${code?.toString()}`;
      await webView.postMessage({
        command: "execution-log",
        arguments: {
          status: commandPassed ? "pass" : "fail",
          commandOutput: commandOutput,
          logFileUrl: logFilePathUrl,
          collectionUrl: collectionUrl,
        },
      });
    });
  }

  public async openLogFile(fileUrl: string) {
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(`vscode://file/${fileUrl}`)
    );
  }

  public async openFolderInWorkspace(folderUrl: string) {
    const folderUri = vscode.Uri.joinPath(vscode.Uri.parse(folderUrl), "..");

    // add folder to workspace
    vscode.workspace.updateWorkspaceFolders(0, null, { uri: folderUri });
    vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders.length
        : 0,
      null,
      { uri: folderUri }
    );

    // open the galaxy file in the editor
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(`vscode://file/${folderUrl}/galaxy.yml`)
    );
  }
}
