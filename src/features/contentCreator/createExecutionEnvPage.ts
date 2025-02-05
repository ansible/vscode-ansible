/* eslint-disable  @typescript-eslint/no-explicit-any */

import * as vscode from "vscode";
import * as os from "os";
import * as yaml from "yaml";
import { getUri } from "../utils/getUri";
import { getNonce } from "../utils/getNonce";
import { AnsibleExecutionEnvInterface, PostMessageEvent } from "./types";
import { SettingsManager } from "../../settings";
import { expandPath } from "./utils";
import { execFile } from "child_process";

export class CreateExecutionEnv {
  public static currentPanel: CreateExecutionEnv | undefined;
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
    if (CreateExecutionEnv.currentPanel) {
      CreateExecutionEnv.currentPanel._panel.reveal(vscode.ViewColumn.One);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "create-execution-env",
        "Create Ansible Execution Environment",
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

      CreateExecutionEnv.currentPanel = new CreateExecutionEnv(
        panel,
        extensionUri,
      );
    }
  }

  public dispose() {
    CreateExecutionEnv.currentPanel = undefined;

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
      "createExecutionEnvPageApp.js",
    ]);

    const nonce = getNonce();
    const styleUri = getUri(webview, extensionUri, [
      "media",
      "contentCreator",
      "createExecutionEnvPageStyle.css",
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource};"/>
          <title>AAA</title>
          <link rel="stylesheet" href="${styleUri}"/>
          <link rel="stylesheet" href="${codiconsUri}" id="vscode-codicon-stylesheet"/>
        </head>

        <body>
            <div class="title-div">
              <h1>Create an Ansible execution environment</h1>
              <p class="subtitle">Define and build a container for automation execution</p>
            </div>

            <form id="init-form">
              <section class="component-container">

                <vscode-form-group variant="vertical">
                  <vscode-label for="path-url">
                    <span class="normal">Destination path</span>
                  </vscode-label>
                  <vscode-textfield id="path-url" class="required" form="init-form" placeholder="${workspaceDir}"
                  size="512">
                    <vscode-icon
                      slot="content-after"
                      id="folder-explorer"
                      name="folder-opened"
                      action-icon
                    ></vscode-icon>
                  </vscode-textfield>
                </vscode-form-group>

                <div id="full-destination-path" class="full-destination-path">
                  <p>Execution-environment file path:&nbsp</p>
                </div>

                <div class="verbose-div">
                  <div class="dropdown-container">
                     <vscode-label for="baseImage-dropdown">
                      <span class="normal">Base image</span>
                    </vscode-label>
                    <vscode-single-select id="baseImage-dropdown" position="below">
                      <vscode-option value="">-- Select Base Image --</vscode-option>
                      <vscode-option>quay.io/fedora/fedora-minimal:41</vscode-option>
                      <vscode-option>quay.io/centos/centos:stream10</vscode-option>
                      <vscode-option value="registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel8:latest">registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel8:latest (requires an active Red Hat registry login)</vscode-option>
                    </vscode-single-select>
                  </div>
                </div>

                <vscode-form-group variant="vertical">
                  <vscode-label for="customBaseImage-name">
                    <span class="normal">Custom base image</span>
                  </vscode-label>
                  <vscode-textfield
                    id="customBaseImage-name"
                    form="init-form"
                    placeholder="Provide a base image of your choice">
                  </vscode-textfield>
                </vscode-form-group>

                <div class="suggestedCollections-div">
                  <div class="checkbox-container">
                    <vscode-label for="suggestedCollections-checkboxes">
                      <span class="normal">Suggested collections</span>
                    </vscode-label>
                    <div id="suggestedCollections-checkboxes">
                      <vscode-checkbox value="ansible.aws">ansible.aws</vscode-checkbox>
                      <vscode-checkbox value="ansible.network">ansible.network</vscode-checkbox>
                      <vscode-checkbox value="ansible.posix">ansible.posix</vscode-checkbox>
                      <vscode-checkbox value="ansible.utils">ansible.utils</vscode-checkbox>
                      <vscode-checkbox value="kubernetes.core">kubernetes.core</vscode-checkbox>
                    </div>
                  </div>
                </div>

                <vscode-form-group variant="vertical">
                 <vscode-label for="collections-name">
                    <span class="normal">Additional Collections</span>
                 </vscode-label>
                  <vscode-textfield
                    id="collections-name"
                    form="init-form"
                    placeholder="Provide a comma delimited list of collections to include in the image">
                  </vscode-textfield>
                </vscode-form-group>

                <vscode-form-group variant="vertical">
                  <vscode-label for="systemPackages-name">
                    <span class="normal">System packages</span>
                  </vscode-label>
                  <vscode-textfield
                    id="systemPackages-name"
                    form="init-form"
                    placeholder="Provide a comma delimited list of system packages to install in the image">
                  </vscode-textfield>
                </vscode-form-group>

                <vscode-form-group variant="vertical">
                  <vscode-label for="pythonPackages-name">
                    <span class="normal">Additional python packages</span>
                  </vscode-label>
                  <vscode-textfield
                    id="pythonPackages-name"
                    form="init-form"
                    placeholder="Provide a comma delimited list. Collection dependencies are included by default.">
                  </vscode-textfield>
                </vscode-form-group>

                <vscode-form-group variant="vertical">
                  <vscode-label for="tag-name">
                    <span class="normal">Tag</span>
                    <sup>*</sup>
                  </vscode-label>
                  <vscode-textfield
                    id="tag-name"
                    form="init-form"
                    placeholder="Provide a name for the resulting image.">
                  </vscode-textfield>
                </vscode-form-group>

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
                  <vscode-checkbox id="createContext-checkbox" form="init-form">Create context <br><i>Create context for the execution-environment.</i></vscode-checkbox>
                </div>
                <div class="checkbox-div">
                  <vscode-checkbox id="buildImage-checkbox" form="init-form">Build image <br><i>Build the image of the execution-environment.</i></vscode-checkbox>
                </div>

                <div class="overwriteCheckbox-div">
                  <vscode-checkbox id="overwrite-checkbox" form="init-form">Overwrite <br><i>Overwrite an existing execution-environment.yml file.</i></vscode-checkbox>
                </div>

                <div class="group-buttons">
                  <vscode-button id="clear-button" form="init-form" secondary>
                    <span class="codicon codicon-clear-all"></span>
                    &nbsp; Clear All
                  </vscode-button>
                  <vscode-button id="create-button" form="init-form">
                    <span class="codicon codicon-run-all"></span>
                    &nbsp; Build
                  </vscode-button>
                </div>
                <vscode-divider></vscode-divider>
                <vscode-label id="vscode-logs-label" for="log-text-area">
                  <span class="normal">Logs</span>
                </vscode-label>
                <vscode-textarea id="log-text-area" cols="90" rows="10" placeholder="Output of the command execution"
                  resize="vertical" readonly></vscode-textarea>

                <div class="group-buttons">
                  <vscode-button id="clear-logs-button" form="init-form" secondary>
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
            payload = message.payload as AnsibleExecutionEnvInterface;
            // Disable the build button before running the init command
            await webview.postMessage({
              command: "disable-build-button",
              arguments: undefined,
            });

            // Run the init command
            await this.runInitCommand(payload, webview);

            await webview.postMessage({
              command: "enable-open-file-button",
              arguments: undefined,
            });

            // Re-enable the build button after the command is finished
            await webview.postMessage({
              command: "enable-build-button",
              arguments: undefined,
            });
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
    payload: AnsibleExecutionEnvInterface,
    webView: vscode.Webview,
  ) {
    // Disable the build button
    await webView.postMessage({
      command: "disable-build-button",
    });
    const {
      destinationPath,
      verbosity,
      isOverwritten,
      isCreateContextEnabled,
      isBuildImageEnabled,
      baseImage,
      customBaseImage,
      collections,
      systemPackages,
      pythonPackages,
      tag,
    } = payload;

    let commandResult: string;
    let message: string;
    let commandOutput = "";

    commandOutput += `---------------------------------------- Execution environment generation logs ---------------------------------------\n`;
    const destinationPathUrl = destinationPath || this.getWorkspaceFolder();
    const filePath = `${destinationPathUrl}/execution-environment.yml`;
    const fs = require("fs");
    const fileExists = fs.existsSync(expandPath(filePath));
    let executionFileCreated = false;

    if (fileExists && !isOverwritten) {
      message = `Error: Execution environment file already exists at ${destinationPathUrl} and was not overwritten. Use the 'Overwrite' option to overwrite the existing file.`;
      commandOutput += `${message}\n`;
      commandResult = "failed";
    } else {
      const jsonData: any = {
        version: 3,
        images: {
          base_image: {
            name: baseImage || customBaseImage,
          },
        },
        dependencies: {
          ansible_core: { package_pip: "ansible-core" },
          ansible_runner: { package_pip: "ansible-runner" },
        },
        options: {
          tags: [tag],
        },
      };
      // Handle collections input
      const collectionsArray = collections
        .split(",")
        .map((col) => col.trim())
        .filter((col) => col !== "");

      if (collectionsArray.length > 0) {
        jsonData.dependencies.galaxy = {
          collections: collectionsArray.map((col) => ({ name: col })),
        };
      }
      const systemPackagesArray = systemPackages
        .split(",")
        .map((pkg) => pkg.trim())
        .filter((pkg) => pkg !== "");
      if (systemPackagesArray.length > 0) {
        jsonData.dependencies.system = systemPackagesArray;
      }

      const pythonPackagesArray = pythonPackages
        .split(",")
        .map((pkg) => pkg.trim())
        .filter((pkg) => pkg !== "");
      if (pythonPackagesArray.length > 0) {
        jsonData.dependencies.python = pythonPackagesArray;
      }

      if (baseImage?.toLowerCase().includes("fedora")) {
        jsonData.additional_build_steps = {
          prepend_base: ["RUN $PKGMGR -y -q install python3-devel"],
        };
        jsonData.options.package_manager_path = "/usr/bin/dnf5";
      } else if (
        baseImage?.toLowerCase().includes("rhel") ||
        baseImage?.toLowerCase().includes("redhat")
      ) {
        jsonData.options.package_manager_path = "/usr/bin/microdnf";
      }
      const isSuccess = this.generateYAMLFromJSON(jsonData, destinationPathUrl);
      if (isSuccess) {
        commandOutput += `Execution environment file created at ${destinationPathUrl}\n`; // Log only once
        commandResult = "passed";
        executionFileCreated = true;
      } else {
        commandOutput += `ERROR: Could not create execution environment file. Please check that your destination path exists and write permissions are configured for it.\n`;
        commandResult = "failed";
      }
    }

    if (isCreateContextEnabled) {
      const createContextCommand = `ansible-builder create --file ${filePath} --context ${destinationPathUrl}/context`;
      const createContextResult =
        await this.runAnsibleBuilderCommand(createContextCommand);
      if (createContextResult.success) {
        commandOutput += `${createContextResult.output}\n`;
        commandResult = "passed";
      } else {
        commandOutput += `${createContextResult.output}\n`;
        commandResult = "failed";
      }
    }

    if (isBuildImageEnabled) {
      let buildImageCommand = `ansible-builder build --file ${filePath} --context ${destinationPathUrl}/context`;

      switch (verbosity) {
        case "Off":
          break;
        case "Low":
          buildImageCommand += " -v";
          break;
        case "Medium":
          buildImageCommand += " -vv";
          break;
        case "High":
          buildImageCommand += " -vvv";
          break;
        default:
          break;
      }
      const buildImageResult =
        await this.runAnsibleBuilderCommand(buildImageCommand);
      if (buildImageResult.success) {
        commandOutput += `${buildImageResult.output}\n`;
        commandResult = "passed";
      } else {
        commandOutput += `${buildImageResult.output}\n`;
        commandResult = "failed";
      }
    }

    console.debug(commandOutput);

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

    if (executionFileCreated) {
      await webView.postMessage({ command: "enable-open-file-button" });
    } else {
      await webView.postMessage({ command: "disable-open-file-button" });
    }
    // Re-enable the build button
    await webView.postMessage({
      command: "enable-build-button",
    });
  }

  public generateYAMLFromJSON(jsonData: any, destinationPath: string): boolean {
    const fs = require("fs");
    try {
      const yamlData = yaml.stringify(jsonData);
      const filePath = `${destinationPath}/execution-environment.yml`;
      fs.writeFileSync(filePath, yamlData, "utf8");
      return true;
    } catch (error) {
      console.error("Execution environment file generation Error:", error);
      return false;
    }
  }

  private async runAnsibleBuilderCommand(
    command: string,
  ): Promise<{ success: boolean; output: string }> {
    const [program, ...args] = command.split(" ");
    return new Promise((resolve) => {
      execFile(program, args, (error: any, stdout: string, stderr: string) => {
        let outputMessage = stdout || stderr;
        const outdatedBuilderError =
          "ansible_builder.exceptions.DefinitionError: Additional properties are not allowed ('tags' was unexpected)";
        if (stderr.includes(outdatedBuilderError)) {
          outputMessage +=
            "\nWARNING: You are using an outdated version of ansible-builder. Please upgrade to version 3.1.0 or later.";
        }
        resolve({
          success: !error,
          output: outputMessage,
        });
      });
    });
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
    const eeFilePath = vscode.Uri.joinPath(
      fileUri,
      "execution-environment.yml",
    );
    this.openFileInEditor(eeFilePath.fsPath);
  }

  public openFileInEditor(fileUrl: string) {
    const updatedUrl = expandPath(fileUrl);
    console.log(`[ansible-creator] Updated url: ${updatedUrl}`);

    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
}
