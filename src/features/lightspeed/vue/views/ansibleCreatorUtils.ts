import * as os from "os";
import * as vscode from "vscode";
import { Uri } from "vscode";
import * as semver from "semver";
import {
  AnsibleCollectionFormInterface,
  AnsibleProjectFormInterface,
  RoleFormInterface,
  PluginFormInterface,
  PostMessageEvent,
} from "../../../contentCreator/types";
import {
  getADEVersion,
  getCreatorVersion,
  getBinDetail,
  runCommand,
} from "../../../contentCreator/utils";
import { withInterpreter } from "../../../utils/commandRunner";
import { SettingsManager } from "../../../../settings";
import {
  ADE_ISOLATION_MODE_MIN,
  ANSIBLE_CREATOR_VERSION_MIN,
  ANSIBLE_CREATOR_COLLECTION_VERSION_MIN,
} from "../../../../definitions/constants";

export class AnsibleCreatorOperations {
  public async getRoleCreatorCommand(
    roleName: string,
    url: string,
  ): Promise<string> {
    let command = "";
    command = `ansible-creator add resource role ${roleName} ${url} --no-ansi`;
    return command;
  }

  public async runRoleAddCommand(
    payload: RoleFormInterface,
    webView: vscode.Webview,
  ) {
    const { roleName, collectionPath, verbosity, isOverwritten } = payload;

    const destinationPathUrl =
      collectionPath ||
      `${os.homedir()}/.ansible/collections/ansible_collections`;

    let ansibleCreatorAddCommand = await this.getRoleCreatorCommand(
      roleName,
      destinationPathUrl,
    );

    if (isOverwritten) {
      ansibleCreatorAddCommand += " --overwrite";
    } else {
      ansibleCreatorAddCommand += " --no-overwrite";
    }

    const verbosityMap: Record<string, string> = {
      off: "",
      low: " -v",
      medium: " -vv",
      high: " -vvv",
    };

    const normalizedVerbosity = verbosity.toLowerCase();
    const verbosityFlag = verbosityMap[normalizedVerbosity] || "";
    ansibleCreatorAddCommand += verbosityFlag;

    console.debug("[ansible-creator] command: ", ansibleCreatorAddCommand);

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const { command, env } = withInterpreter(
      extSettings.settings,
      ansibleCreatorAddCommand,
      "",
    );

    let commandOutput = "";
    let commandResult: string;

    const creatorVersion = await getCreatorVersion();
    const minRequiredCreatorVersion: Record<string, string> = {
      role: "25.4.0",
    };
    const requiredCreatorVersion = minRequiredCreatorVersion["role"];

    commandOutput += `----------------------------------------- ansible-creator logs ------------------------------------------\n`;

    if (semver.gte(creatorVersion, requiredCreatorVersion)) {
      const ansibleCreatorExecutionResult = await runCommand(command, env);
      commandOutput += ansibleCreatorExecutionResult.output;
      commandResult = ansibleCreatorExecutionResult.status;
    } else {
      commandOutput += `Minimum ansible-creator version needed to add the role resource is ${requiredCreatorVersion}\n`;
      commandOutput += `The installed ansible-creator version on this system is ${creatorVersion}\n`;
      commandOutput += `Please upgrade to the latest version of ansible-creator and try again.`;
      commandResult = "failed";
    }

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        projectUrl: destinationPathUrl,
        status: commandResult,
      },
    } as PostMessageEvent);
  }

  public async runPluginAddCommand(
    payload: PluginFormInterface,
    webView: vscode.Webview,
  ) {
    const { pluginName, pluginType, collectionPath, verbosity, isOverwritten } =
      payload;
    const destinationPathUrl =
      collectionPath ||
      `${os.homedir()}/.ansible/collections/ansible_collections`;

    let ansibleCreatorAddCommand = await this.getPluginCreatorCommand(
      pluginName,
      pluginType.toLowerCase(),
      destinationPathUrl,
    );

    if (isOverwritten) {
      ansibleCreatorAddCommand += " --overwrite";
    } else {
      ansibleCreatorAddCommand += " --no-overwrite";
    }

    const verbosityMap: Record<string, string> = {
      off: "",
      low: " -v",
      medium: " -vv",
      high: " -vvv",
    };

    const normalizedVerbosity = verbosity.toLowerCase();
    const verbosityFlag = verbosityMap[normalizedVerbosity] || "";
    ansibleCreatorAddCommand += verbosityFlag;
    console.debug("[ansible-creator] command: ", ansibleCreatorAddCommand);

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const { command, env } = withInterpreter(
      extSettings.settings,
      ansibleCreatorAddCommand,
      "",
    );

    let commandOutput = "";
    let commandResult: string;

    const creatorVersion = await getCreatorVersion();
    const minRequiredCreatorVersion: Record<string, string> = {
      lookup: "24.12.1",
      filter: "24.12.1",
      action: "25.0.0",
      module: "25.3.1",
      test: "25.3.1",
    };
    const requiredCreatorVersion =
      minRequiredCreatorVersion[pluginType.toLowerCase()];
    commandOutput += `----------------------------------------- ansible-creator logs ------------------------------------------\n`;

    if (semver.gte(creatorVersion, requiredCreatorVersion)) {
      const ansibleCreatorExecutionResult = await runCommand(command, env);
      commandOutput += ansibleCreatorExecutionResult.output;
      commandResult = ansibleCreatorExecutionResult.status;
    } else {
      commandOutput += `Minimum ansible-creator version needed to add the ${pluginType} plugin is ${requiredCreatorVersion}\n`;
      commandOutput += `The installed ansible-creator version on this system is ${creatorVersion}\n`;
      commandOutput += `Please upgrade to the latest version of ansible-creator and try again.`;
      commandResult = "failed";
    }

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        projectUrl: destinationPathUrl,
        status: commandResult,
      },
    } as PostMessageEvent);
  }

  public async runInitCommand(
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    webView: vscode.Webview,
  ) {
    // Determine if this is a collection or project payload
    // Collections have 'initPath', projects have 'destinationPath'
    const isCollection =
      "initPath" in payload && !("destinationPath" in payload);

    let ansibleCreatorInitCommand: string;
    let destinationUrl: string;

    if (isCollection) {
      // Collection-specific logic
      const collectionPayload = payload;
      const { namespaceName, collectionName, initPath } = collectionPayload;

      const initPathUrl =
        initPath || `${os.homedir()}/.ansible/collections/ansible_collections`;

      ansibleCreatorInitCommand = await this.getCollectionCreatorCommand(
        namespaceName,
        collectionName,
        initPathUrl,
      );

      destinationUrl = initPathUrl.endsWith("/collections/ansible_collections")
        ? Uri.joinPath(Uri.parse(initPathUrl), namespaceName, collectionName)
            .fsPath
        : initPathUrl;
    } else {
      // Project-specific logic
      const projectPayload = payload;
      const { destinationPath, namespaceName, collectionName } = projectPayload;

      destinationUrl = destinationPath ? destinationPath : os.homedir();

      ansibleCreatorInitCommand = await this.getPlaybookCreatorCommand(
        namespaceName,
        collectionName,
        destinationUrl,
      );
    }

    const creatorVersion = await getCreatorVersion();
    const exceedMinVersion = semver.gte(
      creatorVersion,
      ANSIBLE_CREATOR_VERSION_MIN,
    );

    if (exceedMinVersion && payload.isOverwritten) {
      ansibleCreatorInitCommand += " --overwrite";
    } else if (!exceedMinVersion && payload.isOverwritten) {
      ansibleCreatorInitCommand += " --force";
    } else if (exceedMinVersion && !payload.isOverwritten) {
      ansibleCreatorInitCommand += " --no-overwrite";
    }

    const verbosityMap: Record<string, string> = {
      off: "",
      low: " -v",
      medium: " -vv",
      high: " -vvv",
    };

    const normalizedVerbosity = payload.verbosity.toLowerCase();
    const verbosityFlag = verbosityMap[normalizedVerbosity] || "";
    ansibleCreatorInitCommand += verbosityFlag;

    let logFilePathUrl = "";

    if (payload.logToFile) {
      logFilePathUrl =
        payload.logFilePath || `${os.tmpdir()}/ansible-creator.log`;
      ansibleCreatorInitCommand += ` --lf=${logFilePathUrl}`;
      ansibleCreatorInitCommand += ` --ll=${payload.logLevel.toLowerCase()}`;

      if (isCollection) {
        ansibleCreatorInitCommand += ` --la=${payload.logFileAppend}`;
      } else {
        ansibleCreatorInitCommand += ` --la=${payload.logFileAppend ? "true" : "false"}`;
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

    // Execute ansible-creator command
    const ansibleCreatorExecutionResult = await runCommand(command, env);
    commandOutput += `------------------------------------------- ansible-creator logs ---------------------------------------------\n`;
    commandOutput += ansibleCreatorExecutionResult.output;
    const ansibleCreatorCommandPassed = ansibleCreatorExecutionResult.status;

    // Execute ADE command for collections if needed
    if (isCollection && payload.isEditableModeInstall) {
      const collectionPayload = payload;
      const venvPathUrl = Uri.joinPath(
        Uri.parse(destinationUrl),
        ".venv",
      ).fsPath;
      let adeCommand = `cd ${destinationUrl} && ade install --venv ${venvPathUrl} --editable . --no-ansi`;

      const verbosityMap: Record<string, string> = {
        off: "",
        low: " -v",
        medium: " -vv",
        high: " -vvv",
      };

      const normalizedVerbosity = collectionPayload.verbosity.toLowerCase();
      const verbosityFlag = verbosityMap[normalizedVerbosity] || "";
      adeCommand += verbosityFlag;

      commandOutput += `\n\n-----------------------------------------ansible-dev-environment logs -----------------------------------------\n`;

      await webView.postMessage({
        command: "execution-log",
        arguments: {
          commandOutput:
            "Collection scaffolding and environment installation in progress, please wait a few moments....\n",
          logFileUrl: logFilePathUrl,
          collectionUrl: destinationUrl,
          status: "in-progress",
        },
      } as PostMessageEvent);
      const adeVersion = await getADEVersion();
      const exceedADEImVersion = semver.gte(adeVersion, ADE_ISOLATION_MODE_MIN);

      if (exceedADEImVersion) {
        adeCommand += " --im=cfg";
        const { command, env } = withInterpreter(
          extSettings.settings,
          adeCommand,
          "",
        );
        const adeExecutionResult = await runCommand(command, env);
        commandOutput += adeExecutionResult.output;
      } else {
        commandOutput += `Collection could not be installed in editable mode.\n`;
        commandOutput += `The required version of ansible-dev-environment (ade) for editable mode (using --isolation-mode=cfg) is ${ADE_ISOLATION_MODE_MIN}.\n`;
        commandOutput += `The installed ade version on this system is ${adeVersion}\n`;
        commandOutput += `Please upgrade to the latest version of ade for this feature.`;
      }

      console.debug("[ade] command: ", adeCommand);
    }

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        logFileUrl: logFilePathUrl,
        collectionUrl: isCollection ? destinationUrl : undefined,
        projectUrl: isCollection ? undefined : destinationUrl,
        status: ansibleCreatorCommandPassed,
      },
    } as PostMessageEvent);
  }

  public async isADEPresent(webView: vscode.Webview) {
    const ADEVersion = await getBinDetail("ade", "--version");
    if (ADEVersion === "failed") {
      webView.postMessage({
        command: "ADEPresence",
        arguments: false,
      } as PostMessageEvent);
      console.debug(
        "ADE not found in the environment. Disabling ADE features.",
      );
      return;
    }
    webView.postMessage({
      command: "ADEPresence",
      arguments: true,
    } as PostMessageEvent);
    console.debug("ADE found in the environment. Enabling ADE features.");
    return;
  }

  public async getCollectionCreatorCommand(
    namespaceName: string,
    collectionName: string,
    initPathUrl: string,
  ): Promise<string> {
    let command = "";
    const creatorVersion = await getCreatorVersion();

    if (semver.gte(creatorVersion, ANSIBLE_CREATOR_COLLECTION_VERSION_MIN)) {
      command = `ansible-creator init collection ${namespaceName}.${collectionName} ${initPathUrl} --no-ansi`;
    } else {
      command = `ansible-creator init ${namespaceName}.${collectionName} --init-path=${initPathUrl} --no-ansi`;
    }
    return command;
  }

  public async getPluginCreatorCommand(
    pluginName: string,
    pluginType: string,
    url: string,
  ): Promise<string> {
    let command = "";

    command = `ansible-creator add plugin ${pluginType} ${pluginName} ${url} --no-ansi`;
    return command;
  }

  public async getPlaybookCreatorCommand(
    namespace: string,
    collection: string,
    url: string,
  ): Promise<string> {
    const creatorVersion = await getCreatorVersion();

    const PATH_SUPPORTED_VERSION = "25.6.0"; // Replace with exact version if known

    if (semver.gte(creatorVersion, PATH_SUPPORTED_VERSION)) {
      return `ansible-creator init playbook ${namespace}.${collection} --path ${url} --no-ansi`;
    } else {
      return `ansible-creator init playbook ${namespace}.${collection} ${url} --no-ansi`;
    }
  }
}
