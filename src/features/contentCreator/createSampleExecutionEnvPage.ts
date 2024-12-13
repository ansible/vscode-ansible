/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import * as semver from "semver";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { AnsibleSampleExecutionEnvInterface, PostMessageEvent } from "./types";
import { withInterpreter } from "../utils/commandRunner";
import { SettingsManager } from "../../settings";
import { expandPath, getBinDetail, runCommand } from "./utils";
import { ANSIBLE_CREATOR_VERSION_MIN } from "../../definitions/constants";

export class CreateSampleExecutionEnv {
  public static currentPanel: CreateSampleExecutionEnv | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
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
    if (CreateSampleExecutionEnv.currentPanel) {
      CreateSampleExecutionEnv.currentPanel._panel.reveal(
        vscode.ViewColumn.One,
      );
    } else {
      const panel = vscode.window.createWebviewPanel(
        "create-sample-execution-env",
        "Create Sample Ansible Execution Environment",
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

      CreateSampleExecutionEnv.currentPanel = new CreateSampleExecutionEnv(
        panel,
        extensionUri,
      );
    }
  }

  public dispose() {
    CreateSampleExecutionEnv.currentPanel = undefined;

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
      "createSampleExecutionEnvPageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "createSampleExecutionEnvPageStyle.css",
    ]);

    const codiconsUri = getUri(webview, extensionUri, [
      "media",
      "codicons",
      "codicon.css",
    ]);

    const workspaceDir = this.getWorkspaceFolder();
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
            <div class="title-div">
              <h1>Create a sample Ansible Execution Environment file</h1>
              <p class="subtitle">Streamlining automation</p>
            </div>

            <form id="init-form">
              <section class="component-container">

                <vscode-text-field id="path-url" class="required" form="init-form" placeholder="${workspaceDir}"
                  size="512">Destination path
                  <section slot="end" class="explorer-icon">
                    <vscode-button id="folder-explorer" appearance="icon">
                      <span class="codicon codicon-folder-opened"></span>
                    </vscode-button>
                  </section>
                </vscode-text-field>

                <div id="full-destination-path" class="full-destination-path">
                  <p>Default Destination path:&nbsp</p>
                </div>

                <div class="verbose-div">
                  <div class="dropdown-container">
                    <label for="verbosity-dropdown">Output Verbosity</label>
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
                      <vscode-dropdown id="log-level-dropdown" position="below">
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
                  <vscode-checkbox id="overwrite-checkbox" form="init-form">Overwrite <br><i>Overwrite the existing execution-environment.yml file.</i></vscode-checkbox>
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
                  <vscode-button id="open-file-button" form="init-form" disabled>
                    <span class="codicon codicon-go-to-file"></span>
                    &nbsp; Open Execution Environment file
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
          case "open-explorer": {
            payload = message.payload;
            const selectedUri = await this.openExplorerDialog(
              payload.selectOption,
            );
            webview.postMessage({
              command: "file-uri",
              arguments: { selectedUri: selectedUri },
            } as PostMessageEvent);
            return;
          }
          case "init-create":
            payload = message.payload as AnsibleSampleExecutionEnvInterface;
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

          case "init-open-scaffolded-file":
            payload = message.payload;
            this.openFileInWorkspace(payload.projectUrl);
            return;
        }
      },
      undefined,
      this._disposables,
    );
  }

  private async getCreatorVersion(): Promise<string> {
    const creatorVersion = (
      await getBinDetail("ansible-creator", "--version")
    ).toString();
    console.log("ansible-creator version: ", creatorVersion);
    return creatorVersion;
  }

  public async getCreatorCommand(url: string): Promise<string> {
    let command = "";

    command = `ansible-creator add resource execution-environment ${url} --no-ansi`;
    return command;
  }

  public async openExplorerDialog(
    selectOption: string,
  ): Promise<string | undefined> {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: "Select",
      canSelectFiles: selectOption === "file",
      canSelectFolders: selectOption === "folder",
      defaultUri: vscode.Uri.parse(os.homedir()),
    };

    let selectedUri: string | undefined;
    await vscode.window.showOpenDialog(options).then((fileUri) => {
      if (fileUri && fileUri[0]) {
        selectedUri = fileUri[0].fsPath;
      }
    });

    return selectedUri;
  }

  public getWorkspaceFolder() {
    let folder: string = "";
    if (vscode.workspace.workspaceFolders) {
      folder = vscode.workspace.workspaceFolders[0].uri.path;
    }
    return folder;
  }

  public async runInitCommand(
    payload: AnsibleSampleExecutionEnvInterface,
    webView: vscode.Webview,
  ) {
    const {
      destinationPath,
      logToFile,
      logFilePath,
      logFileAppend,
      logLevel,
      verbosity,
      isOverwritten,
    } = payload;

    const destinationPathUrl = destinationPath
      ? destinationPath
      : this.getWorkspaceFolder();

    let ansibleCreatorSampleEECommand =
      await this.getCreatorCommand(destinationPathUrl);

    const creatorVersion = await this.getCreatorVersion();
    if (isOverwritten) {
      if (semver.gte(creatorVersion, ANSIBLE_CREATOR_VERSION_MIN)) {
        ansibleCreatorSampleEECommand += " --overwrite";
      } else {
        ansibleCreatorSampleEECommand += " --force";
      }
    }

    switch (verbosity) {
      case "Off":
        ansibleCreatorSampleEECommand += "";
        break;
      case "Low":
        ansibleCreatorSampleEECommand += " -v";
        break;
      case "Medium":
        ansibleCreatorSampleEECommand += " -vv";
        break;
      case "High":
        ansibleCreatorSampleEECommand += " -vvv";
        break;
    }

    let logFilePathUrl = "";

    if (logToFile) {
      if (logFilePath) {
        logFilePathUrl = logFilePath;
      } else {
        logFilePathUrl = `${os.tmpdir()}/ansible-creator.log`;
      }

      ansibleCreatorSampleEECommand += ` --lf=${logFilePathUrl}`;

      ansibleCreatorSampleEECommand += ` --ll=${logLevel.toLowerCase()}`;

      if (logFileAppend) {
        ansibleCreatorSampleEECommand += ` --la=true`;
      } else {
        ansibleCreatorSampleEECommand += ` --la=false`;
      }
    }

    console.debug("[ansible-creator] command: ", ansibleCreatorSampleEECommand);

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const { command, env } = withInterpreter(
      extSettings.settings,
      ansibleCreatorSampleEECommand,
      "",
    );

    let commandOutput = "";

    // execute ansible-creator command
    const ansibleCreatorExecutionResult = await runCommand(command, env);
    commandOutput += `------------------------------------ ansible-creator logs ------------------------------------\n`;
    commandOutput += ansibleCreatorExecutionResult.output;
    const commandPassed = ansibleCreatorExecutionResult.status;

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        logFileUrl: logFilePathUrl,
        projectUrl: destinationPathUrl,
        status: commandPassed,
      },
    } as PostMessageEvent);

    if (commandPassed === "passed") {
      const selection = await vscode.window.showInformationMessage(
        `Ansible Sample Execution Environment file created at: ${destinationPathUrl}`,
        `Open Sample Execution Environment file ↗`,
      );
      if (selection === "Open Sample Execution Environment file ↗") {
        this.openFileInWorkspace(destinationPathUrl);
      }
    }
  }

  public async openLogFile(fileUrl: string) {
    const logFileUrl = vscode.Uri.file(expandPath(fileUrl)).fsPath;
    console.log(`[ansible-creator] New Log file url: ${logFileUrl}`);
    const parsedUrl = vscode.Uri.parse(`vscode://file${logFileUrl}`);
    console.log(`[ansible-creator] Parsed log file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public async openFileInWorkspace(fileUrl: string) {
    const fileUri = vscode.Uri.parse(expandPath(fileUrl));

    if (vscode.workspace.workspaceFolders?.length === 0) {
      vscode.workspace.updateWorkspaceFolders(0, null, { uri: fileUri });
    } else {
      await vscode.commands.executeCommand("vscode.openFolder", fileUri, {
        forceNewWindow: true,
      });
    }

    // open the sample execution environment file in the editor
    const eeFileUrl = vscode.Uri.joinPath(
      vscode.Uri.parse(fileUrl),
      "execution-environment.yml",
    ).fsPath;
    console.log(
      `[ansible-creator] Execution Environment file url: ${eeFileUrl}`,
    );
    const parsedUrl = vscode.Uri.parse(`vscode://file${eeFileUrl}`);
    console.log(
      `[ansible-creator] Parsed Execution Environment file url: ${parsedUrl}`,
    );
    this.openFileInEditor(parsedUrl.toString());
  }

  public openFileInEditor(fileUrl: string) {
    const updatedUrl = expandPath(fileUrl);
    console.log(`[ansible-creator] Updated url: ${updatedUrl}`);

    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
}
