import type { Disposable, ExtensionContext, Webview } from "vscode";
import { v4 as uuidv4 } from "uuid";
import { CollectionFinder, AnsibleCollection } from "../../utils/scanner";
import * as os from "os";
import {
  AnsibleProjectFormInterface,
  PostMessageEvent,
} from "../../../contentCreator/types";
import * as vscode from "vscode";
import {
  expandPath,
  getCreatorVersion,
  runCommand,
} from "../../../contentCreator/utils";
import { withInterpreter } from "../../../utils/commandRunner";
import { SettingsManager } from "../../../../settings";
import { ANSIBLE_CREATOR_VERSION_MIN } from "../../../../definitions/constants";
import {
  Uri,
  workspace,
  FileSystemError,
  ViewColumn,
  window,
  commands,
} from "vscode";
import { TextEncoder } from "util";
import * as semver from "semver";
import { LightSpeedAPI } from "../../api";
import { IError, isError, UNKNOWN_ERROR } from "../../utils/errors";
import {
  PlaybookGenerationResponseParams,
  RoleGenerationResponseParams,
  GenerationListEntry,
  FeedbackRequestParams,
  RoleGenerationRequestParams,
  ExplanationResponseParams,
  ExplanationRequestParams,
  RoleExplanationRequestParams,
} from "../../../../interfaces/lightspeed";
import {
  LightSpeedCommands,
  ThumbsUpDownAction,
} from "../../../../definitions/lightspeed";
import { lightSpeedManager } from "../../../../extension";
import { getOneClickTrialProvider } from "../../utils/oneClickTrial";

async function openNewPlaybookEditor(content: string) {
  const options = {
    language: "ansible",
    content: content,
  };

  const doc = await workspace.openTextDocument(options);
  await window.showTextDocument(doc, ViewColumn.Active);
}

export async function getCollectionsFromWorkspace(): Promise<
  AnsibleCollection[]
> {
  const workspaceFolders = workspace.workspaceFolders;

  if (!workspaceFolders) {
    return [];
  }
  const workspaceDirectories = workspaceFolders.map((f) => f.uri.fsPath);
  const collectionFinder = new CollectionFinder(workspaceDirectories);
  await collectionFinder.refreshCache();
  return collectionFinder.cache;
}

async function getRoleBaseDir(
  collectionName: string,
  roleName: string,
): Promise<Uri> {
  const collectionFound = await getCollectionsFromWorkspace();
  const collectionMatch = collectionFound.filter(
    (e) => e.fqcn === collectionName,
  );
  if (collectionMatch.length === 0) {
    throw new Error("Collection not found in the workspace!");
  } else if (collectionMatch.length !== 1) {
    throw new Error(
      `Too many directories found for collection ${collectionName}!`,
    );
  }
  const roleBaseDirUri = Uri.file(
    `${collectionMatch[0].path}/roles/${roleName}`,
  );
  return roleBaseDirUri;
}

async function explainPlaybook(
  apiInstance: LightSpeedAPI,
  content: string,
  explanationId: string,
): Promise<ExplanationResponseParams | IError> {
  const params: ExplanationRequestParams = {
    content,
    explanationId,
  };

  const response: ExplanationResponseParams | IError =
    await apiInstance.explanationRequest(params);
  return response;
}

async function explainRole(
  apiInstance: LightSpeedAPI,
  files: GenerationListEntry[],
  roleName: string,
  explanationId: string,
): Promise<ExplanationResponseParams | IError> {
  const params: RoleExplanationRequestParams = {
    files: files,
    roleName: roleName,
    explanationId: explanationId,
  };

  const response: ExplanationResponseParams | IError =
    await apiInstance.roleExplanationRequest(params);

  return response;
}

async function generateRole(
  apiInstance: LightSpeedAPI,
  name: string | undefined,
  text: string,
  outline: string,
  generationId: string,
): Promise<RoleGenerationResponseParams | IError> {
  const createOutline = outline.length === 0;

  const params: RoleGenerationRequestParams = {
    text,
    outline: outline.length > 0 ? outline : undefined,
    createOutline,
    generationId,
    name: name,
  };

  const response: RoleGenerationResponseParams | IError =
    await apiInstance.roleGenerationRequest(params);
  return response;
}

async function thumbsUpDown(action: ThumbsUpDownAction, explanationId: string) {
  commands.executeCommand("ansible.lightspeed.thumbsUpDown", {
    action: action,
    explanationId: explanationId,
  });
}

async function generatePlaybook(
  apiInstance: LightSpeedAPI,
  text: string,
  outline: string,
  generationId: string,
): Promise<PlaybookGenerationResponseParams | IError> {
  const createOutline = outline.length === 0;

  const response: PlaybookGenerationResponseParams | IError =
    await apiInstance.playbookGenerationRequest({
      text,
      outline: outline.length > 0 ? outline : undefined,
      createOutline,
      generationId,
    });
  return response;
}

async function fileExists(uri: Uri): Promise<boolean> {
  try {
    await workspace.fs.stat(uri);
  } catch (e) {
    if (e instanceof FileSystemError && e.code === "FileNotFound") {
      return false;
    }
  }
  return true;
}

function contentMatch(generationId: string, playbook: string) {
  console.log(playbook);
  lightSpeedManager.contentMatchesProvider.suggestionDetails = [
    {
      suggestionId: generationId,
      suggestion: playbook,
      isPlaybook: true,
    },
  ];

  // Show training matches for the accepted suggestion.

  commands.executeCommand(LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES);
}

function updatePromptHistory(context: ExtensionContext, new_prompt: string) {
  const recent_prompts: string[] = context.workspaceState
    .get("ansible.lightspeed.recent_prompts", [])
    .filter((prompt: string) => prompt !== new_prompt);
  recent_prompts.push(new_prompt);
  context.workspaceState.update(
    "ansible.lightspeed.recent_prompts",
    recent_prompts.slice(-500),
  );
}

export class WebviewHelper {
  public static setupHtml(
    webview: Webview,
    context: ExtensionContext,
    name: string,
  ) {
    return __getWebviewHtml__({
      // vite dev mode
      serverUrl: `${process.env.VITE_DEV_SERVER_URL}webviews/lightspeed/${name}.html`,
      // vite prod mode
      webview,
      context,
      inputName: name,
    });
  }

  public static async setupWebviewHooks(
    webview: Webview,
    disposables: Disposable[],
    context: ExtensionContext,
  ) {
    function sendErrorMessage(message: string) {
      webview.postMessage({
        type: "errorMessage",
        data: message,
      });
    }

    webview.onDidReceiveMessage(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (message: any) => {
        const type = message.type;
        const data = message.data;
        let payload;
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
              defaultUri: defaultPath
                ? vscode.Uri.file(defaultPath)
                : undefined,
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
              defaultUri: defaultPath
                ? vscode.Uri.file(defaultPath)
                : undefined,
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
            payload = message.payload as AnsibleProjectFormInterface;
            const webviewHelper = new WebviewHelper();
            await webviewHelper.runInitCommand(payload, webview);
            return;
          }
          case "init-copy-logs": {
            payload = message.payload;
            vscode.env.clipboard.writeText(payload.initExecutionLogs);
            await vscode.window.showInformationMessage(
              "Logs copied to clipboard",
            );
            return;
          }
          case "init-open-log-file": {
            payload = message.payload;
            const webviewHelper = new WebviewHelper();
            await webviewHelper.openLogFile(payload.logFileUrl);
            return;
          }
          case "init-open-scaffolded-folder": {
            payload = message.payload;
            const webviewHelper = new WebviewHelper();
            await webviewHelper.openFolderInWorkspace(payload.projectUrl);
            return;
          }
          case "explanationThumbsUp": {
            thumbsUpDown(ThumbsUpDownAction.UP, data.explanationId);
            return;
          }
          case "explanationThumbsDown": {
            thumbsUpDown(ThumbsUpDownAction.DOWN, data.explanationId);
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

            const roleBaseDirUri = await getRoleBaseDir(
              collectionName,
              roleName,
            );

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
      },
      undefined,
      disposables,
    );
  }

  public async runInitCommand(
    payload: AnsibleProjectFormInterface,
    webView: vscode.Webview,
  ) {
    const {
      destinationPath,
      namespaceName,
      collectionName,
      logToFile,
      logFilePath,
      logFileAppend,
      logLevel,
      verbosity,
      isOverwritten,
    } = payload;

    const destinationPathUrl = destinationPath ? destinationPath : os.homedir();
    let ansibleCreatorInitCommand = await this.getPlaybookCreatorCommand(
      namespaceName,
      collectionName,
      destinationPathUrl,
    );
    const creatorVersion = await getCreatorVersion();
    const exceedMinVersion = semver.gte(
      creatorVersion,
      ANSIBLE_CREATOR_VERSION_MIN,
    );
    if (exceedMinVersion && isOverwritten) {
      ansibleCreatorInitCommand += " --overwrite";
    } else if (!exceedMinVersion && isOverwritten) {
      ansibleCreatorInitCommand += " --force";
    } else if (exceedMinVersion && !isOverwritten) {
      ansibleCreatorInitCommand += " --no-overwrite";
    }

    switch (verbosity) {
      case "Off":
        ansibleCreatorInitCommand += "";
        break;
      case "Low":
        ansibleCreatorInitCommand += " -v";
        break;
      case "Medium":
        ansibleCreatorInitCommand += " -vv";
        break;
      case "High":
        ansibleCreatorInitCommand += " -vvv";
        break;
    }

    let logFilePathUrl = "";

    if (logToFile) {
      if (logFilePath) {
        logFilePathUrl = logFilePath;
      } else {
        logFilePathUrl = `${os.tmpdir()}/ansible-creator.log`;
      }
      ansibleCreatorInitCommand += ` --lf=${logFilePathUrl}`;

      ansibleCreatorInitCommand += ` --ll=${logLevel.toLowerCase()}`;

      if (logFileAppend) {
        ansibleCreatorInitCommand += ` --la=true`;
      } else {
        ansibleCreatorInitCommand += ` --la=false`;
      }
    }

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const { command, env } = withInterpreter(
      extSettings.settings,
      ansibleCreatorInitCommand,
      "",
    );

    let commandOutput = "";

    const ansibleCreatorExecutionResult = await runCommand(command, env);
    commandOutput += `----------------------------------------- ansible-creator logs ------------------------------------------\n`;
    commandOutput += ansibleCreatorExecutionResult.output;
    const commandPassed = ansibleCreatorExecutionResult.status;

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        logFileUrl: logFilePathUrl,
        projectUrl: destinationPathUrl,
        status: commandPassed,
      },
    } as PostMessageEvent);
  }
  public async getPlaybookCreatorCommand(
    namespace: string,
    collection: string,
    url: string,
  ): Promise<string> {
    let command = "";
    const creatorVersion = await getCreatorVersion();

    if (semver.gte(creatorVersion, ANSIBLE_CREATOR_VERSION_MIN)) {
      command = `ansible-creator init playbook ${namespace}.${collection} ${url} --no-ansi`;
    } else {
      command = `ansible-creator init --project=ansible-project --init-path=${url} --scm-org=${namespace} --scm-project=${collection} --no-ansi`;
    }
    return command;
  }
  public async openLogFile(fileUrl: string) {
    const logFileUrl = vscode.Uri.file(expandPath(fileUrl)).fsPath;
    const parsedUrl = vscode.Uri.parse(`vscode://file${logFileUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }
  public openFileInEditor(fileUrl: string) {
    const updatedUrl = expandPath(String(fileUrl));

    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(updatedUrl));
  }
  private async openFolderInWorkspace(folderUrl: string) {
    const folderUri = Uri.parse(expandPath(folderUrl));
    if (workspace.workspaceFolders?.length === 0) {
      workspace.updateWorkspaceFolders(0, null, { uri: folderUri });
    } else {
      await commands.executeCommand("vscode.openFolder", folderUri, {
        forceNewWindow: true,
      });
    }

    const playbookFileUrl = Uri.joinPath(
      Uri.parse(folderUrl),
      "site.yml",
    ).fsPath;
    const parsedUrl = Uri.parse(`vscode://file${playbookFileUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }
}
