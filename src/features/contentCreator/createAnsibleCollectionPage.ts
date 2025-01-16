/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import * as semver from "semver";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { AnsibleCollectionFormInterface, PostMessageEvent } from "./types";
import { withInterpreter } from "../utils/commandRunner";
import { SettingsManager } from "../../settings";
import {
  expandPath,
  getBinDetail,
  getCreatorVersion,
  runCommand,
} from "./utils";
import {
  ANSIBLE_CREATOR_COLLECTION_VERSION_MIN,
  ANSIBLE_CREATOR_VERSION_MIN,
} from "../../definitions/constants";

export class CreateAnsibleCollection {
  public static currentPanel: CreateAnsibleCollection | undefined;
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
    if (CreateAnsibleCollection.currentPanel) {
      CreateAnsibleCollection.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "create-ansible-collection",
        "Create Ansible collection",
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

      CreateAnsibleCollection.currentPanel = new CreateAnsibleCollection(
        panel,
        extensionUri,
      );
    }
  }

  public dispose() {
    CreateAnsibleCollection.currentPanel = undefined;

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
      "createAnsibleCollectionPageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "createAnsibleCollectionPageStyle.css",
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
          <link rel="stylesheet" href="${codiconsUri}" id="vscode-codicon-stylesheet"/>
        </head>

        <body>
            <div class="title-div">
              <h1>Create new Ansible collection</h1>
              <p class="subtitle">Streamlining automation</p>
            </div>

            <form id="init-form">
              <section class="component-container">
                <vscode-form-group variant="vertical">
                  <vscode-label for="namespace-name">
                    <span class="normal">Namespace</span>
                    <sup>*</sup>
                  </vscode-label>
                  <vscode-textfield
                    id="namespace-name"
                    name="namespace"
                    form="init-form"
                    placeholder="Enter namespace name">
                  </vscode-textfield>
                </vscode-form-group>

                <vscode-form-group variant="vertical">
                  <vscode-label for="collection-name">
                    <span class="normal">Collection</span>
                    <sup>*</sup>
                  </vscode-label>
                  <vscode-textfield id="collection-name" form="init-form" placeholder="Enter collection name" size="512"></vscode-textfield>
                </vscode-form-group>

                <div id="full-collection-name" class="full-collection-name">
                  <p>Collection name:&nbsp</p>
                </div>

                <vscode-form-group variant="vertical">
                  <vscode-label for="path-url">
                    <span class="normal">Init path</span>
                  </vscode-label>
                  <vscode-textfield id="path-url" class="required" form="init-form" placeholder="${homeDir}/.ansible/collections/ansible_collections"
                    size="512">
                    <vscode-icon
                      slot="content-after"
                      id="folder-explorer"
                      name="folder-opened"
                      action-icon
                    ></vscode-icon>
                  </vscode-textfield>
                </vscode-form-group>

                <div id="full-collection-path" class="full-collection-name">
                  <p>Default collection path:&nbsp</p>
                </div>

                <div class="verbose-div">
                  <div class="dropdown-container">
                    <vscode-label for="verbosity-dropdown">
                      <span class="normal">Verbosity</span>
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
                  <vscode-checkbox id="overwrite-checkbox" form="init-form">Overwrite <br><i>Overwriting will remove the existing content in the specified directory and replace it with the files from the Ansible collection.</i></vscode-checkbox>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="editable-mode-checkbox" form="init-form">Install collection from source code (editable mode) <br><i>This will
                    allow immediate reflection of content changes without having to reinstalling it. <br>
                    (NOTE: Requires ansible-dev-environment installed in the environment.)</i></vscode-checkbox>
                    <a id="ade-docs-link" href="https://ansible.readthedocs.io/projects/dev-environment/">Learn more</a>
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
                    &nbsp; Open Collection
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

          case "check-ade-presence":
            await this.isADEPresent(webview);
            return;

          case "init-create":
            payload = message.payload as AnsibleCollectionFormInterface;
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

  public async isADEPresent(webView: vscode.Webview) {
    const ADEVersion = await getBinDetail("ade", "--version");
    if (ADEVersion === "failed") {
      // send the system details to the webview
      webView.postMessage({
        command: "ADEPresence",
        arguments: false,
      } as PostMessageEvent);
      return;
    }
    // send the system details to the webview
    webView.postMessage({
      command: "ADEPresence",
      arguments: true,
    } as PostMessageEvent);
    return;
  }

  public async getCollectionCreatorCommand(
    namespaceName: string,
    collectionName: string,
    initPathUrl: string,
  ): Promise<string> {
    let command = "";
    // try {
    const creatorVersion = await getCreatorVersion();

    if (semver.gte(creatorVersion, ANSIBLE_CREATOR_COLLECTION_VERSION_MIN)) {
      command = `ansible-creator init collection ${namespaceName}.${collectionName} ${initPathUrl} --no-ansi`;
    } else {
      command = `ansible-creator init ${namespaceName}.${collectionName} --init-path=${initPathUrl} --no-ansi`;
    }
    return command;
    // } catch (e: any) {
    //   await webView.postMessage({
    //     command: "execution-log",
    //     arguments: {
    //       commandOutput: e.message,
    //     },
    //   });
    // }
  }

  public async runInitCommand(
    payload: AnsibleCollectionFormInterface,
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
      isOverwritten,
      isEditableModeInstall,
    } = payload;

    const initPathUrl = initPath
      ? initPath
      : `${os.homedir()}/.ansible/collections/ansible_collections`;

    let ansibleCreatorInitCommand = await this.getCollectionCreatorCommand(
      namespaceName,
      collectionName,
      initPathUrl,
    );

    // adjust collection url for using it in ade and opening it in workspace
    // NOTE: this is done in order to synchronize the behavior of ade and extension
    // with the behavior of ansible-creator CLI tool

    const collectionUrl = initPathUrl.endsWith(
      "/collections/ansible_collections",
    )
      ? vscode.Uri.joinPath(
          vscode.Uri.parse(initPathUrl),
          namespaceName,
          collectionName,
        ).fsPath
      : initPathUrl;

    const venvPathUrl = vscode.Uri.joinPath(
      vscode.Uri.parse(collectionUrl),
      ".venv",
    ).fsPath;

    let adeCommand = `ade install --venv ${venvPathUrl} --editable ${collectionUrl} --no-ansi`;

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
    const ansibleCreatorCommandPassed = ansibleCreatorExecutionResult.status;

    if (isEditableModeInstall) {
      // ade command inherits only the verbosity options from ansible-creator command
      console.debug("[ade] command: ", adeCommand);

      const { command, env } = withInterpreter(
        extSettings.settings,
        adeCommand,
        "",
      );

      // execute ade command
      const adeExecutionResult = await runCommand(command, env);
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

    // add folder to workspace
    // vscode.workspace.updateWorkspaceFolders(0, null, { uri: folderUri });
    // vscode.workspace.updateWorkspaceFolders(
    //   vscode.workspace.workspaceFolders
    //     ? vscode.workspace.workspaceFolders.length
    //     : 0,
    //   null,
    //   { uri: folderUri },
    // );

    if (vscode.workspace.workspaceFolders?.length === 0) {
      vscode.workspace.updateWorkspaceFolders(0, null, { uri: folderUri });
    } else {
      await vscode.commands.executeCommand("vscode.openFolder", folderUri, {
        forceNewWindow: true,
      });
    }

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
    const updatedUrl = expandPath(fileUrl);

    console.log(`[ansible-creator] Updated url: ${updatedUrl}`);

    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
}
