/* eslint-disable @typescript-eslint/no-explicit-any */

import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Uri, workspace, window } from "vscode";
import { v4 as uuidv4 } from "uuid";
import { TextEncoder } from "util";
import { lightSpeedManager } from "../../../../extension";
import { isError, UNKNOWN_ERROR } from "../../utils/errors";
import { getOneClickTrialProvider } from "../../utils/oneClickTrial";
import {
  FeedbackRequestParams,
  GenerationListEntry,
} from "../../../../interfaces/lightspeed";
import {
  AnsibleCollectionFormInterface,
  AnsibleProjectFormInterface,
  RoleFormInterface,
  PluginFormInterface,
  PatternFormInterface,
  DevcontainerFormInterface,
} from "../../../contentCreator/types";

import {
  explainPlaybook,
  explainRole,
  generateRole,
  generatePlaybook,
  thumbsUpDown,
  contentMatch,
  updatePromptHistory,
} from "./lightspeedUtils";
import {
  openNewPlaybookEditor,
  getCollectionsFromWorkspace,
  getRoleBaseDir,
  fileExists,
  FileOperations,
} from "./fileOperations";
import { AnsibleCreatorOperations } from "./ansibleCreatorUtils";
import { ThumbsUpDownAction } from "../../../../definitions/lightspeed";
import { expandPath } from "../../../contentCreator/utils";
import {
  DevcontainerImages,
  DevcontainerRecommendedExtensions,
} from "../../../../definitions/constants";

interface WebviewMessage {
  type: string;
  data?: any;
  payload?: any;
}

type MessageHandler = {
  (
    message: WebviewMessage,
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ): Promise<void> | void;
};

export class WebviewMessageHandlers {
  private fileOps = new FileOperations();
  private creatorOps = new AnsibleCreatorOperations();
  private handlers: Record<string, MessageHandler>;

  constructor() {
    this.handlers = {
      // System handlers
      getHomeDirectory: this.handleGetHomeDirectory.bind(this),
      "ui-mounted": this.handleUiMounted.bind(this),

      // File/Folder handlers
      openFolderExplorer: this.handleOpenFolderExplorer.bind(this),
      openFileExplorer: this.handleOpenFileExplorer.bind(this),
      openEditor: this.handleOpenEditor.bind(this),

      // Creator handlers
      "init-create": this.handleInitCreate.bind(this),
      "init-create-plugin": this.handleInitCreatePlugin.bind(this),
      "init-create-role": this.handleInitCreateRole.bind(this),
      "init-add-pattern": this.handleInitAddPattern.bind(this),
      "init-create-devcontainer": this.handleInitCreateDevcontainer.bind(this),
      "check-ade-presence": this.handleCheckAdePresence.bind(this),

      // File operation handlers
      "init-copy-logs": this.handleInitCopyLogs.bind(this),
      "init-open-log-file": this.handleInitOpenLogFile.bind(this),
      "init-open-scaffolded-folder":
        this.handleInitOpenScaffoldedFolder.bind(this),
      "init-open-scaffolded-folder-pattern":
        this.handleInitOpenScaffoldedFolderPattern.bind(this),
      "init-open-scaffolded-folder-plugin":
        this.handleInitOpenScaffoldedFolderPlugin.bind(this),
      "init-open-role-folder": this.handleInitOpenRoleFolder.bind(this),
      "init-open-devcontainer-folder":
        this.handleInitOpenDevcontainerFolder.bind(this),

      // LightSpeed handlers
      explainPlaybook: this.handleExplainPlaybook.bind(this),
      explainRole: this.handleExplainRole.bind(this),
      generateRole: this.handleGenerateRole.bind(this),
      generatePlaybook: this.handleGeneratePlaybook.bind(this),
      explanationThumbsUp: this.handleExplanationThumbsUp.bind(this),
      explanationThumbsDown: this.handleExplanationThumbsDown.bind(this),

      // Data handlers
      setPlaybookData: this.handleSetPlaybookData.bind(this),
      setRoleData: this.handleSetRoleData.bind(this),
      getRecentPrompts: this.handleGetRecentPrompts.bind(this),
      getCollectionList: this.handleGetCollectionList.bind(this),
      writeRoleInWorkspace: this.handleWriteRoleInWorkspace.bind(this),
      feedback: this.handleFeedback.bind(this),
    };
  }

  public async handleMessage(
    message: WebviewMessage,
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ) {
    const handler = this.handlers[message.type];
    if (handler) {
      await handler(message, webview, context);
    } else {
      console.warn(`Unknown message type: ${message.type}`);
    }
  }

  private sendErrorMessage(webview: vscode.Webview, message: string) {
    webview.postMessage({
      type: "errorMessage",
      data: message,
    });
  }

  // System Handlers
  private handleGetHomeDirectory(
    message: WebviewMessage,
    webview: vscode.Webview,
  ) {
    // Get workspace directory instead of home directory
    let workspaceDir = os.homedir(); // fallback
    if (vscode.workspace.workspaceFolders) {
      workspaceDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    webview.postMessage({
      type: "homeDirectory",
      data: workspaceDir,
    });
    return message.data;
  }

  private handleUiMounted(message: any, webview: vscode.Webview) {
    // Get workspace directory instead of home directory
    let workspaceDir = os.homedir(); // fallback
    if (vscode.workspace.workspaceFolders) {
      workspaceDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    webview.postMessage({
      command: "homedirAndTempdir",
      homedir: workspaceDir, // Send workspace directory
      tempdir: os.tmpdir(),
    });
  }

  // File/Folder Handlers

  private async handleOpenFolderExplorer(
    message: any,
    webview: vscode.Webview,
  ) {
    const defaultPath = message.payload?.defaultPath;
    const uri = await window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      openLabel: "Select folder",
      defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined,
    });
    if (uri && uri[0]) {
      webview.postMessage({
        type: "folderSelected",
        data: uri[0].fsPath,
      });
    }
  }

  private async handleOpenFileExplorer(message: any, webview: vscode.Webview) {
    const defaultPath = message.payload?.defaultPath;
    const uri = await window.showOpenDialog({
      canSelectFolders: false,
      canSelectFiles: true,
      openLabel: "Select file",
      defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined,
    });
    if (uri && uri[0]) {
      webview.postMessage({
        type: "fileSelected",
        data: uri[0].fsPath,
      });
    }
  }

  private async handleOpenEditor(message: any) {
    const content: string = message.data.content;
    await openNewPlaybookEditor(content);
  }

  // Creator Handlers
  private async handleInitCreate(message: any, webview: vscode.Webview) {
    const payload = message.payload as
      | AnsibleCollectionFormInterface
      | AnsibleProjectFormInterface;
    await this.creatorOps.runInitCommand(payload, webview);
  }

  private async handleInitCreatePlugin(message: any, webview: vscode.Webview) {
    const payload = message.payload as PluginFormInterface;
    await this.creatorOps.runPluginAddCommand(payload, webview);
  }

  private async handleInitCreateRole(message: any, webview: vscode.Webview) {
    const payload = message.payload as RoleFormInterface;
    await this.creatorOps.runRoleAddCommand(payload, webview);
  }
  private async handleInitAddPattern(message: any, webview: vscode.Webview) {
    const payload = message.payload as PatternFormInterface;
    await this.creatorOps.runPatternAddCommand(payload, webview);
  }

  private async handleInitCreateDevcontainer(
    message: any,
    webview: vscode.Webview,
  ) {
    const payload = message.payload as DevcontainerFormInterface;
    await this.runDevcontainerCreateProcess(payload, webview);
  }

  private async handleCheckAdePresence(message: any, webview: vscode.Webview) {
    await this.creatorOps.isADEPresent(webview);
  }

  // File Operation Handlers
  private async handleInitCopyLogs(message: any) {
    const payload = message.payload;
    vscode.env.clipboard.writeText(payload.initExecutionLogs);
    await vscode.window.showInformationMessage("Logs copied to clipboard");
  }

  private async handleInitOpenLogFile(message: any) {
    const payload = message.payload;
    await this.fileOps.openLogFile(payload.logFileUrl);
  }

  private async handleInitOpenScaffoldedFolder(message: any) {
    const payload = message.payload;
    const folderUrl = payload.collectionUrl || payload.projectUrl;
    await this.fileOps.openFolderInWorkspaceProjects(folderUrl);
  }

  private async handleInitOpenScaffoldedFolderPlugin(message: any) {
    const payload = message.payload;
    await this.fileOps.openFolderInWorkspacePlugin(
      payload.projectUrl,
      payload.pluginName,
      payload.pluginType,
    );
  }
  private async handleInitOpenScaffoldedFolderPattern(message: any) {
    const payload = message.payload;
    await this.fileOps.openFolderInWorkspacePattern(
      payload.projectUrl,
      payload.patternName,
    );
  }

  private async handleInitOpenRoleFolder(message: any) {
    const payload = message.payload;
    await this.fileOps.openFolderInWorkspaceRole(
      payload.projectUrl,
      payload.roleName,
    );
  }

  private async handleInitOpenDevcontainerFolder(message: any) {
    const payload = message.payload;
    await this.fileOps.openFolderInWorkspaceDevcontainer(payload.projectUrl);
  }

  // LightSpeed Handlers
  private async handleExplainPlaybook(message: any, webview: vscode.Webview) {
    const { data } = message;
    const lightSpeedStatusbarText =
      await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText();

    lightSpeedManager.statusBarProvider.statusBar.text = `$(loading~spin) ${lightSpeedStatusbarText}`;
    const response = await explainPlaybook(
      lightSpeedManager.apiInstance,
      data.content,
      data.explanationId,
    );

    if (isError(response)) {
      const oneClickTrialProvider = getOneClickTrialProvider();
      if (!(await oneClickTrialProvider.showPopup(response))) {
        const errorMessage: string = `${response.message ?? UNKNOWN_ERROR} ${response.detail ?? ""}`;
        window.showErrorMessage(errorMessage);
      }
      this.sendErrorMessage(
        webview,
        `Failed to get an answer from the server: ${response.message}`,
      );
      return;
    }

    webview.postMessage({
      type: message.type,
      data: response,
    });

    lightSpeedManager.statusBarProvider.statusBar.text =
      lightSpeedStatusbarText;
  }

  private async handleExplainRole(message: any, webview: vscode.Webview) {
    const { data } = message;
    const lightSpeedStatusbarText =
      await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText();

    lightSpeedManager.statusBarProvider.statusBar.text = `$(loading~spin) ${lightSpeedStatusbarText}`;
    const response = await explainRole(
      lightSpeedManager.apiInstance,
      data.files,
      data.roleName,
      data.explanationId,
    );

    if (isError(response)) {
      const oneClickTrialProvider = getOneClickTrialProvider();
      if (!(await oneClickTrialProvider.showPopup(response))) {
        const errorMessage: string = `${response.message ?? UNKNOWN_ERROR} ${response.detail ?? ""}`;
        window.showErrorMessage(errorMessage);
      }
      this.sendErrorMessage(
        webview,
        `Failed to get an answer from the server: ${response.message}`,
      );
      return;
    }

    webview.postMessage({
      type: message.type,
      data: response,
    });

    lightSpeedManager.statusBarProvider.statusBar.text =
      lightSpeedStatusbarText;
  }

  private async handleGenerateRole(
    message: any,
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ) {
    const { data } = message;
    const generationId = uuidv4();
    const response = await generateRole(
      lightSpeedManager.apiInstance,
      data.name,
      data.text,
      data.outline,
      generationId,
    );

    if (isError(response)) {
      this.sendErrorMessage(
        webview,
        `Failed to get an answer from the server: ${response.message}`,
      );
      return;
    }

    webview.postMessage({
      type: message.type,
      data: response,
    });

    const task_files = response.files.filter(
      (file) => file.file_type === "task",
    );
    console.log(task_files);
    if (task_files.length > 0) {
      contentMatch(generationId, task_files[0].content);
    }
    updatePromptHistory(context, data.text);
  }

  private async handleGeneratePlaybook(
    message: any,
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ) {
    const { data } = message;
    const generationId = uuidv4();
    const response = await generatePlaybook(
      lightSpeedManager.apiInstance,
      data.text,
      data.outline,
      generationId,
    );

    if (isError(response)) {
      this.sendErrorMessage(
        webview,
        `Failed to get an answer from the server: ${response.message}`,
      );
      return;
    }

    webview.postMessage({
      type: message.type,
      data: response,
    });
    contentMatch(generationId, response.playbook);
    updatePromptHistory(context, data.text);
  }

  private async handleExplanationThumbsUp(message: any) {
    await thumbsUpDown(ThumbsUpDownAction.UP, message.data.explanationId);
  }

  private async handleExplanationThumbsDown(message: any) {
    await thumbsUpDown(ThumbsUpDownAction.DOWN, message.data.explanationId);
  }

  // Data Handlers
  private handleSetPlaybookData(message: any, webview: vscode.Webview) {
    webview.postMessage({
      type: message.type,
      data: message.data,
    });
  }

  private handleSetRoleData(message: any, webview: vscode.Webview) {
    webview.postMessage({
      type: message.type,
      data: message.data,
    });
  }

  private handleGetRecentPrompts(
    message: any,
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ) {
    const recent_prompts: string[] = context.workspaceState.get(
      "ansible.lightspeed.recent_prompts",
      [],
    );
    webview.postMessage({
      type: message.type,
      data: recent_prompts,
    });
  }

  private async handleGetCollectionList(message: any, webview: vscode.Webview) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    webview.postMessage({
      type: message.type,
      data: await getCollectionsFromWorkspace(),
    });
  }

  private handleFeedback(message: any) {
    const request = message.data.request as FeedbackRequestParams;
    lightSpeedManager.apiInstance.feedbackRequest(
      request,
      process.env.TEST_LIGHTSPEED_ACCESS_TOKEN !== undefined,
    );
  }

  private async handleWriteRoleInWorkspace(
    message: any,
    webview: vscode.Webview,
  ) {
    const { data } = message;
    const roleName: string = data.roleName;
    const collectionName: string = data.collectionName;
    const files = data.files.map((i: string[]) => ({
      path: i[0],
      content: i[1],
      file_type: i[2],
    })) as GenerationListEntry[];

    const roleBaseDirUri = await getRoleBaseDir(collectionName, roleName);
    const savedFilesEntries = [];

    for (const f of files) {
      const dirUri = Uri.joinPath(roleBaseDirUri, `/${f.file_type}s`);
      const fileUri = Uri.joinPath(roleBaseDirUri, `/${f.file_type}s/main.yml`);

      await workspace.fs.createDirectory(dirUri);
      if (await fileExists(fileUri)) {
        this.sendErrorMessage(webview, `File already exists (${fileUri})!`);
        webview.postMessage({
          type: message.type,
          data: [],
        });
        return;
      }

      await workspace.fs.writeFile(
        fileUri,
        new TextEncoder().encode(f.content),
      );

      const linkUri = {
        scheme: "file",
        path: fileUri.fsPath,
        authority: "",
      };

      savedFilesEntries.push({
        longPath: `${collectionName.replace(".", "/")}/roles/${roleName}/${f.file_type}s/main.yml`,
        command: `command:vscode.open?${encodeURIComponent(JSON.stringify(linkUri))}`,
      });
    }

    webview.postMessage({
      type: message.type,
      data: savedFilesEntries,
    });
  }

  // Devcontainer Handlers
  private async runDevcontainerCreateProcess(
    payload: DevcontainerFormInterface,
    webview: vscode.Webview,
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
      try {
        commandResult = await this.createDevcontainer(
          destinationPathUrl,
          recommendedExtensions,
          imageURL,
        );
        if (commandResult === "failed") {
          message =
            "ERROR: Could not create devcontainer. Please check that your destination path exists and write permissions are configured for it.";
        } else {
          message = `Created new devcontainer at ${destinationPathUrl}`;
        }
      } catch (error) {
        commandResult = "failed";
        message = `ERROR: Could not create devcontainer: ${error}`;
      }
    }

    commandOutput += message;
    console.debug(message);

    webview.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        projectUrl: destinationPathUrl,
        status: commandResult,
      },
    });
  }

  private getContainerImage(dropdownImage: string): string {
    if (dropdownImage.includes("Upstream")) {
      return DevcontainerImages.Upstream;
    } else if (dropdownImage.includes("Downstream")) {
      return DevcontainerImages.Downstream;
    }
    return DevcontainerImages.Upstream;
  }

  private getRecommendedExtensions(): string[] {
    return DevcontainerRecommendedExtensions.RECOMMENDED_EXTENSIONS;
  }

  private async createDevcontainer(
    destinationUrl: string,
    recommendedExtensions: string[],
    devcontainerImage: string,
  ): Promise<string> {
    try {
      const expandedPath = expandPath(destinationUrl);
      const devcontainerDir = path.join(expandedPath, ".devcontainer");
      const devcontainerJsonPath = path.join(
        devcontainerDir,
        "devcontainer.json",
      );

      // Create .devcontainer directory if it doesn't exist
      if (!fs.existsSync(devcontainerDir)) {
        fs.mkdirSync(devcontainerDir, { recursive: true });
      }

      // Create devcontainer.json content
      const devcontainerConfig = {
        name: "Ansible Development Tools",
        image: devcontainerImage,
        features: {
          "ghcr.io/devcontainers/features/common-utils:2": {
            installZsh: true,
            configureZshAsDefaultShell: true,
            installOhMyZsh: true,
            upgradePackages: true,
            username: "vscode",
            userUid: 1000,
            userGid: 1000,
          },
        },
        customizations: {
          vscode: {
            extensions: recommendedExtensions,
            settings: {
              "terminal.integrated.defaultProfile.linux": "zsh",
            },
          },
        },
        postCreateCommand: "ansible --version",
        remoteUser: "vscode",
      };

      // Write devcontainer.json
      fs.writeFileSync(
        devcontainerJsonPath,
        JSON.stringify(devcontainerConfig, null, 2),
        "utf8",
      );

      return "passed";
    } catch (error) {
      console.error("Error creating devcontainer:", error);
      return "failed";
    }
  }
}
