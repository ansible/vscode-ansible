import * as os from "os";
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

interface WebviewMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      "check-ade-presence": this.handleCheckAdePresence.bind(this),

      // File operation handlers
      "init-copy-logs": this.handleInitCopyLogs.bind(this),
      "init-open-log-file": this.handleInitOpenLogFile.bind(this),
      "init-open-scaffolded-folder":
        this.handleInitOpenScaffoldedFolder.bind(this),
      "init-open-scaffolded-folder-plugin":
        this.handleInitOpenScaffoldedFolderPlugin.bind(this),
      "init-open-role-folder": this.handleInitOpenRoleFolder.bind(this),

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
    webview.postMessage({
      type: "homeDirectory",
      data: os.homedir(),
    });
    return message.data;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleUiMounted(message: any, webview: vscode.Webview) {
    webview.postMessage({
      command: "homedirAndTempdir",
      homedir: os.homedir(),
      tempdir: os.tmpdir(),
    });
  }

  // File/Folder Handlers

  private async handleOpenFolderExplorer(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleOpenEditor(message: any) {
    const content: string = message.data.content;
    await openNewPlaybookEditor(content);
  }

  // Creator Handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInitCreate(message: any, webview: vscode.Webview) {
    const payload = message.payload as
      | AnsibleCollectionFormInterface
      | AnsibleProjectFormInterface;
    await this.creatorOps.runInitCommand(payload, webview);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInitCreatePlugin(message: any, webview: vscode.Webview) {
    const payload = message.payload as PluginFormInterface;
    await this.creatorOps.runAddCommand(payload, webview);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInitCreateRole(message: any, webview: vscode.Webview) {
    const payload = message.payload as RoleFormInterface;
    await this.creatorOps.runRoleAddCommand(payload, webview);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleCheckAdePresence(message: any, webview: vscode.Webview) {
    await this.creatorOps.isADEPresent(webview);
  }

  // File Operation Handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInitCopyLogs(message: any) {
    const payload = message.payload;
    vscode.env.clipboard.writeText(payload.initExecutionLogs);
    await vscode.window.showInformationMessage("Logs copied to clipboard");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInitOpenLogFile(message: any) {
    const payload = message.payload;
    await this.fileOps.openLogFile(payload.logFileUrl);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInitOpenScaffoldedFolder(message: any) {
    const payload = message.payload;
    const folderUrl = payload.collectionUrl || payload.projectUrl;
    await this.fileOps.openFolderInWorkspace(folderUrl);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInitOpenScaffoldedFolderPlugin(message: any) {
    const payload = message.payload;
    await this.fileOps.openFolderInWorkspacePlugin(
      payload.projectUrl,
      payload.pluginName,
      payload.pluginType,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInitOpenRoleFolder(message: any) {
    const payload = message.payload;
    await this.fileOps.openRoleFolderInWorkspace(
      payload.projectUrl,
      payload.roleName,
    );
  }

  // LightSpeed Handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleExplanationThumbsUp(message: any) {
    await thumbsUpDown(ThumbsUpDownAction.UP, message.data.explanationId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleExplanationThumbsDown(message: any) {
    await thumbsUpDown(ThumbsUpDownAction.DOWN, message.data.explanationId);
  }

  // Data Handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleSetPlaybookData(message: any, webview: vscode.Webview) {
    webview.postMessage({
      type: message.type,
      data: message.data,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleSetRoleData(message: any, webview: vscode.Webview) {
    webview.postMessage({
      type: message.type,
      data: message.data,
    });
  }

  private handleGetRecentPrompts(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleGetCollectionList(message: any, webview: vscode.Webview) {
    const p = new Promise((resolve) => setTimeout(resolve, 200));
    await p;

    webview.postMessage({
      type: message.type,
      data: await getCollectionsFromWorkspace(),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleFeedback(message: any) {
    const request = message.data.request as FeedbackRequestParams;
    lightSpeedManager.apiInstance.feedbackRequest(
      request,
      process.env.TEST_LIGHTSPEED_ACCESS_TOKEN !== undefined,
    );
  }

  private async handleWriteRoleInWorkspace(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
}
