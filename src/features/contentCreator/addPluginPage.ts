/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { PluginFormInterface, PostMessageEvent } from "./types";
import { withInterpreter } from "../utils/commandRunner";
import { SettingsManager } from "../../settings";
import { expandPath, runCommand } from "./utils";

export class AddPlugin {
  public static currentPanel: AddPlugin | undefined;
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
    if (AddPlugin.currentPanel) {
      AddPlugin.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "add-plugin",
        "Add Plugin",
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

      AddPlugin.currentPanel = new AddPlugin(panel, extensionUri);
    }
  }

  public dispose() {
    AddPlugin.currentPanel = undefined;

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
      "addPluginPageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "addPluginPageStyle.css",
    ]);

    const codiconsUri = getUri(webview, extensionUri, [
      "media",
      "codicons",
      "codicon.css",
    ]);

    const homeDir = os.homedir();

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
              <h1>Add a plugin to an existing collection</h1>
              <p class="subtitle">Extending automation with python</p>
            </div>

            <form id="init-form">
              <section class="component-container">

                <vscode-text-field id="path-url" class="required" form="init-form" placeholder="${homeDir}"
                  size="512">Collection root directory *
                  <section slot="end" class="explorer-icon">
                    <vscode-button id="folder-explorer" appearance="icon">
                      <span class="codicon codicon-folder-opened"></span>
                    </vscode-button>
                  </section>
                </vscode-text-field>

                <div class="plugin-type-div">
                  <div class="dropdown-container">
                    <label for="plugin-dropdown">Plugin type *</label>
                    <vscode-dropdown id="plugin-dropdown">
                      <vscode-option>filter</vscode-option>
                      <vscode-option>lookup</vscode-option>
                      <vscode-option>action</vscode-option>
                    </vscode-dropdown>
                  </div>
                </div>

                <div class="plugin-name-div">
                <vscode-text-field id="plugin-name" form="init-form" placeholder="Enter plugin name" size="512">Plugin name *</vscode-text-field>
                </div>

                <div id="full-collection-path" class="full-collection-path">
                  <p>Project path:&nbsp</p>
                </div>

                <div class="verbose-div">
                  <div class="dropdown-container">
                    <label for="verbosity-dropdown">Output verbosity</label>
                    <vscode-dropdown id="verbosity-dropdown">
                      <vscode-option>Off</vscode-option>
                      <vscode-option>Low</vscode-option>
                      <vscode-option>Medium</vscode-option>
                      <vscode-option>High</vscode-option>
                    </vscode-dropdown>
                  </div>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="overwrite-checkbox" form="init-form">Overwrite <br><i>Overwriting will replace an existing plugin with the same name if present in the collection.</i></vscode-checkbox>
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
                  <vscode-button id="open-folder-button" form="init-form" disabled>
                    <span class="codicon codicon-go-to-file"></span>
                    &nbsp; Open Plugin
                  </vscode-button>
                </div>

                <div id="required-fields" class="required-fields">
                  <p>Fields marked with an asterisk (*) are required</p>
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
            payload = message.payload as PluginFormInterface;
            await this.runAddCommand(payload, webview);
            return;

          case "init-open-scaffolded-folder":
            payload = message.payload;
            await this.openFolderInWorkspace(
              payload.projectUrl,
              payload.pluginName,
              payload.pluginType,
            );
            return;
        }
      },
      undefined,
      this._disposables,
    );
  }

  public async getCreatorCommand(
    pluginName: string,
    pluginType: string,
    url: string,
  ): Promise<string> {
    let command = "";

    command = `ansible-creator add plugin ${pluginType} ${pluginName} ${url} --no-ansi`;
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

  public async runAddCommand(
    payload: PluginFormInterface,
    webView: vscode.Webview,
  ) {
    const { pluginName, pluginType, collectionPath, verbosity, isOverwritten } =
      payload;

    const destinationPathUrl = collectionPath
      ? collectionPath
      : `${os.homedir()}/.ansible/collections/ansible_collections`;

    let ansibleCreatorAddCommand = await this.getCreatorCommand(
      pluginName,
      pluginType,
      destinationPathUrl,
    );

    if (isOverwritten) {
      ansibleCreatorAddCommand += " --overwrite";
    } else {
      ansibleCreatorAddCommand += " --no-overwrite";
    }

    switch (verbosity) {
      case "Off":
        ansibleCreatorAddCommand += "";
        break;
      case "Low":
        ansibleCreatorAddCommand += " -v";
        break;
      case "Medium":
        ansibleCreatorAddCommand += " -vv";
        break;
      case "High":
        ansibleCreatorAddCommand += " -vvv";
        break;
    }

    console.debug("[ansible-creator] command: ", ansibleCreatorAddCommand);

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const { command, env } = withInterpreter(
      extSettings.settings,
      ansibleCreatorAddCommand,
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
        projectUrl: destinationPathUrl,
        status: commandPassed,
      },
    } as PostMessageEvent);

    if (commandPassed === "passed") {
      const selection = await vscode.window.showInformationMessage(
        `${pluginType} plugin '${pluginName}' added at: ${destinationPathUrl}/plugins`,
        `Open plugin file ↗`,
      );
      if (selection === "Open plugin file ↗") {
        this.openFolderInWorkspace(destinationPathUrl, pluginName, pluginType);
      }
    }
  }

  public async openFolderInWorkspace(
    folderUrl: string,
    pluginName: string,
    pluginType: string,
  ) {
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

    // open the plugin file in the editor
    const pluginFileUrl = `${folderUrl}/plugins/${pluginType}/${pluginName}.py`;
    console.log(`[ansible-creator] Plugin file url: ${pluginFileUrl}`);
    const parsedUrl = vscode.Uri.parse(`vscode://file${pluginFileUrl}`);
    console.log(`[ansible-creator] Parsed galaxy file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  public openFileInEditor(fileUrl: string) {
    const updatedUrl = expandPath(fileUrl);
    console.log(`[ansible-creator] Updated url: ${updatedUrl}`);

    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
}
