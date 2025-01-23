/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import * as semver from "semver";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { AnsibleProjectFormInterface, PostMessageEvent } from "./types";
import { withInterpreter } from "../utils/commandRunner";
import { SettingsManager } from "../../settings";
import { expandPath, getCreatorVersion, runCommand } from "./utils";
import { ANSIBLE_CREATOR_VERSION_MIN } from "../../definitions/constants";

export class CreateAnsibleProject {
  public static currentPanel: CreateAnsibleProject | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  public static readonly viewType = "CreateProject";

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
    if (CreateAnsibleProject.currentPanel) {
      CreateAnsibleProject.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "create-ansible-project",
        "Create Ansible project",
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

      CreateAnsibleProject.currentPanel = new CreateAnsibleProject(
        panel,
        extensionUri,
      );
    }
  }

  public dispose() {
    CreateAnsibleProject.currentPanel = undefined;

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
      "createAnsibleProjectPageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "createAnsibleProjectPageStyle.css",
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource};"/>
          <title>AAA</title>
          <link rel="stylesheet" href="${styleUri}"/>
          <link rel="stylesheet" href="${codiconsUri}"id="vscode-codicon-stylesheet"/>
        </head>

        <body>
            <div class="title-div">
              <h1>Create new Ansible playbook project</h1>
              <p class="subtitle">Streamlining automation</p>
            </div>

            <form id="init-form">
              <section class="component-container">

                <vscode-form-group variant="vertical">
                  <vscode-label for="path-url">
                    <span class="normal">Destination directory</span>
                  </vscode-label>
                  <vscode-textfield id="path-url" class="required" form="init-form" placeholder="${homeDir}"
                    size="512">
                    <vscode-icon
                      slot="content-after"
                      id="folder-explorer"
                      name="folder-opened"
                      action-icon
                    ></vscode-icon>
                  </vscode-textfield>
                </vscode-form-group>

                <div class="playbook-project-div">
                <vscode-form-group variant="vertical">
                  <vscode-label for="namespace-name">
                    <span class="normal">Namespace *</span>
                  </vscode-label>
                  <vscode-textfield id="namespace-name" form="init-form" placeholder="Enter namespace name" size="512"></vscode-textfield>
                </vscode-form-group>
                <vscode-form-group variant="vertical">
                  <vscode-label for="collection-name">
                    <span class="normal">Collection *</span>
                  </vscode-label>
                  <vscode-textfield id="collection-name" form="init-form" placeholder="Enter collection name" size="512"></vscode-textfield>
                </vscode-form-group>
                </div>

                <div id="full-collection-path" class="full-collection-path">
                  <p>Project path:&nbsp</p>
                </div>

                <div class="verbose-div">
                  <div class="dropdown-container">
                    <vscode-label for="verbosity-dropdown">
                      <span class="normal">Output Verbosity</span>
                    </vscode-label>
                    <vscode-single-select id="verbosity-dropdown" position="below">
                      <vscode-option>Off</vscode-option>
                      <vscode-option>Low</vscode-option>
                      <vscode-option>Medium</vscode-option>
                      <vscode-option>High</vscode-option>
                    </vscode-single-select>
                  </div>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="log-to-file-checkbox" form="init-form">Log output to a file <br><i>Default path:
                      ${tempDir}/ansible-creator.log.</i></vscode-checkbox>
                </div>

                <div id="log-to-file-options-div">
                  <vscode-form-group variant="vertical">
                    <vscode-label for="log-file-path">
                      <span class="normal">Log file path<span>
                    </vscode-label>
                    <vscode-textfield id="log-file-path" class="required" form="init-form" placeholder="${tempDir}/ansible-creator.log"
                      size="512">
                      <vscode-icon
                      slot="content-after"
                      id="file-explorer"
                      name="file"
                      action-icon
                    ></vscode-icon>
                    </vscode-textfield>
                  </vscode-form-group>

                  <vscode-checkbox id="log-file-append-checkbox" form="init-form">Append</i></vscode-checkbox>

                  <div class="log-level-div">
                    <div class="dropdown-container">
                      <vscode-label for="log-level-dropdown">
                        <span class="normal">Log level</span>
                      </vscode-label>
                      <vscode-single-select id="log-level-dropdown" position="below">
                        <vscode-option>Debug</vscode-option>
                        <vscode-option>Info</vscode-option>
                        <vscode-option>Warning</vscode-option>
                        <vscode-option>Error</vscode-option>
                        <vscode-option>Critical</vscode-option>
                      </vscode-single-select>
                    </div>
                  </div>

                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="overwrite-checkbox" form="init-form">Overwrite <br><i>Overwriting will remove the existing content in the specified directory and replace it with the files from the Ansible project.</i></vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button id="clear-button" form="init-form" secondary>
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
                <vscode-textarea id="log-text-area" cols="90" rows="10" placeholder="Output of the command execution"
                  resize="vertical" readonly>Logs</vscode-textarea>

                <div class="group-buttons">
                  <vscode-button id="clear-logs-button" form="init-form" secondary>
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button id="copy-logs-button" form="init-form" secondary>
                    <span class="codicon codicon-copy"></span>
                    &nbsp; Copy Logs
                  </vscode-button>
                  <vscode-button id="open-log-file-button" form="init-form" secondary disabled>
                    <span class="codicon codicon-open-preview"></span>
                    &nbsp; Open Log File
                  </vscode-button>
                  <vscode-button id="open-folder-button" form="init-form" disabled>
                    <span class="codicon codicon-folder-active"></span>
                    &nbsp; Open Project
                  </vscode-button>
                </div>
              </section>
            </form>

          <!-- Component registration code -->
          <script type="module" nonce="${getNonce()}">
            import "@vscode-elements/elements/dist/vscode-button/index.js";
            import "@vscode-elements/elements/dist/vscode-checkbox/index.js";
            import "@vscode-elements/elements/dist/vscode-divider/index.js";
            import "@vscode-elements/elements/dist/vscode-form-group/index.js";
            import "@vscode-elements/elements/dist/vscode-label/index.js";
            import "@vscode-elements/elements/dist/vscode-single-select/index.js";
            import "@vscode-elements/elements/dist/vscode-textarea/index.js";
            import "@vscode-elements/elements/dist/vscode-textfield/index.js";
          </script>
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
            payload = message.payload as AnsibleProjectFormInterface;
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
            await this.openFolderInWorkspace(payload.projectUrl);
            return;
        }
      },
      undefined,
      this._disposables,
    );
  }

  public async getPlaybookCreatorCommand(
    namespace: string,
    collection: string,
    url: string,
  ): Promise<string> {
    let command = "";
    const creatorVersion = await getCreatorVersion();

    if (semver.gte(creatorVersion, ANSIBLE_CREATOR_VERSION_MIN)) {
      command = `ansible-creator init playbook ${namespace}.${collection} ${url} --no-ansi`;
    } else {
      command = `ansible-creator init --project=ansible-project --init-path=${url} --scm-org=${namespace} --scm-project=${collection} --no-ansi`;
    }
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

  public async runInitCommand(
    payload: AnsibleProjectFormInterface,
    webView: vscode.Webview,
  ) {
    const {
      destinationPath,
      namespaceName,
      collectionName,
      logToFile,
      logFilePath,
      logFileAppend,
      logLevel,
      verbosity,
      isOverwritten,
    } = payload;

    const destinationPathUrl = destinationPath
      ? destinationPath
      : `${os.homedir()}/${namespaceName}-${collectionName}`;

    let ansibleCreatorInitCommand = await this.getPlaybookCreatorCommand(
      namespaceName,
      collectionName,
      destinationPathUrl,
    );

    const creatorVersion = await getCreatorVersion();
    const exceedMinVersion = semver.gte(
      creatorVersion,
      ANSIBLE_CREATOR_VERSION_MIN,
    );

    if (exceedMinVersion && isOverwritten) {
      ansibleCreatorInitCommand += " --overwrite";
    } else if (!exceedMinVersion && isOverwritten) {
      ansibleCreatorInitCommand += " --force";
    } else if (exceedMinVersion && !isOverwritten) {
      ansibleCreatorInitCommand += " --no-overwrite";
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

    const { command, env } = withInterpreter(
      extSettings.settings,
      ansibleCreatorInitCommand,
      "",
    );

    let commandOutput = "";

    // execute ansible-creator command
    const ansibleCreatorExecutionResult = await runCommand(command, env);
    commandOutput += `----------------------------------------- ansible-creator logs ------------------------------------------\n`;
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
  }

  public async openLogFile(fileUrl: string) {
    const logFileUrl = vscode.Uri.file(expandPath(fileUrl)).fsPath;
    console.log(`[ansible-creator] New Log file url: ${logFileUrl}`);
    const parsedUrl = vscode.Uri.parse(`vscode://file${logFileUrl}`);
    console.log(`[ansible-creator] Parsed log file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public async openFolderInWorkspace(folderUrl: string) {
    const folderUri = vscode.Uri.parse(expandPath(folderUrl));

    // add folder to a new workspace
    // vscode.workspace.updateWorkspaceFolders(0, 1, { uri: folderUri });

    if (vscode.workspace.workspaceFolders?.length === 0) {
      vscode.workspace.updateWorkspaceFolders(0, null, { uri: folderUri });
    } else {
      await vscode.commands.executeCommand("vscode.openFolder", folderUri, {
        forceNewWindow: true,
      });
    }

    // open site.yml file in the editor
    const playbookFileUrl = vscode.Uri.joinPath(
      vscode.Uri.parse(folderUrl),
      "site.yml",
    ).fsPath;
    console.log(`[ansible-creator] Playbook file url: ${playbookFileUrl}`);
    const parsedUrl = vscode.Uri.parse(`vscode://file${playbookFileUrl}`);
    console.log(`[ansible-creator] Parsed playbook file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public openFileInEditor(fileUrl: string) {
    const updatedUrl = expandPath(fileUrl);
    console.log(`[ansible-creator] Updated url: ${updatedUrl}`);

    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
}
