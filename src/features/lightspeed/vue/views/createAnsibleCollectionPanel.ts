import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import * as os from "os";
import * as semver from "semver";
import {
  ViewColumn,
  Uri,
  workspace,
  env,
  window,
  commands,
  OpenDialogOptions,
} from "vscode";
import {
  setupPanelLifecycle,
  disposePanelResources,
  createOrRevealPanel,
} from "./creatorPanelUtils";
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

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;
    setupPanelLifecycle(
      this._panel,
      context,
      "create-ansible-collection",
      this._disposables,
      () => this.dispose(),
    );

    // Listen for messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message: any) => {
        const command = message.command || message.type;
        let payload;

        switch (command) {
          case "ui-mounted":
            this._panel.webview.postMessage({
              command: "homedirAndTempdir",
              homedir: os.homedir(),
              tempdir: os.tmpdir(),
            });
            return;

          case "open-explorer": {
            payload = message.payload;
            const selectedUri = await this.openExplorerDialog(
              payload.selectOption,
            );
            this._panel.webview.postMessage({
              command: "file-uri",
              arguments: { selectedUri: selectedUri },
            } as PostMessageEvent);
            return;
          }

          case "check-ade-presence":
            await this.isADEPresent();
            return;

          case "init-create":
            payload = message.payload as AnsibleCollectionFormInterface;
            await this.runInitCommand(payload);
            return;

          case "init-copy-logs":
            payload = message.payload;
            env.clipboard.writeText(payload.initExecutionLogs);
            await window.showInformationMessage("Logs copied to clipboard");
            return;

          case "init-open-log-file":
            payload = message.payload;
            await this.openLogFile(payload.logFileUrl);
            return;

          case "init-open-scaffolded-folder":
            payload = message.payload;
            await this.openFolderInWorkspace(payload.collectionUrl);
            return;
        }
      },
      null,
      this._disposables,
    );
  }

  private async openExplorerDialog(
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

  private async isADEPresent() {
    const ADEVersion = await getBinDetail("ade", "--version");
    const isPresent = ADEVersion !== "failed";

    this._panel.webview.postMessage({
      command: "ADEPresence",
      arguments: isPresent,
    } as PostMessageEvent);
  }

  private async getCollectionCreatorCommand(
    namespaceName: string,
    collectionName: string,
    initPathUrl: string,
  ): Promise<string> {
    const creatorVersion = await getCreatorVersion();

    if (semver.gte(creatorVersion, ANSIBLE_CREATOR_COLLECTION_VERSION_MIN)) {
      return `ansible-creator init collection ${namespaceName}.${collectionName} ${initPathUrl} --no-ansi`;
    } else {
      return `ansible-creator init ${namespaceName}.${collectionName} --init-path=${initPathUrl} --no-ansi`;
    }
  }

  private async openLogFile(fileUrl: string) {
    const logFileUrl = Uri.file(expandPath(fileUrl)).fsPath;
    console.log(`[ansible-creator] New Log file url: ${logFileUrl}`);
    const parsedUrl = Uri.parse(`vscode://file${logFileUrl}`);
    console.log(`[ansible-creator] Parsed log file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
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

    // open the galaxy file in the editor
    const galaxyFileUrl = Uri.joinPath(
      Uri.parse(folderUrl),
      "galaxy.yml",
    ).fsPath;
    console.log(`[ansible-creator] Galaxy file url: ${galaxyFileUrl}`);
    const parsedUrl = Uri.parse(`vscode://file${galaxyFileUrl}`);
    console.log(`[ansible-creator] Parsed galaxy file url: ${parsedUrl}`);
    this.openFileInEditor(parsedUrl.toString());
  }

  private openFileInEditor(fileUrl: string) {
    const updatedUrl = expandPath(fileUrl);
    console.log(`[ansible-creator] Updated url: ${updatedUrl}`);
    commands.executeCommand("vscode.open", Uri.parse(updatedUrl));
  }

  private async runInitCommand(payload: AnsibleCollectionFormInterface) {
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

    let ansibleCreatorInitCommand = await this.getCollectionCreatorCommand(
      namespaceName,
      collectionName,
      initPathUrl,
    );

    // adjust collection url for using it in ade and opening it in workspace
    const collectionUrl = initPathUrl.endsWith(
      "/collections/ansible_collections",
    )
      ? Uri.joinPath(Uri.parse(initPathUrl), namespaceName, collectionName)
          .fsPath
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
      case "off":
        break;
      case "low":
        ansibleCreatorInitCommand += " -v";
        adeCommand += " -v";
        break;
      case "medium":
        ansibleCreatorInitCommand += " -vv";
        adeCommand += " -vv";
        break;
      case "high":
        ansibleCreatorInitCommand += " -vvv";
        adeCommand += " -vvv";
        break;
    }

    let logFilePathUrl = "";

    if (logToFile) {
      logFilePathUrl = logFilePath || `${os.tmpdir()}/ansible-creator.log`;
      ansibleCreatorInitCommand += ` --lf=${logFilePathUrl}`;
      ansibleCreatorInitCommand += ` --ll=${logLevel.toLowerCase()}`;
      ansibleCreatorInitCommand += ` --la=${logFileAppend}`;
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
      console.debug("[ade] command: ", adeCommand);
      const { command: adeCmd, env: adeEnv } = withInterpreter(
        extSettings.settings,
        adeCommand,
        "",
      );

      const adeExecutionResult = await runCommand(adeCmd, adeEnv);
      commandOutput += `\n\n------------------------------- ansible-dev-environment logs --------------------------------\n`;
      commandOutput += adeExecutionResult.output;
    }

    await this._panel.webview.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        logFileUrl: logFilePathUrl,
        collectionUrl: collectionUrl,
        status: ansibleCreatorCommandPassed,
      },
    } as PostMessageEvent);
  }

  public static render(context: ExtensionContext) {
    createOrRevealPanel({
      viewType: "createAnsibleCollection",
      viewTitle: "Create Ansible Collection",
      viewColumn: ViewColumn.One,
      context: context,
      getCurrentPanel: () => MainPanel.currentPanel,
      setCurrentPanel: (panel) => {
        MainPanel.currentPanel = panel;
      },
      getPanel: (instance) => instance._panel,
      panelConstructor: (panel, context) => new MainPanel(panel, context),
    });
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    MainPanel.currentPanel = undefined;
    disposePanelResources(this._panel, this._disposables);
  }
}
