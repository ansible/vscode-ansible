/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { DevfileFormInterface, PostMessageEvent } from "./types";
import * as fs from "fs";
import { SettingsManager } from "../../settings";
import { expandPath } from "./utils";
import { randomUUID } from "crypto";

export class CreateDevfile {
  public static currentPanel: CreateDevfile | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  public static readonly viewType = "CreateProject";

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getWebviewContent(
      this._panel.webview,
      extensionUri,
    );
    this._setWebviewMessageListener(this._panel.webview, extensionUri);
    this._panel.onDidDispose(
      () => {
        this.dispose();
      },
      null,
      this._disposables,
    );
  }

  public dispose() {
    CreateDevfile.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  public static render(extensionUri: vscode.Uri) {
    if (CreateDevfile.currentPanel) {
      CreateDevfile.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "create-devfile",
        "Create Devfile",
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

      CreateDevfile.currentPanel = new CreateDevfile(panel, extensionUri);
    }
  }

  private _getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
  ) {
    const codiconsUri = getUri(webview, extensionUri, [
      "media",
      "codicons",
      "codicon.css",
    ]);

    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "createDevfilePageStyle.css",
    ]);

    const nonce = getNonce();

    const workspaceDir = this.getWorkspaceFolder();

    const webviewUri = getUri(webview, extensionUri, [
      "out",
      "client",
      "webview",
      "apps",
      "contentCreator",
      "createDevfilePageApp.js",
    ]);

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
            <div class="title-description-div">
              <h1>Create a devfile</h1>
              <p class="subtitle">Leverage Red Hat Openshift Dev Spaces</p>
            </div>
            <div class="description-div">
              <h3>Devfiles are yaml files used for development environment customization.<br><br>Enter your project details below to utilize a devfile template designed for Red Hat OpenShift Dev Spaces.</h3>
            </div>

            <form id="devfile-form">
              <section class="component-container">

                <vscode-text-field id="path-url" class="required" form="devfile-form" placeholder="${workspaceDir}"
                  size="512">Destination directory *
                  <section slot="end" class="explorer-icon">
                    <vscode-button id="folder-explorer" appearance="icon">
                      <span class="codicon codicon-folder-opened"></span>
                    </vscode-button>
                  </section>
                </vscode-text-field>

                <div class="devfile-name-div">
                <vscode-text-field id="devfile-name" form="devfile-form" placeholder="Enter Ansible project name" size="512">Ansible project name *</vscode-text-field>
                </div>

                <div id="full-devfile-path" class="full-devfile-path">
                  <p>Devfile path:&nbsp</p>
                </div>

                <div class="image-div">
                  <div class="dropdown-container">
                    <label for="image-dropdown">Container image</label>
                    <vscode-dropdown id="image-dropdown">
                      <vscode-option>ghcr.io/ansible/ansible-workspace-env-reference:latest</vscode-option>
                    </vscode-dropdown>
                  </div>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="overwrite-checkbox" form="devfile-form">Overwrite <br><i>Overwrite an existing devfile.</i></vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button id="reset-button" form="devfile-form" appearance="secondary">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Reset All
                  </vscode-button>
                  <vscode-button id="create-button" form="devfile-form">
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
                  <vscode-button id="clear-logs-button" form="devfile-form" appearance="secondary">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button id="open-file-button" form="devfile-form" disabled>
                    <span class="codicon codicon-go-to-file"></span>
                    &nbsp; Open Devfile
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

  private _setWebviewMessageListener(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
  ) {
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
          case "devfile-create":
            payload = message.payload as DevfileFormInterface;
            await this.runDevfileCreateProcess(payload, webview, extensionUri);
            return;

          case "open-devfile":
            payload = message.payload;
            this.openDevfile(payload.projectUrl);
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
      canSelectFolders: selectOption === "folder",
      defaultUri: vscode.Uri.parse(os.homedir()),
    };

    let selectedUri: string | undefined;
    await vscode.window.showOpenDialog(options).then((fileUri) => {
      if (fileUri?.[0]) {
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

  public async runDevfileCreateProcess(
    payload: DevfileFormInterface,
    webView: vscode.Webview,
    extensionUri: vscode.Uri,
  ) {
    const { destinationPath, name, image, isOverwritten } = payload;
    let commandResult: string;
    let message: string;
    let commandOutput = "";

    commandOutput += `------------------------------------ devfile generation logs ------------------------------------\n`;

    const destinationPathUrl = `${destinationPath}/devfile.yaml`;

    const devfileExists = fs.existsSync(expandPath(destinationPathUrl));

    if (devfileExists && !isOverwritten) {
      message = `Error: Devfile already exists at ${destinationPathUrl} and was not overwritten. Use the 'Overwrite' option to overwrite the existing file.`;
      commandResult = "failed";
    } else {
      commandResult = this.createDevfile(
        destinationPathUrl,
        name,
        image,
        extensionUri,
      );
      if (commandResult === "failed") {
        message =
          "ERROR: Could not create devfile. Please check that your destination path exists and write permissions are configured for it.";
      } else {
        message = `Creating new devfile at ${destinationPathUrl}`;
      }
    }
    commandOutput += message;
    console.debug(message);

    const extSettings = new SettingsManager();
    await extSettings.initialize();

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
        `Devfile created at: ${destinationPathUrl}`,
        `Open devfile ↗`,
      );
      if (selection === "Open devfile ↗") {
        this.openDevfile(destinationPathUrl);
      }
    }
  }

  public createDevfile(
    destinationUrl: string,
    devfileName: string,
    devfileImage: string,
    extensionUri: vscode.Uri,
  ) {
    let devfile: string;
    const relativeTemplatePath =
      "resources/contentCreator/createDevfile/devfile-template.txt";

    const expandedDestUrl = expandPath(destinationUrl);

    const uuid = randomUUID().slice(0, 8);
    const fullDevfileName = `${devfileName}-${uuid}`;

    const absoluteTemplatePath = vscode.Uri.joinPath(
      extensionUri,
      relativeTemplatePath,
    )
      .toString()
      .replace("file://", "");

    try {
      devfile = fs.readFileSync(absoluteTemplatePath, "utf8");
      devfile = devfile.replace("{{ dev_file_name }}", fullDevfileName);
      devfile = devfile.replace("{{ dev_file_image }}", devfileImage);
      fs.writeFileSync(expandedDestUrl, devfile);
      return "passed";
    } catch (err) {
      console.error("Devfile could not be created. Error: ", err);
      return "failed";
    }
  }

  public openDevfile(fileUrl: string) {
    const updatedUrl = expandPath(fileUrl);
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
}
