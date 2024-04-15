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
      extensionUri,
    );
    this._setWebviewMessageListener(this._panel.webview);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static render(extensionUri: vscode.Uri) {
    if (AnsibleCreatorInit.currentPanel) {
      AnsibleCreatorInit.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "scaffold-ansible-collection",
        "Scaffold Ansible Collection",
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

      AnsibleCreatorInit.currentPanel = new AnsibleCreatorInit(
        panel,
        extensionUri,
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
    extensionUri: vscode.Uri,
  ) {
    const webviewUri = getUri(webview, extensionUri, [
      "out",
      "client",
      "webview",
      "apps",
      "contentCreator",
      "scaffoldCollectionPageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "scaffoldCollectionPageStyle.css",
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
            <h1>Scaffold Ansible Collection</h1>
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
                  <p>Default collection path:&nbsp</p>
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
                  <vscode-checkbox id="log-to-file-checkbox" form="init-form">Log output to a file <br><i>Default path:
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

                <div class="checkbox-div">
                  <vscode-checkbox id="editable-mode-checkbox" form="init-form">Install collection from source code (editable mode) <br><i>This will
                    allow immediate reflection of content changes without having to reinstalling it. <br>
                    (NOTE: Requires ansible-dev-environment installed in the environment.)</i></vscode-checkbox>
                    <vscode-link id="ade-docs-link"href="https://ansible.readthedocs.io/projects/dev-environment/">Learn more.</vscode-link>
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
              payload.selectOption,
            );
            webview.postMessage({
              command: "file-uri",
              arguments: { selectedUri: selectedUri },
            });
            return;

          case "check-ade-presence":
            await this.isADEPresent(webview);
            return;

          case "init-create":
            payload = message.payload as AnsibleCreatorInitInterface;
            await this.runInitCommand(payload, webview);
            return;

          case "init-copy-logs":
            payload = message.payload;
            vscode.env.clipboard.writeText(payload.initExecutionLogs);
            await vscode.window.showInformationMessage(
              "Logs copied to clipboard",
            );
            return;

          case "init-open-log-file":
            payload = message.payload;
            await this.openLogFile(payload.logFileUrl);
            return;

          case "init-open-scaffolded-folder":
            payload = message.payload;
            await this.openFolderInWorkspace(payload.collectionUrl);
            return;
        }
      },
      undefined,
      this._disposables,
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

  public async isADEPresent(webView: vscode.Webview) {
    const ADEVersion = await this.getBinDetail("ade", "--version");
    if (ADEVersion === "failed") {
      // send the system details to the webview
      webView.postMessage({ command: "ADEPresence", arguments: false });
      return;
    }
    // send the system details to the webview
    webView.postMessage({ command: "ADEPresence", arguments: true });
    return;
  }

  public async runInitCommand(
    payload: AnsibleCreatorInitInterface,
    webView: vscode.Webview,
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
      isEditableModeInstall,
    } = payload;

    const initPathUrl = initPath
      ? initPath
      : `${os.homedir()}/.ansible/collections/ansible_collections`;

    let ansibleCreatorInitCommand = `ansible-creator init ${namespaceName}.${collectionName} --init-path=${initPathUrl} --no-ansi`;

    // adjust collection url for using it in ade and opening it in workspace
    // NOTE: this is done in order to synchronize the behavior of ade and extension
    // with the behavior of ansible-creator CLI tool

    const collectionUrl = initPath.endsWith("/collections/ansible_collections")
      ? vscode.Uri.joinPath(
          vscode.Uri.parse(initPathUrl),
          namespaceName,
          collectionName,
        ).fsPath
      : initPath;

    let adeCommand = `ade install --editable ${collectionUrl} --no-ansi`;

    if (isForced) {
      ansibleCreatorInitCommand += " --force";
    }

    switch (verbosity) {
      case "Off":
        ansibleCreatorInitCommand += "";
        adeCommand += "";
        break;
      case "Low":
        ansibleCreatorInitCommand += " -v";
        adeCommand += " -v";
        break;
      case "Medium":
        ansibleCreatorInitCommand += " -vv";
        adeCommand += " -vv";
        break;
      case "High":
        ansibleCreatorInitCommand += " -vvv";
        adeCommand += " -vvv";
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
      "",
    );

    let commandOutput = "";

    // execute ansible-creator command
    const ansibleCreatorExecutionResult = await this.runCommand(
      command,
      runEnv,
    );
    commandOutput += `------------------------------------ ansible-creator logs ------------------------------------\n`;
    commandOutput += ansibleCreatorExecutionResult.output;
    const ansibleCreatorCommandPassed = ansibleCreatorExecutionResult.status;

    if (isEditableModeInstall) {
      // ade command inherits only the verbosity options from ansible-creator command
      console.debug("[ade] command: ", adeCommand);

      const [command, runEnv] = withInterpreter(
        extSettings.settings,
        adeCommand,
        "",
      );

      // execute ade command
      const adeExecutionResult = await this.runCommand(command, runEnv);
      commandOutput += `\n\n------------------------------- ansible-dev-environment logs --------------------------------\n`;
      commandOutput += adeExecutionResult.output;
    }

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        logFileUrl: logFilePathUrl,
        collectionUrl: collectionUrl,
        status: ansibleCreatorCommandPassed,
      },
    });
  }

  public async openLogFile(fileUrl: string) {
    const logFileUrl = vscode.Uri.file(this.expandPath(fileUrl)).fsPath;
    console.log(`[ansible-creator] New Log file url: ${logFileUrl}`);
    const parsedUrl = vscode.Uri.parse(`vscode://file${logFileUrl}`);
    console.log(`[ansible-creator] Parsed log file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public async openFolderInWorkspace(folderUrl: string) {
    const folderUri = vscode.Uri.parse(this.expandPath(folderUrl));

    // add folder to workspace
    vscode.workspace.updateWorkspaceFolders(0, null, { uri: folderUri });
    vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders.length
        : 0,
      null,
      { uri: folderUri },
    );

    // open the galaxy file in the editor
    const galaxyFileUrl = vscode.Uri.joinPath(
      vscode.Uri.parse(folderUrl),
      "galaxy.yml",
    ).fsPath;
    console.log(`[ansible-creator] Galaxy file url: ${galaxyFileUrl}`);
    const parsedUrl = vscode.Uri.parse(`vscode://file${galaxyFileUrl}`);
    console.log(`[ansible-creator] Parsed galaxy file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public openFileInEditor(fileUrl: string) {
    const updatedUrl = this.expandPath(fileUrl);

    console.log(`[ansible-creator] Updated url: ${updatedUrl}`);

    // vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }

  /**
   * A function to expand the path similar to how os.expanduser() and os.expandvars() work in python
   * @param pathUrl - original path url (string)
   * @returns updatedUrl - updated and expanded path url (string)
   */
  private expandPath(pathUrl: string): string {
    let updatedUrl = pathUrl;

    // expand `~` to home directory.
    const re1 = /~/gi;
    updatedUrl = updatedUrl.replace(re1, os.homedir());

    // expand `$HOME` to home directory
    const re2 = /\$HOME/gi;
    updatedUrl = updatedUrl.replace(re2, os.homedir());

    return updatedUrl;
  }

  private async runCommand(
    command: string,
    runEnv: NodeJS.ProcessEnv | undefined,
  ): Promise<{ output: string; status: string }> {
    const extSettings = new SettingsManager();
    await extSettings.initialize();

    try {
      const result = cp
        .execSync(command, {
          env: runEnv,
          cwd: os.homedir(),
        })
        .toString();
      return { output: result, status: "passed" };
    } catch (err: any) {
      const errorMessage = err.stderr.toString();
      return { output: errorMessage, status: "failed" };
    }
  }

  private async getBinDetail(cmd: string, arg: string) {
    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const [command, runEnv] = withInterpreter(extSettings.settings, cmd, arg);

    try {
      const result = cp.execSync(command, {
        env: runEnv,
      });
      return result;
    } catch {
      return "failed";
    }
  }
}
