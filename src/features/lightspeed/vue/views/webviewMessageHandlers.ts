import * as os from "os";
import * as vscode from "vscode";
import { Uri, workspace, commands, window } from "vscode";
import { v4 as uuidv4 } from "uuid";
import { TextEncoder } from "util";
import { lightSpeedManager } from "../../../../extension";
import { IError, isError, UNKNOWN_ERROR } from "../../utils/errors";
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

export class WebviewMessageHandlers {
  private fileOps = new FileOperations();
  private creatorOps = new AnsibleCreatorOperations();

  public async handleMessage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: any,
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ) {
    const type = message.type;
    const data = message.data;
    let payload;

    const sendErrorMessage = (message: string) => {
      webview.postMessage({
        type: "errorMessage",
        data: message,
      });
    };

    switch (type) {
      case "getHomeDirectory": {
        webview.postMessage({
          type: "homeDirectory",
          data: os.homedir(),
        });
        return data;
      }

      case "openFolderExplorer": {
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
        break;
      }

      case "openFileExplorer": {
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
        break;
      }

      case "ui-mounted": {
        webview.postMessage({
          command: "homedirAndTempdir",
          homedir: os.homedir(),
          tempdir: os.tmpdir(),
        });
        return;
      }

      case "init-create": {
        payload = message.payload as
          | AnsibleCollectionFormInterface
          | AnsibleProjectFormInterface;
        await this.creatorOps.runInitCommand(payload, webview);
        return;
      }

      case "init-create-plugin": {
        payload = message.payload as PluginFormInterface;
        await this.creatorOps.runAddCommand(payload, webview);
        return;
      }

      case "init-copy-logs": {
        payload = message.payload;
        vscode.env.clipboard.writeText(payload.initExecutionLogs);
        await vscode.window.showInformationMessage("Logs copied to clipboard");
        return;
      }

      case "init-open-log-file": {
        payload = message.payload;
        await this.fileOps.openLogFile(payload.logFileUrl);
        return;
      }

      case "init-open-scaffolded-folder": {
        payload = message.payload;
        const folderUrl = payload.collectionUrl || payload.projectUrl;
        await this.fileOps.openFolderInWorkspace(folderUrl);
        return;
      }

      case "init-open-scaffolded-folder-plugin": {
        payload = message.payload;
        await this.fileOps.openFolderInWorkspacePlugin(
          payload.projectUrl,
          payload.pluginName,
          payload.pluginType,
        );
        return;
      }

      case "check-ade-presence": {
        await this.creatorOps.isADEPresent(webview);
        return;
      }

      case "init-create-role": {
        payload = message.payload as RoleFormInterface;
        await this.creatorOps.runRoleAddCommand(payload, webview);
        return;
      }

      case "init-open-role-folder": {
        payload = message.payload;
        await this.fileOps.openRoleFolderInWorkspace(
          payload.projectUrl,
          payload.roleName,
        );
        return;
      }

      case "explanationThumbsUp": {
        await thumbsUpDown(ThumbsUpDownAction.UP, data.explanationId);
        return;
      }

      case "explanationThumbsDown": {
        await thumbsUpDown(ThumbsUpDownAction.DOWN, data.explanationId);
        return;
      }

      case "setPlaybookData": {
        webview.postMessage({
          type,
          data,
        });
        return;
      }

      case "setRoleData": {
        webview.postMessage({
          type,
          data,
        });
        return;
      }

      case "explainPlaybook": {
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
          sendErrorMessage(
            `Failed to get an answer from the server: ${response.message}`,
          );
          return;
        }
        webview.postMessage({
          type: type,
          data: response,
        });

        lightSpeedManager.statusBarProvider.statusBar.text =
          lightSpeedStatusbarText;
        return;
      }

      case "explainRole": {
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
          sendErrorMessage(
            `Failed to get an answer from the server: ${response.message}`,
          );
          return;
        }
        webview.postMessage({
          type: type,
          data: response,
        });

        lightSpeedManager.statusBarProvider.statusBar.text =
          lightSpeedStatusbarText;
        return;
      }

      case "generateRole": {
        const generationId = uuidv4();
        const response = await generateRole(
          lightSpeedManager.apiInstance,
          data.name,
          data.text,
          data.outline,
          generationId,
        );
        if (isError(response)) {
          sendErrorMessage(
            `Failed to get an answer from the server: ${response.message}`,
          );
          return;
        }
        webview.postMessage({
          type: type,
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
        return;
      }

      case "generatePlaybook": {
        const generationId = uuidv4();
        const response = await generatePlaybook(
          lightSpeedManager.apiInstance,
          data.text,
          data.outline,
          generationId,
        );
        if (isError(response)) {
          sendErrorMessage(
            `Failed to get an answer from the server: ${response.message}`,
          );
          return;
        }
        webview.postMessage({
          type: type,
          data: response,
        });
        contentMatch(generationId, response.playbook);
        updatePromptHistory(context, data.text);
        return;
      }

      case "getRecentPrompts": {
        const recent_prompts: string[] = context.workspaceState.get(
          "ansible.lightspeed.recent_prompts",
          [],
        );
        webview.postMessage({
          type: type,
          data: recent_prompts,
        });
        return;
      }

      case "getCollectionList": {
        const p = new Promise((resolve) => setTimeout(resolve, 200));
        await p;

        webview.postMessage({
          type: type,
          data: await getCollectionsFromWorkspace(),
        });
        return;
      }

      case "openEditor": {
        const content: string = data.content;
        await openNewPlaybookEditor(content);
        break;
      }

      case "feedback": {
        const request = data.request as FeedbackRequestParams;
        lightSpeedManager.apiInstance.feedbackRequest(
          request,
          process.env.TEST_LIGHTSPEED_ACCESS_TOKEN !== undefined,
        );
        break;
      }

      case "writeRoleInWorkspace": {
        const roleName: string = data.roleName;
        const collectionName: string = data.collectionName;
        const files = data.files.map((i: string[]) => {
          return {
            path: i[0],
            content: i[1],
            file_type: i[2],
          };
        }) as GenerationListEntry[];

        const roleBaseDirUri = await getRoleBaseDir(collectionName, roleName);

        const savedFilesEntries = [];

        for (const f of files) {
          const dirUri = Uri.joinPath(roleBaseDirUri, `/${f.file_type}s`);
          const fileUri = Uri.joinPath(
            roleBaseDirUri,
            `/${f.file_type}s/main.yml`,
          );
          await workspace.fs.createDirectory(dirUri);
          if (await fileExists(fileUri)) {
            sendErrorMessage(`File already exists (${fileUri})!`);
            webview.postMessage({
              type: type,
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
          type: type,
          data: savedFilesEntries,
        });
        return;
      }
    }
  }
}
