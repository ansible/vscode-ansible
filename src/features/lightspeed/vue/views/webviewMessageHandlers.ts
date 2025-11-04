/* eslint-disable @typescript-eslint/no-explicit-any */

import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { execFile } from "child_process";
import { Uri, workspace, window } from "vscode";
import { v4 as uuidv4 } from "uuid";
import { randomUUID } from "crypto";
import { TextEncoder } from "util";
import { lightSpeedManager } from "../../../../extension";
import { isError, UNKNOWN_ERROR } from "../../utils/errors";
import { getOneClickTrialProvider } from "../../utils/oneClickTrial";
import {
  FeedbackRequestParams,
  GenerationListEntry,
} from "../../../../interfaces/lightspeed";
import { SettingsManager } from "../../../../settings";
import {
  AnsibleCollectionFormInterface,
  AnsibleProjectFormInterface,
  RoleFormInterface,
  PluginFormInterface,
  DevcontainerFormInterface,
  DevfileFormInterface,
  AnsibleExecutionEnvInterface,
  PostMessageEvent,
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
import { expandPath, runCommand } from "../../../contentCreator/utils";
import { withInterpreter } from "../../../utils/commandRunner";
import {
  DevcontainerImages,
  DevcontainerRecommendedExtensions,
  DevfileImages,
} from "../../../../definitions/constants";
import { sendTelemetry } from "../../../../utils/telemetryUtils";

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
      "init-create-devcontainer": this.handleInitCreateDevcontainer.bind(this),
      "init-create-devfile": this.handleInitCreateDevfile.bind(this),
      "init-create-execution-env": this.handleInitCreateExecutionEnv.bind(this),
      "check-ade-presence": this.handleCheckAdePresence.bind(this),

      // File operation handlers
      "init-copy-logs": this.handleInitCopyLogs.bind(this),
      "init-open-log-file": this.handleInitOpenLogFile.bind(this),
      "init-open-scaffolded-folder":
        this.handleInitOpenScaffoldedFolder.bind(this),
      "init-open-scaffolded-folder-plugin":
        this.handleInitOpenScaffoldedFolderPlugin.bind(this),
      "init-open-role-folder": this.handleInitOpenRoleFolder.bind(this),
      "init-open-devcontainer-folder":
        this.handleInitOpenDevcontainerFolder.bind(this),
      "init-open-devfile": this.handleInitOpenDevfile.bind(this),
      "init-open-scaffolded-file": this.handleInitOpenScaffoldedFile.bind(this),

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
    // Support both 'type' and 'command' fields for message routing
    const messageKey = message.type || (message as any).command;

    const handler = this.handlers[messageKey];
    if (handler) {
      await handler(message, webview, context);
    } else {
      console.warn(`Unknown message type/command: ${messageKey}`);
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

  private async handleInitCreateDevcontainer(
    message: any,
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ) {
    const payload = message.payload as DevcontainerFormInterface;
    await this.runDevcontainerCreateProcess(
      payload,
      webview,
      context.extensionUri,
    );
  }

  private async handleInitCreateDevfile(
    message: any,
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ) {
    const payload = message.payload as DevfileFormInterface;
    await this.runDevfileCreateProcess(payload, webview, context.extensionUri);
  }

  private async handleInitCreateExecutionEnv(
    message: any,
    webview: vscode.Webview,
  ) {
    const payload = message.payload as AnsibleExecutionEnvInterface;
    await this.runExecutionEnvCreateProcess(payload, webview);
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

  private async handleInitOpenDevfile(message: any) {
    const payload = message.payload;
    await this.fileOps.openDevfile(payload.projectUrl);
  }

  private async handleInitOpenScaffoldedFile(message: any) {
    const payload = message.payload;
    const projectUrl = payload.projectUrl;
    if (projectUrl) {
      // For execution environment, open the specific YAML file
      const filePath = `${projectUrl}/execution-environment.yml`;
      await this.fileOps.openFileInEditor(filePath);
    }
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
    await thumbsUpDown(
      message.data.action ?? ThumbsUpDownAction.UP,
      message.data.explanationId,
    );
  }

  private async handleExplanationThumbsDown(message: any) {
    await thumbsUpDown(
      message.data.action ?? ThumbsUpDownAction.DOWN,
      message.data.explanationId,
    );
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

  private async handleFeedback(message: any) {
    const request = message.data.request as FeedbackRequestParams;
    const provider =
      lightSpeedManager.settingsManager.settings.lightSpeedService.provider;

    // For LLM providers, send telemetry via Segment with same payload structure as WCA
    if (provider && provider !== "wca") {
      try {
        const telemetry = lightSpeedManager.telemetry;

        // Prepare telemetry data - exclude inlineSuggestion (WCA-only feature)
        const telemetryData: any = {
          provider: provider,
          model:
            lightSpeedManager.settingsManager.settings.lightSpeedService
              .modelName,
        };

        // Copy all fields except inlineSuggestion
        for (const key in request) {
          if (
            key !== "inlineSuggestion" &&
            Object.prototype.hasOwnProperty.call(request, key)
          ) {
            telemetryData[key] = (request as any)[key];
          }
        }

        await sendTelemetry(
          telemetry.telemetryService,
          telemetry.isTelemetryInit,
          "lightspeed.feedback",
          telemetryData,
        );
      } catch (error) {
        console.error(`[Lightspeed Feedback] Telemetry failed:`, error);
      }
      return;
    }

    // WCA provider - send to API
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
        // Show both relative and absolute paths to help user find the file
        const relativePath = `${collectionName.replace(".", "/")}/roles/${roleName}/${f.file_type}s/main.yml`;
        const absolutePath = fileUri.fsPath;
        this.sendErrorMessage(
          webview,
          `File already exists:\n\n${relativePath}\n\nFull path:\n${absolutePath}\n\nPlease go back and choose a different role name or collection.`,
        );
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
        absolutePath: fileUri.fsPath,
        command: `command:vscode.open?${encodeURIComponent(JSON.stringify(linkUri))}`,
      });
    }

    // Include role base directory in response for display
    webview.postMessage({
      type: message.type,
      data: savedFilesEntries,
      roleLocation: roleBaseDirUri.fsPath,
    });
  }

  // Devcontainer Handlers
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
      commandResult = await this.createDevcontainer(
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

  private getContainerImage(dropdownImage: string): string {
    if (dropdownImage.includes("downstream")) {
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
    extensionUri: vscode.Uri,
  ): Promise<string> {
    try {
      const expandedPath = expandPath(destinationUrl);
      const devcontainerDir = path.join(expandedPath, ".devcontainer");

      if (!fs.existsSync(devcontainerDir)) {
        fs.mkdirSync(devcontainerDir, { recursive: true });
      }

      const templateSourcePath = vscode.Uri.joinPath(
        extensionUri,
        "resources/contentCreator/createDevcontainer/.devcontainer",
      )
        .toString()
        .replace("file://", "");

      await this.scaffoldDevcontainerStructure(
        templateSourcePath,
        devcontainerDir,
        devcontainerImage,
        recommendedExtensions,
      );

      return "passed";
    } catch (error) {
      console.error("Error creating devcontainer:", error);
      return "failed";
    }
  }

  private async scaffoldDevcontainerStructure(
    templateSourcePath: string,
    destinationPath: string,
    devcontainerImage: string,
    recommendedExtensions: string[],
  ): Promise<void> {
    const templateFiles = [
      "devcontainer-template.txt", // Root devcontainer.json
      "docker/devcontainer-template.txt", // Docker variant
      "podman/devcontainer-template.txt", // Podman variant
    ];

    for (const templateFile of templateFiles) {
      const sourceFilePath = path.join(templateSourcePath, templateFile);
      const destinationFilePath = path.join(
        destinationPath,
        templateFile.replace("-template.txt", ".json"),
      );

      const destinationDir = path.dirname(destinationFilePath);
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }

      if (fs.existsSync(sourceFilePath)) {
        let templateContent = fs.readFileSync(sourceFilePath, "utf8");

        templateContent = templateContent.replace(
          "{{ dev_container_image }}",
          devcontainerImage,
        );
        templateContent = templateContent.replace(
          "{{ recommended_extensions | json }}",
          JSON.stringify(recommendedExtensions),
        );

        fs.writeFileSync(destinationFilePath, templateContent, "utf8");
      }
    }
  }

  // Devfile Handlers
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

    const imageURL = this.getDevfileContainerImage(image);

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

  private getDevfileContainerImage(dropdownImage: string): string {
    const image = dropdownImage.split(" ")[0];
    return DevfileImages[image as keyof typeof DevfileImages];
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
      const dirPath = path.dirname(expandedDestUrl);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      devfile = fs.readFileSync(absoluteTemplatePath, "utf8");
      devfile = devfile.replace("{{ dev_file_name }}", fullDevfileName);
      devfile = devfile.replace("{{ dev_file_image }}", devfileImage);
      fs.writeFileSync(expandedDestUrl, devfile);
      return "passed";
    } catch (err) {
      console.error("Devfile could not be created. Error: ", err);
      console.error("Expanded destination path:", expandedDestUrl);
      console.error("Template path:", absoluteTemplatePath);
      return "failed";
    }
  }

  // Execution Environment Handlers
  public async runExecutionEnvCreateProcess(
    payload: AnsibleExecutionEnvInterface,
    webView: vscode.Webview,
  ) {
    try {
      await webView.postMessage({
        command: "disable-build-button",
      });

      const {
        destinationPath,
        verbosity,
        isOverwritten,
        isCreateContextEnabled,
        isBuildImageEnabled,
        isInitEEProjectEnabled,
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

        const isSuccess = this.generateYAMLFromJSON(
          jsonData,
          destinationPathUrl,
        );

        if (isSuccess) {
          commandOutput += `Execution environment file created at ${destinationPathUrl}/execution-environment.yml\n`;
          commandResult = "passed";
          executionFileCreated = true;
        } else {
          commandOutput += `ERROR: Could not create execution environment file. Please check that your destination path exists and write permissions are configured for it.\n`;
          commandResult = "failed";
        }
      }

      if (
        isCreateContextEnabled &&
        (executionFileCreated || isInitEEProjectEnabled)
      ) {
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

      if (
        isBuildImageEnabled &&
        (executionFileCreated || isInitEEProjectEnabled)
      ) {
        await webView.postMessage({
          command: "execution-log",
          arguments: {
            commandOutput:
              commandOutput +
              "Building execution environment, this may take a few minutes....\n",
            projectUrl: destinationPathUrl,
            status: "in-progress",
          },
        } as PostMessageEvent);
        await webView.postMessage({ command: "disable-build-button" });
        await webView.postMessage({ command: "enable-open-file-button" });

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

      if (isInitEEProjectEnabled) {
        await webView.postMessage({
          command: "execution-log",
          arguments: {
            commandOutput:
              commandOutput + "Building execution environment project....\n",
            projectUrl: destinationPathUrl,
            status: "in-progress",
          },
        } as PostMessageEvent);
        await webView.postMessage({ command: "disable-build-button" });
        await webView.postMessage({ command: "enable-open-file-button" });

        let initEEProjectCommand = `ansible-creator init execution_env ${destinationPathUrl}`;

        if (isOverwritten) {
          initEEProjectCommand += " --overwrite";
        } else if (!isOverwritten) {
          initEEProjectCommand += " --no-overwrite";
        }

        console.debug("[ansible-creator] command: ", initEEProjectCommand);

        const extSettings = new SettingsManager();
        await extSettings.initialize();

        const { command, env } = withInterpreter(
          extSettings.settings,
          initEEProjectCommand,
          "",
        );

        commandOutput = "";
        commandOutput += `----------------------------------------- ansible-creator logs ------------------------------------------\n`;

        const ansibleCreatorExecutionResult = await runCommand(command, env);
        commandOutput += ansibleCreatorExecutionResult.output;
        commandResult = ansibleCreatorExecutionResult.status;
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
      await webView.postMessage({
        command: "enable-build-button",
      });
    } catch (error) {
      console.error("Error in runExecutionEnvCreateProcess:", error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorOutput = `ERROR: Execution environment creation failed: ${errorMessage}\n`;

      await webView.postMessage({
        command: "execution-log",
        arguments: {
          commandOutput: errorOutput,
          projectUrl: "",
          status: "failed",
        },
      } as PostMessageEvent);

      await webView.postMessage({
        command: "enable-build-button",
      });
    }
  }

  private generateYAMLFromJSON(
    jsonData: any,
    destinationPath: string,
  ): boolean {
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

  private getWorkspaceFolder(): string {
    let folder: string = "";
    if (vscode.workspace.workspaceFolders) {
      folder = vscode.workspace.workspaceFolders[0].uri.path;
    }
    return folder;
  }
}
