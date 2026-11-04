import * as os from "os";
import * as vscode from "vscode";
import { Uri } from "vscode";
import * as semver from "semver";
import {
  AnsibleCollectionFormInterface,
  AnsibleProjectFormInterface,
  RoleFormInterface,
  PluginFormInterface,
} from "@src/features/contentCreator/types";
import {
  getADEVersion,
  getCreatorVersion,
  getBinDetail,
  runCommand,
} from "@src/features/contentCreator/utils";
import { withInterpreter } from "@src/features/utils/commandRunner";
import { SettingsManager } from "@src/settings";
import {
  ADE_ISOLATION_MODE_MIN,
  ANSIBLE_CREATOR_VERSION_MIN,
} from "@src/definitions/constants";

export class AnsibleCreatorOperations {
  private defaultCollectionsPath(): string {
    return `${os.homedir()}/.ansible/collections/ansible_collections`;
  }

  private checkVersionWithError(
    currentVersion: string,
    requiredVersion: string,
  ): { isGte: boolean; userMessage?: string } {
    try {
      const parsed =
        semver.valid(currentVersion) ?? semver.coerce(currentVersion)?.version;
      if (!parsed) {
        return {
          isGte: false,
          userMessage: `Invalid version format: ${currentVersion}.\n`,
        };
      }
      return { isGte: semver.gte(parsed, requiredVersion) };
    } catch {
      return {
        isGte: false,
        userMessage: `Invalid version format: ${currentVersion}.\n`,
      };
    }
  }

  // Shared version gate: checks creator presence and minimum version, posts
  // the appropriate error to the webview and returns { passed: false } when
  // the gate fails. Callers early-return on !passed.
  private async checkCreatorVersionGate(
    webView: vscode.Webview,
    subject: string,
    urlPayload: Record<string, string | undefined>,
  ): Promise<{ passed: boolean }> {
    const creatorVersion = await getCreatorVersion();
    if (!creatorVersion || creatorVersion === "failed") {
      await webView.postMessage({
        command: "execution-log",
        arguments: {
          commandOutput:
            "ansible-creator is not installed or not found in PATH.\n" +
            "Please install ansible-creator and try again.\n",
          ...urlPayload,
          status: "failed",
        },
      });
      return { passed: false };
    }

    const versionCheck = this.checkVersionWithError(
      creatorVersion,
      ANSIBLE_CREATOR_VERSION_MIN,
    );
    if (!versionCheck.isGte) {
      let commandOutput = versionCheck.userMessage ?? "";
      if (!versionCheck.userMessage) {
        commandOutput += `Minimum ansible-creator version needed${subject} is ${ANSIBLE_CREATOR_VERSION_MIN}\n`;
        commandOutput += `The installed ansible-creator version on this system is ${creatorVersion}\n`;
        commandOutput += `Please upgrade to the latest version of ansible-creator and try again.`;
      }
      await webView.postMessage({
        command: "execution-log",
        arguments: {
          commandOutput,
          ...urlPayload,
          status: "failed",
        },
      });
      return { passed: false };
    }

    return { passed: true };
  }

  public getRoleCreatorCommand(roleName: string, url: string): string {
    return `ansible-creator add resource role ${roleName} ${url} --no-ansi`;
  }

  // Runs an ansible-creator command through the interpreter, posts the
  // execution result to the webview. Shared by role-add, plugin-add flows.
  private async executeCreatorCommand(
    baseCommand: string,
    isOverwritten: boolean,
    verbosity: string,
    webView: vscode.Webview,
    urlPayload: Record<string, string | undefined>,
  ): Promise<void> {
    let command = this.applyOverwriteFlag(baseCommand, isOverwritten);
    command += this.getVerbosityFlag(verbosity);

    console.debug("[ansible-creator] command: ", command);

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const { command: resolved, env } = await withInterpreter(
      extSettings.settings,
      command,
      "",
    );

    const result = await runCommand(resolved, env);
    const commandOutput =
      `----------------------------------------- ansible-creator logs ------------------------------------------\n` +
      result.output;

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput,
        ...urlPayload,
        status: result.status,
      },
    });
  }

  // Shared flow for role-add and plugin-add: resolves the destination,
  // gates on the creator version, then builds and executes the command.
  private async runAddCommand(
    webView: vscode.Webview,
    subject: string,
    collectionPath: string,
    isOverwritten: boolean,
    verbosity: string,
    buildCommand: (url: string) => string,
  ): Promise<void> {
    const destinationPathUrl = collectionPath || this.defaultCollectionsPath();

    const gate = await this.checkCreatorVersionGate(webView, subject, {
      projectUrl: destinationPathUrl,
    });
    if (!gate.passed) return;

    await this.executeCreatorCommand(
      buildCommand(destinationPathUrl),
      isOverwritten,
      verbosity,
      webView,
      { projectUrl: destinationPathUrl },
    );
  }

  public async runRoleAddCommand(
    payload: RoleFormInterface,
    webView: vscode.Webview,
  ) {
    const { roleName, collectionPath, verbosity, isOverwritten } = payload;
    await this.runAddCommand(
      webView,
      " to add the role resource",
      collectionPath,
      isOverwritten,
      verbosity,
      (url) => this.getRoleCreatorCommand(roleName, url),
    );
  }

  public async runPluginAddCommand(
    payload: PluginFormInterface,
    webView: vscode.Webview,
  ) {
    const { pluginName, pluginType, collectionPath, verbosity, isOverwritten } =
      payload;
    await this.runAddCommand(
      webView,
      ` to add the ${pluginType} plugin`,
      collectionPath,
      isOverwritten,
      verbosity,
      (url) =>
        this.getPluginCreatorCommand(pluginName, pluginType.toLowerCase(), url),
    );
  }

  public async runInitCommand(
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    webView: vscode.Webview,
  ) {
    // Determine if this is a collection or project payload
    // Collections have 'initPath', projects have 'destinationPath'
    const isCollection =
      "initPath" in payload && !("destinationPath" in payload);

    const built = this.buildCreatorInitCommand(payload, isCollection);
    const destinationUrl = built.destinationUrl;
    let ansibleCreatorInitCommand = built.command;

    const gate = await this.checkCreatorVersionGate(webView, "", {
      collectionUrl: isCollection ? destinationUrl : undefined,
      projectUrl: isCollection ? undefined : destinationUrl,
    });
    if (!gate.passed) return;

    let commandOutput = "";

    ansibleCreatorInitCommand = this.applyOverwriteFlag(
      ansibleCreatorInitCommand,
      payload.isOverwritten,
    );
    ansibleCreatorInitCommand += this.getVerbosityFlag(payload.verbosity);

    const logFlags = this.applyLogFileFlags(
      ansibleCreatorInitCommand,
      payload,
      isCollection,
    );
    ansibleCreatorInitCommand = logFlags.command;
    const logFilePathUrl = logFlags.logFilePathUrl;

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const { command, env } = await withInterpreter(
      extSettings.settings,
      ansibleCreatorInitCommand,
      "",
    );

    // Execute ansible-creator command
    const ansibleCreatorExecutionResult = await runCommand(command, env);
    commandOutput += `------------------------------------------- ansible-creator logs ---------------------------------------------\n`;
    commandOutput += ansibleCreatorExecutionResult.output;
    const ansibleCreatorCommandPassed = ansibleCreatorExecutionResult.status;

    // Execute ADE command for collections if needed
    if (isCollection && payload.isEditableModeInstall) {
      commandOutput += await this.runAdeEditableInstall(
        payload,
        destinationUrl,
        logFilePathUrl,
        extSettings,
        webView,
      );
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
    });
  }

  // Builds the base ansible-creator init command and resolves the destination
  // URL for either a collection or a project payload.
  private buildCreatorInitCommand(
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    isCollection: boolean,
  ): { command: string; destinationUrl: string } {
    if (isCollection) {
      const collectionPayload = payload as AnsibleCollectionFormInterface;
      const { namespaceName, collectionName, initPath } = collectionPayload;

      const initPathUrl = initPath || this.defaultCollectionsPath();

      const command = this.getCollectionCreatorCommand(
        namespaceName,
        collectionName,
        initPathUrl,
      );

      const destinationUrl = initPathUrl.endsWith(
        "/collections/ansible_collections",
      )
        ? Uri.joinPath(Uri.parse(initPathUrl), namespaceName, collectionName)
            .fsPath
        : initPathUrl;

      return { command, destinationUrl };
    }

    const projectPayload = payload as AnsibleProjectFormInterface;
    const { destinationPath, namespaceName, collectionName } = projectPayload;

    const destinationUrl = destinationPath || os.homedir();

    const command = this.getPlaybookCreatorCommand(
      namespaceName,
      collectionName,
      destinationUrl,
    );

    return { command, destinationUrl };
  }

  // Appends --overwrite or --no-overwrite. Callers reject creator versions
  // below ANSIBLE_CREATOR_VERSION_MIN before this runs.
  private applyOverwriteFlag(command: string, isOverwritten: boolean): string {
    return command + (isOverwritten ? " --overwrite" : " --no-overwrite");
  }

  // Maps a verbosity level to its ansible-creator flag.
  private getVerbosityFlag(verbosity: string): string {
    const verbosityMap: Record<string, string> = {
      off: "",
      low: " -v",
      medium: " -vv",
      high: " -vvv",
    };
    return verbosityMap[verbosity.toLowerCase()] || "";
  }

  // Appends the log-file flags when logging to file is enabled and returns the
  // resolved log file path (empty when logging is disabled).
  private applyLogFileFlags(
    command: string,
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    isCollection: boolean,
  ): { command: string; logFilePathUrl: string } {
    if (!payload.logToFile) {
      return { command, logFilePathUrl: "" };
    }

    const logFilePathUrl =
      payload.logFilePath || `${os.tmpdir()}/ansible-creator.log`;
    let updated = command;
    updated += ` --lf=${logFilePathUrl}`;
    updated += ` --ll=${payload.logLevel.toLowerCase()}`;

    if (isCollection) {
      updated += ` --la=${payload.logFileAppend}`;
    } else {
      updated += ` --la=${payload.logFileAppend ? "true" : "false"}`;
    }

    return { command: updated, logFilePathUrl };
  }

  // Runs the ansible-dev-environment editable-mode install for a collection and
  // returns the log output to append to the overall command output.
  private async runAdeEditableInstall(
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    destinationUrl: string,
    logFilePathUrl: string,
    extSettings: SettingsManager,
    webView: vscode.Webview,
  ): Promise<string> {
    let commandOutput = "";
    const venvPathUrl = Uri.joinPath(Uri.parse(destinationUrl), ".venv").fsPath;
    let adeCommand = `cd ${destinationUrl} && ade install --venv ${venvPathUrl} --editable . --no-ansi`;
    adeCommand += this.getVerbosityFlag(payload.verbosity);

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
    });
    const adeVersion = await getADEVersion();
    const adeVersionCheck = this.checkVersionWithError(
      adeVersion,
      ADE_ISOLATION_MODE_MIN,
    );
    const exceedADEImVersion = adeVersionCheck.isGte;

    if (exceedADEImVersion) {
      adeCommand += " --im=cfg";
      const { command, env } = await withInterpreter(
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
    return commandOutput;
  }

  public async isADEPresent(webView: vscode.Webview) {
    const ADEVersion = await getBinDetail("ade", "--version");
    if (ADEVersion === "failed") {
      webView.postMessage({
        command: "ADEPresence",
        arguments: false,
      });
      console.debug(
        "ADE not found in the environment. Disabling ADE features.",
      );
      return;
    }
    webView.postMessage({
      command: "ADEPresence",
      arguments: true,
    });
    console.debug("ADE found in the environment. Enabling ADE features.");
    return;
  }

  public getCollectionCreatorCommand(
    namespaceName: string,
    collectionName: string,
    initPathUrl: string,
  ): string {
    return `ansible-creator init collection ${namespaceName}.${collectionName} ${initPathUrl} --no-ansi`;
  }

  public getPluginCreatorCommand(
    pluginName: string,
    pluginType: string,
    url: string,
  ): string {
    return `ansible-creator add plugin ${pluginType} ${pluginName} ${url} --no-ansi`;
  }

  public getPlaybookCreatorCommand(
    namespace: string,
    collection: string,
    url: string,
  ): string {
    return `ansible-creator init playbook ${namespace}.${collection} ${url} --no-ansi`;
  }
}
