/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { DevcontainerFormInterface, PostMessageEvent } from "./types";
import * as fs from "fs";
import { SettingsManager } from "../../settings";
import { expandPath } from "./utils";
import {
  DevcontainerImages,
  DevcontainerRecommendedExtensions,
} from "../../definitions/constants";

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
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource};"/>
          <title>AAA</title>
          <link rel="stylesheet" href="${styleUri}"/>
          <link rel="stylesheet" href="${codiconsUri}"id="vscode-codicon-stylesheet"/>
        </head>

        <body>
            <div class="title-description-div">
              <h1>Create a devcontainer</h1>
              <p class="subtitle">Build containerized development environments</p>
            </div>
            <div class="description-div">
              <h3>Devcontainers are json files used for building containerized development environments.<br><br>Enter your project details below to utilize a devcontainer template designed for the <a href="https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers">Dev Containers</a> extension.</h3>
            </div>

            <form id="devcontainer-form">
              <section class="component-container">

                <vscode-form-group variant="vertical">
                  <vscode-label for="path-url">
                    <span class="normal">Destination directory </span>
                    <sup>*</sup>
                  </vscode-label>
                  <vscode-textfield id="path-url" class="required" form="devcontainer-form" placeholder="${workspaceDir}"
                    size="512">
                    <vscode-icon
                      slot="content-after"
                      id="folder-explorer"
                      name="folder-opened"
                      action-icon
                    ></vscode-icon>
                  </vscode-textfield>
                </vscode-form-group>

                <div id="full-devcontainer-path" class="full-devcontainer-path">
                  <p>Devcontainer path:&nbsp</p>
                </div>

                <div class="image-div">
                  <div class="dropdown-container">
                    <vscode-label for="image-dropdown">
                      <span class="normal">Container image</span>
                    </vscode-label>
                    <vscode-single-select id="image-dropdown" position="below">
                      <vscode-option>Upstream (ghcr.io/ansible/community-ansible-dev-tools:latest)</vscode-option>
                      <vscode-option>Downstream (registry.redhat.io/ansible-automation-platform-25/ansible-dev-tools-rhel8:latest)</vscode-option>
                    </vscode-single-select>
                  </div>
                </div>

                <div class="checkbox-div">
                  <vscode-checkbox id="overwrite-checkbox" form="devcontainer-form">Overwrite <br><i>Overwrite an existing devcontainer.</i></vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button id="reset-button" form="devcontainer-form" secondary>
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Reset All
                  </vscode-button>
                  <vscode-button id="create-button" form="devcontainer-form">
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
                  <vscode-button id="clear-logs-button" form="devcontainer-form" secondary>
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear Logs
                  </vscode-button>
                  <vscode-button id="open-file-button" form="devcontainer-form" secondary disabled>
                    <span class="codicon codicon-go-to-file"></span>
                    &nbsp; Open Devcontainer
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

    commandOutput += `------------------------------------ devcontainer generation logs ----------------------------------------\n`;

    const destinationPathUrl = destinationPath;

    const devcontainerExists = fs.existsSync(
      path.join(expandPath(destinationPathUrl), ".devcontainer"),
    );

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
        message = `Created new devcontainer at ${destinationPathUrl}`;
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

    if (!fs.existsSync(expandedDestUrl)) {
      return "failed";
    }

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

  public async openDevcontainer(folderUrl: string) {
    const updatedUrl = vscode.Uri.parse(expandPath(folderUrl));
    if (vscode.workspace.workspaceFolders?.length === 0) {
      vscode.workspace.updateWorkspaceFolders(0, null, { uri: updatedUrl });
    } else {
      await vscode.commands.executeCommand("vscode.openFolder", updatedUrl, {
        forceNewWindow: true,
      });

      const fileUrl = vscode.Uri.joinPath(
        vscode.Uri.parse(folderUrl),
        ".devcontainer/devcontainer.json",
      ).fsPath;
      const parsedUrl = vscode.Uri.parse(`vscode://file${fileUrl}`);
      this.openFileInEditor(parsedUrl.toString());
    }
  }
  public openFileInEditor(folderUrl: string) {
    const updatedUrl = expandPath(folderUrl);
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
}
