/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import * as semver from "semver";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { AnsibleSampleExecutionEnvInterface, PostMessageEvent } from "./types";
import { withInterpreter } from "../utils/commandRunner";
import { SettingsManager } from "../../settings";
import { expandPath, runCommand, getCreatorVersion } from "./utils";
import { ANSIBLE_CREATOR_EE_VERSION_MIN } from "../../definitions/constants";

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
    const { destinationPath, verbosity, isOverwritten } = payload;

    const destinationPathUrl = destinationPath
      ? destinationPath
      : this.getWorkspaceFolder();

    let ansibleCreatorSampleEECommand =
      await this.getCreatorCommand(destinationPathUrl);

    if (isOverwritten) {
      ansibleCreatorSampleEECommand += " --overwrite";
    } else {
      ansibleCreatorSampleEECommand += " --no-overwrite";
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

    console.debug("[ansible-creator] command: ", ansibleCreatorSampleEECommand);

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const { command, env } = withInterpreter(
      extSettings.settings,
      ansibleCreatorSampleEECommand,
      "",
    );

    let commandOutput = "";
    let commandResult: string;

    commandOutput += `------------------------------------ ansible-creator logs ------------------------------------\n`;
    const creatorVersion = await getCreatorVersion();
    if (semver.gte(creatorVersion, ANSIBLE_CREATOR_EE_VERSION_MIN)) {
      // execute ansible-creator command
      const ansibleCreatorExecutionResult = await runCommand(command, env);
      commandOutput += ansibleCreatorExecutionResult.output;
      commandResult = ansibleCreatorExecutionResult.status;
    } else {
      commandOutput += `Minimum ansible-creator version needed to scaffold an execution-environment.yml file is ${ANSIBLE_CREATOR_EE_VERSION_MIN}\n`;
      commandOutput += `Please upgrade ansible-creator to minimum required version and try again.`;
      commandResult = "failed";
    }

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        projectUrl: destinationPathUrl,
        status: commandResult,
      },
    } as PostMessageEvent);

    if (commandResult === "passed") {
      const selection = await vscode.window.showInformationMessage(
        `Ansible Sample Execution Environment file created at: ${destinationPathUrl}`,
        `Open Sample Execution Environment file ↗`,
      );
      if (selection === "Open Sample Execution Environment file ↗") {
        this.openFileInWorkspace(destinationPathUrl);
      }
    }
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
