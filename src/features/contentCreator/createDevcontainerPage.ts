/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { DevcontainerFormInterface, PostMessageEvent } from "./types";
import * as fs from "fs";
import { SettingsManager } from "../../settings";
import { expandPath } from "./utils";
import { DevcontainerImages } from "../../definitions/constants";
import { DevcontainerRecommendedExtensions } from "../../definitions/constants";

export class CreateDevcontainer {
  public static currentPanel: CreateDevcontainer | undefined;
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
    CreateDevcontainer.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  public static render(extensionUri: vscode.Uri) {
    if (CreateDevcontainer.currentPanel) {
      CreateDevcontainer.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "create-devcontainer",
        "Create Devcontainer",
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

      CreateDevcontainer.currentPanel = new CreateDevcontainer(
        panel,
        extensionUri,
      );
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
      "createDevcontainerPageStyle.css",
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
      "createDevcontainerPageApp.js",
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
              <h1>Create a devcontainer</h1>
              <p class="subtitle">Leverage Red Hat Openshift Dev Spaces</p>
            </div>
            <div class="description-div">
              <h3>Devcontainers are yaml files used for development environment customization.<br><br>Enter your project details below to utilize a devcontainer template designed for Red Hat OpenShift Dev Spaces.</h3>
            </div>

            <form id="devcontainer-form">
              <section class="component-container">

                <vscode-text-field id="path-url" class="required" form="devcontainer-form" placeholder="${workspaceDir}"
                  size="512">Destination directory *
                  <section slot="end" class="explorer-icon">
                    <vscode-button id="folder-explorer" appearance="icon">
                      <span class="codicon codicon-folder-opened"></span>
                    </vscode-button>
                  </section>
                </vscode-text-field>

                <div class="devcontainer-name-div">
                <vscode-text-field id="devcontainer-name" form="devcontainer-form" placeholder="${projectName}" size="512">Ansible project name *</vscode-text-field>
                </div>

                <div id="full-devcontainer-path" class="full-devcontainer-path">
                  <p>Devcontainer path:&nbsp</p>
                </div>

                <div class="image-div">
                  <div class="dropdown-container">
                    <label for="image-dropdown">Container image</label>
                    <vscode-dropdown id="image-dropdown">
                      <vscode-option>Auto (ghcr.io/ansible/community-ansible-dev-tools:latest)</vscode-option>
                      <vscode-option>Upstream (ghcr.io/ansible/community-ansible-dev-tools:latest)</vscode-option>
                      <vscode-option>Downstream (registry.redhat.io/ansible-automation-platform-25/ansible-dev-tools-rhel8:latest)</vscode-option>
                    </vscode-dropdown>
                  </div>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="overwrite-checkbox" form="devcontainer-form">Overwrite <br><i>Overwrite an existing devcontainer.</i></vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button id="reset-button" form="devcontainer-form" appearance="secondary">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Reset All
                  </vscode-button>
                  <vscode-button id="create-button" form="devcontainer-form">
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
                  <vscode-button id="clear-logs-button" form="devcontainer-form" appearance="secondary">
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button id="open-file-button" form="devcontainer-form" disabled>
                    <span class="codicon codicon-go-to-file"></span>
                    &nbsp; Open Devcontainer
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
          case "devcontainer-create":
            payload = message.payload as DevcontainerFormInterface;
            await this.runDevcontainerCreateProcess(
              payload,
              webview,
              extensionUri,
            );
            return;

          case "open-devcontainer":
            payload = message.payload;
            this.openDevcontainer(payload.projectUrl);
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
    return DevcontainerImages[image as keyof typeof DevcontainerImages];
  }

  public getRecommendedExtensions() {
    return DevcontainerRecommendedExtensions.RECOMMENDED_EXTENSIONS;
  }

  public async runDevcontainerCreateProcess(
    payload: DevcontainerFormInterface,
    webView: vscode.Webview,
    extensionUri: vscode.Uri,
  ) {
    const { destinationPath, image, isOverwritten } = payload;
    let commandResult: string;
    let message: string;
    let commandOutput = "";

    commandOutput += `------------------------------------ devcontainer generation logs ------------------------------------\n`;

    const destinationPathUrl = `${destinationPath}`;

    const devcontainerExists = fs.existsSync(expandPath(destinationPathUrl));

    const imageURL = this.getContainerImage(image);

    const recommendedExtensions = this.getRecommendedExtensions();

    if (devcontainerExists && !isOverwritten) {
      message = `Error: Devcontainer already exists at ${destinationPathUrl} and was not overwritten. Use the 'Overwrite' option to overwrite the existing file.`;
      commandResult = "failed";
    } else {
      commandResult = this.createDevcontainer(
        destinationPathUrl,
        recommendedExtensions,
        imageURL,
        extensionUri,
      );
      if (commandResult === "failed") {
        message =
          "ERROR: Could not create devcontainer. Please check that your destination path exists and write permissions are configured for it.";
      } else {
        message = `Creating new devcontainer at ${destinationPathUrl}`;
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

    // if (commandResult === "passed") {
    //   const selection = await vscode.window.showInformationMessage(
    //     `Devcontainer created at: ${destinationPathUrl}`,
    //     `Open devcontainer ↗`,
    //   );
    //   if (selection === "Open devcontainer ↗") {
    //     this.openDevcontainer(destinationPathUrl);
    //   }
    // }
  }

  public createDevcontainer(
    destinationUrl: string,
    recommendedExtensions: string[],
    devcontainerImage: string,
    extensionUri: vscode.Uri,
  ) {
    const relativeTemplatePath =
      "resources/contentCreator/createDevcontainer/.devcontainer";

    const expandedDestUrl = expandPath(destinationUrl);
    const absoluteTemplatePath = vscode.Uri.joinPath(
      extensionUri,
      relativeTemplatePath,
    )
      .toString()
      .replace("file://", "");
    console.log({ absoluteTemplatePath });

    const scaffold = (sourcePath: string, targetPath: string) => {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      const items = fs.readdirSync(sourcePath, { withFileTypes: true });

      items.forEach((item) => {
        const sourceItemPath = `${sourcePath}/${item.name}`;
        const targetItemPath = `${targetPath}/${item.name}`;
        const TargetItemPath = targetItemPath.replace(
          "devcontainer-template.txt",
          "devcontainer.json",
        );

        if (item.isDirectory()) {
          scaffold(sourceItemPath, targetItemPath);
        } else if (item.isFile()) {
          let devcontainer = fs.readFileSync(sourceItemPath, {
            encoding: "utf8",
            flag: "r",
          });

          devcontainer = devcontainer.replace(
            "{{ dev_container_image }}",
            devcontainerImage,
          );
          devcontainer = devcontainer.replace(
            "{{ recommended_extensions | json }}",
            JSON.stringify(recommendedExtensions),
          );

          fs.writeFileSync(TargetItemPath, devcontainer);
        }
      });
    };

    try {
      scaffold(absoluteTemplatePath, `${expandedDestUrl}/.devcontainer`);
      return "passed";
    } catch (err) {
      console.error("Devcontainer could not be created. Error: ", err);
      return "failed";
    }
  }

  public openDevcontainer(fileUrl: string) {
    const updatedUrl = expandPath(fileUrl);
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
}
