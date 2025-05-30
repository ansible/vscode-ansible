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
import { DevfileImages } from "../../definitions/constants";

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
    let projectName = "";

    if (workspaceDir !== "") {
      const projectNameSplit = workspaceDir.split("/");
      projectName = projectNameSplit[projectNameSplit.length - 1];
    }

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
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource};"/>
          <title>AAA</title>
          <link rel="stylesheet" href="${styleUri}"/>
          <link rel="stylesheet" href="${codiconsUri}"id="vscode-codicon-stylesheet"/>
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

                <vscode-form-group variant="vertical">
                  <vscode-label for="path-url">
                    <span class="normal">Destination directory</span>
                    <sup>*</sup>
                  </vscode-label>
                  <vscode-textfield id="path-url" class="required" form="devfile-form" placeholder="${workspaceDir}"
                    size="512">
                    <vscode-icon
                      slot="content-after"
                      id="folder-explorer"
                      name="folder-opened"
                      action-icon
                    ></vscode-icon>
                  </vscode-textfield>
                </vscode-form-group>

                <vscode-form-group variant="vertical">
                  <vscode-label for="devfile-name">
                    <span class="normal">Ansible project name</span>
                    <sup>*</sup>
                  </vscode-label>
                  <vscode-textfield id="devfile-name" form="devfile-form" placeholder="${projectName}" size="512"></vscode-textfield>
                </vscode-form-group>

                <div id="full-devfile-path" class="full-devfile-path">
                  <p>Devfile path:&nbsp</p>
                </div>

                <div class="image-div">
                  <div class="dropdown-container">
                    <vscode-label for="image-dropdown">
                      <span class="normal">Container image</span>
                    </vscode-label>
                    <vscode-single-select id="image-dropdown" position="below">
                      <vscode-option>Upstream (ghcr.io/ansible/ansible-devspaces:latest)</vscode-option>
                    </vscode-single-select>
                  </div>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="overwrite-checkbox" form="devfile-form">Overwrite <br><i>Overwrite an existing devfile.</i></vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button id="reset-button" form="devfile-form" secondary>
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Reset All
                  </vscode-button>
                  <vscode-button id="create-button" form="devfile-form">
                    <span class="codicon codicon-run-all"></span>
                    &nbsp; Create
                  </vscode-button>
                </div>


                <vscode-divider></vscode-divider>

                <vscode-label id="vscode-logs-label" for="log-text-area">
                  <span class="normal">Logs</span>
                </vscode-label>
                <vscode-textarea id="log-text-area" cols="90" rows="10" placeholder="Output of the command execution"
                  resize="vertical" readonly></vscode-textarea>

                <div class="group-buttons">
                  <vscode-button id="clear-logs-button" form="devfile-form" secondary>
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button id="open-file-button" form="devfile-form" secondary disabled>
                    <span class="codicon codicon-go-to-file"></span>
                    &nbsp; Open Devfile
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

  public getContainerImage(dropdownImage: string) {
    const image = dropdownImage.split(" ")[0]; // Splits on the space after the name (e.g "Upstream (image)")
    return DevfileImages[image as keyof typeof DevfileImages];
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

    commandOutput += `---------------------------------------- devfile generation logs ------------------------------------------\n`;

    const destinationPathUrl = `${destinationPath}/devfile.yaml`;

    const devfileExists = fs.existsSync(expandPath(destinationPathUrl));

    const imageURL = this.getContainerImage(image);

    if (devfileExists && !isOverwritten) {
      message = `Error: Devfile already exists at ${destinationPathUrl} and was not overwritten. Use the 'Overwrite' option to overwrite the existing file.`;
      commandResult = "failed";
    } else {
      commandResult = this.createDevfile(
        destinationPathUrl,
        name,
        imageURL,
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
