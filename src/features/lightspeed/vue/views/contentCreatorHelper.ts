/* eslint-disable  @typescript-eslint/no-explicit-any */

import type { Disposable, ExtensionContext, Webview } from "vscode";
import * as os from "os";
import * as semver from "semver";
//import { getNonce } from "../../../utils/getNonce";
import {
  AnsibleCollectionFormInterface,
  PostMessageEvent,
} from "../../../contentCreator/types";
import { withInterpreter } from "../../../utils/commandRunner";
import { SettingsManager } from "../../../../settings";

import {
  expandPath,
  getBinDetail,
  getCreatorVersion,
  runCommand,
} from "../../../contentCreator/utils";

import {
  ANSIBLE_CREATOR_COLLECTION_VERSION_MIN,
  ANSIBLE_CREATOR_VERSION_MIN,
} from "../../../../definitions/constants";

import {
  Uri,
  workspace,
  env,
  window,
  commands,
  OpenDialogOptions,
} from "vscode";

async function openExplorerDialog(
  selectOption: string,
): Promise<string | undefined> {
  const options: OpenDialogOptions = {
    canSelectMany: false,
    openLabel: "Select",
    canSelectFiles: selectOption === "file",
    canSelectFolders: selectOption === "folder",
    defaultUri: Uri.parse(os.homedir()),
  };

  let selectedUri: string | undefined;
  await window.showOpenDialog(options).then((fileUri) => {
    if (fileUri?.[0]) {
      selectedUri = fileUri[0].fsPath;
    }
  });

  return selectedUri;
}
async function isADEPresent(webView: Webview) {
  const ADEVersion = await getBinDetail("ade", "--version");
  if (ADEVersion === "failed") {
    // send the system details to the webview
    webView.postMessage({
      command: "ADEPresence",
      arguments: false,
    } as PostMessageEvent);
    return;
  }
  // send the system details to the webview
  webView.postMessage({
    command: "ADEPresence",
    arguments: true,
  } as PostMessageEvent);
  return;
}

async function getCollectionCreatorCommand(
  namespaceName: string,
  collectionName: string,
  initPathUrl: string,
): Promise<string> {
  let command = "";
  // try {
  const creatorVersion = await getCreatorVersion();

  if (semver.gte(creatorVersion, ANSIBLE_CREATOR_COLLECTION_VERSION_MIN)) {
    command = `ansible-creator init collection ${namespaceName}.${collectionName} ${initPathUrl} --no-ansi`;
  } else {
    command = `ansible-creator init ${namespaceName}.${collectionName} --init-path=${initPathUrl} --no-ansi`;
  }
  return command;
}

async function openLogFile(fileUrl: string) {
  const logFileUrl = Uri.file(expandPath(fileUrl)).fsPath;
  console.log(`[ansible-creator] New Log file url: ${logFileUrl}`);
  const parsedUrl = Uri.parse(`vscode://file${logFileUrl}`);
  console.log(`[ansible-creator] Parsed log file url: ${parsedUrl}`);
  openFileInEditor(parsedUrl.toString());
}

async function openFolderInWorkspace(folderUrl: string) {
  const folderUri = Uri.parse(expandPath(folderUrl));

  if (workspace.workspaceFolders?.length === 0) {
    workspace.updateWorkspaceFolders(0, null, { uri: folderUri });
  } else {
    await commands.executeCommand("vscode.openFolder", folderUri, {
      forceNewWindow: true,
    });
  }

  // open the galaxy file in the editor
  const galaxyFileUrl = Uri.joinPath(Uri.parse(folderUrl), "galaxy.yml").fsPath;
  console.log(`[ansible-creator] Galaxy file url: ${galaxyFileUrl}`);
  const parsedUrl = Uri.parse(`vscode://file${galaxyFileUrl}`);
  console.log(`[ansible-creator] Parsed galaxy file url: ${parsedUrl}`);
  openFileInEditor(parsedUrl.toString());
}

function openFileInEditor(fileUrl: string) {
  const updatedUrl = expandPath(fileUrl);

  console.log(`[ansible-creator] Updated url: ${updatedUrl}`);

  commands.executeCommand("vscode.open", Uri.parse(updatedUrl));
}

async function runInitCommand(
  payload: AnsibleCollectionFormInterface,
  webView: Webview,
) {
  const {
    namespaceName,
    collectionName,
    initPath,
    logToFile,
    logFilePath,
    logFileAppend,
    logLevel,
    verbosity,
    isOverwritten,
    isEditableModeInstall,
  } = payload;

  const initPathUrl =
    initPath || `${os.homedir()}/.ansible/collections/ansible_collections`;

  let ansibleCreatorInitCommand = await getCollectionCreatorCommand(
    namespaceName,
    collectionName,
    initPathUrl,
  );

  // adjust collection url for using it in ade and opening it in workspace
  // NOTE: this is done in order to synchronize the behavior of ade and extension
  // with the behavior of ansible-creator CLI tool

  const collectionUrl = initPathUrl.endsWith("/collections/ansible_collections")
    ? Uri.joinPath(Uri.parse(initPathUrl), namespaceName, collectionName).fsPath
    : initPathUrl;

  const venvPathUrl = Uri.joinPath(Uri.parse(collectionUrl), ".venv").fsPath;

  let adeCommand = `ade install --venv ${venvPathUrl} --editable ${collectionUrl} --no-ansi`;

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
      adeCommand += "";
      break;
    case "Low":
      ansibleCreatorInitCommand += " -v";
      adeCommand += " -v";
      break;
    case "Medium":
      ansibleCreatorInitCommand += " -vv";
      adeCommand += " -vv";
      break;
    case "High":
      ansibleCreatorInitCommand += " -vvv";
      adeCommand += " -vvv";
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

  console.debug("[ansible-creator] command: ", ansibleCreatorInitCommand);

  const extSettings = new SettingsManager();
  await extSettings.initialize();

  const { command, env } = withInterpreter(
    extSettings.settings,
    ansibleCreatorInitCommand,
    "",
  );

  let commandOutput = "";

  // execute ansible-creator command
  const ansibleCreatorExecutionResult = await runCommand(command, env);
  commandOutput += `----------------------------------------- ansible-creator logs ------------------------------------------\n`;
  commandOutput += ansibleCreatorExecutionResult.output;
  const ansibleCreatorCommandPassed = ansibleCreatorExecutionResult.status;

  if (isEditableModeInstall) {
    // ade command inherits only the verbosity options from ansible-creator command
    console.debug("[ade] command: ", adeCommand);

    const { command, env } = withInterpreter(
      extSettings.settings,
      adeCommand,
      "",
    );

    // execute ade command
    const adeExecutionResult = await runCommand(command, env);
    commandOutput += `\n\n------------------------------- ansible-dev-environment logs --------------------------------\n`;
    commandOutput += adeExecutionResult.output;
  }

  await webView.postMessage({
    command: "execution-log",
    arguments: {
      commandOutput: commandOutput,
      logFileUrl: logFilePathUrl,
      collectionUrl: collectionUrl,
      status: ansibleCreatorCommandPassed,
    },
  } as PostMessageEvent);
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CreatorWebviewHelper {
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
    // context: ExtensionContext,
  ) {
    webview.onDidReceiveMessage(
      async (message: any) => {
        const command = message.command;
        let payload;

        switch (command) {
          case "open-explorer": {
            payload = message.payload;
            const selectedUri = await openExplorerDialog(payload.selectOption);
            webview.postMessage({
              command: "file-uri",
              arguments: { selectedUri: selectedUri },
            } as PostMessageEvent);
            return;
          }

          case "check-ade-presence":
            await isADEPresent(webview);
            return;

          case "init-create":
            payload = message.payload as AnsibleCollectionFormInterface;
            await runInitCommand(payload, webview);
            return;

          case "init-copy-logs":
            payload = message.payload;
            env.clipboard.writeText(payload.initExecutionLogs);
            await window.showInformationMessage("Logs copied to clipboard");
            return;

          case "init-open-log-file":
            payload = message.payload;
            await openLogFile(payload.logFileUrl);
            return;

          case "init-open-scaffolded-folder":
            payload = message.payload;
            await openFolderInWorkspace(payload.collectionUrl);
            return;
        }
      },
      undefined,
      disposables,
    );
  }
}
