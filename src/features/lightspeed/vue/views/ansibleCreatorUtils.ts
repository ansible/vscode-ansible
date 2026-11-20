import * as fs from "node:fs";
import * as os from "os";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  AnsibleCollectionFormInterface,
  AnsibleProjectFormInterface,
  RoleFormInterface,
  PluginFormInterface,
} from "@src/features/contentCreator/types";
import {
  expandPath,
  getCreatorVersion,
  getBinDetail,
  runCommandArgv,
} from "@src/features/contentCreator/utils";
import {
  checkAnsibleCreatorVersion,
  checkToolVersionWithError,
} from "@src/features/contentCreator/ansibleCreatorVersion";
import { withInterpreterArgv } from "@src/features/utils/commandRunner";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings";
import { SettingsManager } from "@src/settings";
import {
  ADE_ISOLATION_MODE_MIN,
  ANSIBLE_CREATOR_VERSION_MIN,
} from "@src/definitions/constants";

const PYTHON_ENV_FAILURE_OUTPUT =
  "Failed to resolve the Python environment for ansible-creator.\n" +
  "Please check your ansible.python.interpreterPath setting and try again.\n";

const ANSIBLE_CREATOR_EXECUTABLE = "ansible-creator";
const ADE_EXECUTABLE = "ade";

type ResolvedToolEnv = {
  executable: string;
  env: NodeJS.ProcessEnv;
};

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function isAnsibleCollectionsRoot(fsPath: string): boolean {
  const normalized = trimTrailingSlashes(path.normalize(fsPath));
  const parts = normalized
    .split(path.sep)
    .filter((segment) => segment.length > 0);
  return (
    parts.length >= 2 &&
    parts[parts.length - 2] === "collections" &&
    parts[parts.length - 1] === "ansible_collections"
  );
}

/** Resolve symlinks by walking up to the nearest existing ancestor. */
function resolveCanonicalPath(targetPath: string): string {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    const parent = path.dirname(targetPath);
    if (parent === targetPath) {
      return targetPath;
    }
    const resolvedParent = resolveCanonicalPath(parent);
    return path.join(resolvedParent, path.basename(targetPath));
  }
}

export class AnsibleCreatorOperations {
  private defaultCollectionsPath(): string {
    return path.join(
      os.homedir(),
      ".ansible",
      "collections",
      "ansible_collections",
    );
  }

  /**
   * Expand `~` and `$HOME`, then make the path absolute against the home
   * directory. `runCommand` executes with `cwd: os.homedir()`, so a relative
   * path and an `existsSync` check against the extension host cwd would
   * disagree.
   */
  private creatorPath(input: string): string {
    const pathInput = input.trim().length === 0 ? "" : input;
    const expanded = expandPath(pathInput);
    return path.isAbsolute(expanded)
      ? path.normalize(expanded)
      : path.resolve(os.homedir(), expanded);
  }

  private async postExecutionFailure(
    webView: vscode.Webview,
    commandOutput: string,
    urlPayload: Record<string, string | undefined>,
  ): Promise<void> {
    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput,
        ...urlPayload,
        status: "failed",
      },
    });
  }

  private async withInterpreterOrNotify(
    webView: vscode.Webview,
    urlPayload: Record<string, string | undefined>,
    settings: ExtensionSettings,
    runExecutable: string,
    cmdArgs: string[],
  ): Promise<{
    executable: string;
    args: string[];
    env: NodeJS.ProcessEnv;
  } | null> {
    try {
      return await withInterpreterArgv(settings, runExecutable, cmdArgs);
    } catch (error) {
      console.error(
        "[ansible-creator] Python environment resolution failed:",
        error instanceof Error ? error.message : error,
      );
      await this.postExecutionFailure(
        webView,
        PYTHON_ENV_FAILURE_OUTPUT,
        urlPayload,
      );
      return null;
    }
  }

  private async resolveToolEnv(
    settings: ExtensionSettings,
    executable: string,
  ): Promise<ResolvedToolEnv> {
    const resolved = await withInterpreterArgv(settings, executable, []);
    return { executable: resolved.executable, env: resolved.env };
  }

  private probeToolVersionWithEnv(toolEnv: ResolvedToolEnv): {
    version: string;
    status: string;
    output: string;
  } {
    const result = runCommandArgv(
      toolEnv.executable,
      ["--version"],
      toolEnv.env,
    );
    const version =
      result.status === "passed" ? result.output.trimEnd() : "failed";
    return { version, status: result.status, output: result.output };
  }

  private async discoverCreatorVersion(
    settings: ExtensionSettings | undefined,
    toolEnv: ResolvedToolEnv | undefined,
  ): Promise<string> {
    if (settings && toolEnv) {
      return this.probeToolVersionWithEnv(toolEnv).version;
    }
    if (settings) {
      const env = await this.resolveToolEnv(
        settings,
        ANSIBLE_CREATOR_EXECUTABLE,
      );
      return this.probeToolVersionWithEnv(env).version;
    }
    return getCreatorVersion();
  }

  private isCollectionScaffoldPresent(destinationUrl: string): boolean {
    return (
      fs.existsSync(path.join(destinationUrl, "galaxy.yml")) &&
      fs.existsSync(path.join(destinationUrl, "devfile.yaml"))
    );
  }

  private readGalaxyCollectionId(
    destinationUrl: string,
  ): { namespace: string; name: string } | null {
    const galaxyPath = path.join(destinationUrl, "galaxy.yml");
    if (!fs.existsSync(galaxyPath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(galaxyPath, "utf8");
      const namespace = /^namespace:\s*(\S+)/m.exec(content)?.[1];
      const name = /^name:\s*(\S+)/m.exec(content)?.[1];
      if (namespace && name) {
        return { namespace, name };
      }
    } catch (error) {
      console.error(
        "[ansible-creator] Failed to read galaxy.yml:",
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }

  private collectionScaffoldMatchesRequest(
    destinationUrl: string,
    namespaceName: string,
    collectionName: string,
  ): boolean {
    const collectionId = this.readGalaxyCollectionId(destinationUrl);
    if (!collectionId) {
      return false;
    }
    return (
      collectionId.namespace === namespaceName &&
      collectionId.name === collectionName
    );
  }

  private existingCollectionConflictMessage(
    destinationUrl: string,
    namespaceName: string,
    collectionName: string,
  ): string | null {
    if (!this.isCollectionScaffoldPresent(destinationUrl)) {
      return null;
    }
    if (
      this.collectionScaffoldMatchesRequest(
        destinationUrl,
        namespaceName,
        collectionName,
      )
    ) {
      return null;
    }
    const existing = this.readGalaxyCollectionId(destinationUrl);
    const existingLabel = existing
      ? `${existing.namespace}.${existing.name}`
      : "another collection";
    return (
      `The directory "${destinationUrl}" already contains collection ${existingLabel}.\n` +
      `It does not match the requested collection ${namespaceName}.${collectionName}.\n` +
      "Choose a different destination or enable overwrite to scaffold a new collection.\n"
    );
  }

  // Shared version gate: checks creator presence and minimum version, posts
  // the appropriate error to the webview and returns { passed: false } when
  // the gate fails. Callers early-return on !passed.
  private async checkCreatorVersionGate(
    webView: vscode.Webview,
    subject: string,
    urlPayload: Record<string, string | undefined>,
    settings?: ExtensionSettings,
  ): Promise<{ passed: boolean; creatorEnv?: ResolvedToolEnv }> {
    let creatorVersion: string;
    let creatorEnv: ResolvedToolEnv | undefined;
    try {
      if (settings) {
        creatorEnv = await this.resolveToolEnv(
          settings,
          ANSIBLE_CREATOR_EXECUTABLE,
        );
      }
      creatorVersion = await this.discoverCreatorVersion(settings, creatorEnv);
    } catch (error) {
      console.error(
        "[ansible-creator] Version discovery failed:",
        error instanceof Error ? error.message : error,
      );
      await this.postExecutionFailure(
        webView,
        PYTHON_ENV_FAILURE_OUTPUT,
        urlPayload,
      );
      return { passed: false };
    }

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

    const versionCheck = checkAnsibleCreatorVersion(
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

    return { passed: true, creatorEnv };
  }

  public getRoleCreatorCommand(roleName: string, url: string): string[] {
    return ["add", "resource", "role", roleName, url, "--no-ansi"];
  }

  // Runs an ansible-creator command through the interpreter, posts the
  // execution result to the webview. Shared by role-add, plugin-add flows.
  private async executeCreatorCommand(
    baseArgs: string[],
    isOverwritten: boolean,
    verbosity: string,
    webView: vscode.Webview,
    urlPayload: Record<string, string | undefined>,
    extSettings: SettingsManager,
    creatorEnv?: ResolvedToolEnv,
  ): Promise<void> {
    const cmdArgs = [...baseArgs];
    this.applyOverwriteFlag(cmdArgs, isOverwritten);
    this.appendVerbosityArgs(cmdArgs, verbosity);

    console.debug(
      "[ansible-creator] command: ",
      ANSIBLE_CREATOR_EXECUTABLE,
      cmdArgs.join(" "),
    );

    let result: { output: string; status: string };
    if (creatorEnv) {
      result = runCommandArgv(creatorEnv.executable, cmdArgs, creatorEnv.env);
    } else {
      const resolvedInterpreter = await this.withInterpreterOrNotify(
        webView,
        urlPayload,
        extSettings.settings,
        ANSIBLE_CREATOR_EXECUTABLE,
        cmdArgs,
      );
      if (!resolvedInterpreter) {
        return;
      }
      result = runCommandArgv(
        resolvedInterpreter.executable,
        resolvedInterpreter.args,
        resolvedInterpreter.env,
      );
    }
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

  // ansible-creator 26.2 add requires galaxy.yml in the destination directory.
  private collectionRootError(destinationPathUrl: string): string | null {
    if (fs.existsSync(path.join(destinationPathUrl, "galaxy.yml"))) {
      return null;
    }
    return (
      "ansible-creator add requires a collection directory that contains galaxy.yml.\n" +
      `The path "${destinationPathUrl}" is not a collection root.\n` +
      "Select the collection directory and try again.\n"
    );
  }

  // Shared flow for role-add and plugin-add: resolves the destination,
  // gates on the creator version, then builds and executes the command.
  private async runAddCommand(
    webView: vscode.Webview,
    subject: string,
    collectionPath: string,
    isOverwritten: boolean,
    verbosity: string,
    buildCommand: (url: string) => string[],
  ): Promise<void> {
    const destinationPathUrl = this.creatorPath(
      collectionPath || this.defaultCollectionsPath(),
    );
    const rootError = this.collectionRootError(destinationPathUrl);
    if (rootError) {
      await this.postExecutionFailure(webView, rootError, {
        projectUrl: destinationPathUrl,
      });
      return;
    }

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const gate = await this.checkCreatorVersionGate(
      webView,
      subject,
      {
        projectUrl: destinationPathUrl,
      },
      extSettings.settings,
    );
    if (!gate.passed) return;

    await this.executeCreatorCommand(
      buildCommand(destinationPathUrl),
      isOverwritten,
      verbosity,
      webView,
      { projectUrl: destinationPathUrl },
      extSettings,
      gate.creatorEnv,
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
    const cmdArgs = [...built.args];

    const extSettings = new SettingsManager();
    await extSettings.initialize();

    const collectionPayload = isCollection
      ? (payload as AnsibleCollectionFormInterface)
      : undefined;

    if (collectionPayload) {
      const conflict = this.existingCollectionConflictMessage(
        destinationUrl,
        collectionPayload.namespaceName,
        collectionPayload.collectionName,
      );
      if (conflict) {
        await this.postExecutionFailure(webView, conflict, {
          collectionUrl: destinationUrl,
        });
        return;
      }
    }

    const skipCreatorScaffold =
      isCollection &&
      collectionPayload !== undefined &&
      payload.isEditableModeInstall &&
      this.isCollectionScaffoldPresent(destinationUrl) &&
      this.collectionScaffoldMatchesRequest(
        destinationUrl,
        collectionPayload.namespaceName,
        collectionPayload.collectionName,
      );

    let gate: { passed: boolean; creatorEnv?: ResolvedToolEnv } = {
      passed: true,
    };
    if (!skipCreatorScaffold) {
      gate = await this.checkCreatorVersionGate(
        webView,
        "",
        {
          collectionUrl: isCollection ? destinationUrl : undefined,
          projectUrl: isCollection ? undefined : destinationUrl,
        },
        extSettings.settings,
      );
      if (!gate.passed) return;
    }

    let commandOutput = "";

    this.applyOverwriteFlag(cmdArgs, payload.isOverwritten);
    this.appendVerbosityArgs(cmdArgs, payload.verbosity);

    const logFilePathUrl = this.applyLogFileArgs(
      cmdArgs,
      payload,
      isCollection,
    );

    const initUrlPayload = {
      collectionUrl: isCollection ? destinationUrl : undefined,
      projectUrl: isCollection ? undefined : destinationUrl,
    };

    let ansibleCreatorCommandPassed = "passed";

    if (skipCreatorScaffold) {
      commandOutput +=
        "Existing collection scaffold detected; skipping ansible-creator init and running the editable install step only.\n";
    } else if (gate.creatorEnv) {
      const ansibleCreatorExecutionResult = runCommandArgv(
        gate.creatorEnv.executable,
        cmdArgs,
        gate.creatorEnv.env,
      );
      commandOutput += `------------------------------------------- ansible-creator logs ---------------------------------------------\n`;
      commandOutput += ansibleCreatorExecutionResult.output;
      ansibleCreatorCommandPassed = ansibleCreatorExecutionResult.status;
    } else {
      const resolvedInterpreter = await this.withInterpreterOrNotify(
        webView,
        initUrlPayload,
        extSettings.settings,
        ANSIBLE_CREATOR_EXECUTABLE,
        cmdArgs,
      );
      if (!resolvedInterpreter) {
        return;
      }
      const ansibleCreatorExecutionResult = runCommandArgv(
        resolvedInterpreter.executable,
        resolvedInterpreter.args,
        resolvedInterpreter.env,
      );
      commandOutput += `------------------------------------------- ansible-creator logs ---------------------------------------------\n`;
      commandOutput += ansibleCreatorExecutionResult.output;
      ansibleCreatorCommandPassed = ansibleCreatorExecutionResult.status;
    }

    let finalStatus = ansibleCreatorCommandPassed;

    // Execute ADE command for collections if needed
    if (
      isCollection &&
      payload.isEditableModeInstall &&
      ansibleCreatorCommandPassed === "passed"
    ) {
      const adeInstallResult = await this.runAdeEditableInstall(
        payload,
        destinationUrl,
        logFilePathUrl,
        extSettings,
        webView,
      );
      commandOutput += adeInstallResult.output;
      if (!adeInstallResult.succeeded) {
        finalStatus = "failed";
        commandOutput +=
          "\nCollection files are on disk. Fix the ADE issue above and submit the same form again to retry the editable install without re-scaffolding.\n";
        commandOutput +=
          "If a partial .venv directory was left behind, move or remove it before resubmitting so ADE can recreate the environment.\n";
        if (payload.isOverwritten) {
          commandOutput +=
            "Overwrite applies only to ansible-creator scaffolding; the editable install retry still skips re-scaffolding when the collection already exists.\n";
        }
      }
    }

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput: commandOutput,
        logFileUrl: logFilePathUrl,
        collectionUrl: isCollection ? destinationUrl : undefined,
        projectUrl: isCollection ? undefined : destinationUrl,
        status: finalStatus,
      },
    });
  }

  // Builds the base ansible-creator init command and resolves the destination
  // URL for either a collection or a project payload.
  private buildCreatorInitCommand(
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    isCollection: boolean,
  ): { args: string[]; destinationUrl: string } {
    if (isCollection) {
      const collectionPayload = payload as AnsibleCollectionFormInterface;
      const { namespaceName, collectionName, initPath } = collectionPayload;

      const initPathUrl = resolveCanonicalPath(
        this.creatorPath(initPath || this.defaultCollectionsPath()),
      );

      const args = this.getCollectionCreatorCommand(
        namespaceName,
        collectionName,
        initPathUrl,
      );

      // path.join, not Uri.parse: a Windows path such as
      // "C:\Users\a/.ansible/..." is parsed with scheme "C" and the drive
      // letter is dropped from fsPath.
      const destinationUrl = isAnsibleCollectionsRoot(initPathUrl)
        ? path.join(initPathUrl, namespaceName, collectionName)
        : initPathUrl;

      return { args, destinationUrl };
    }

    const projectPayload = payload as AnsibleProjectFormInterface;
    const { destinationPath, namespaceName, collectionName } = projectPayload;

    const destinationUrl = this.creatorPath(destinationPath || os.homedir());

    const args = this.getPlaybookCreatorCommand(
      namespaceName,
      collectionName,
      destinationUrl,
    );

    return { args, destinationUrl };
  }

  // Appends --overwrite or --no-overwrite. Callers reject creator versions
  // below ANSIBLE_CREATOR_VERSION_MIN before this runs.
  private applyOverwriteFlag(args: string[], isOverwritten: boolean): void {
    args.push(isOverwritten ? "--overwrite" : "--no-overwrite");
  }

  // Maps a verbosity level to its ansible-creator argv flags.
  private appendVerbosityArgs(args: string[], verbosity: string): void {
    const verbosityMap: Record<string, string> = {
      off: "",
      low: "-v",
      medium: "-vv",
      high: "-vvv",
    };
    const flag = verbosityMap[verbosity.toLowerCase()];
    if (flag) {
      args.push(flag);
    }
  }

  // Appends the log-file flags when logging to file is enabled and returns the
  // resolved log file path (empty when logging is disabled).
  private applyLogFileArgs(
    args: string[],
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    isCollection: boolean,
  ): string {
    if (!payload.logToFile) {
      return "";
    }

    const logFilePathUrl = this.creatorPath(
      payload.logFilePath || path.join(os.tmpdir(), "ansible-creator.log"),
    );
    args.push(
      `--lf=${logFilePathUrl}`,
      `--ll=${payload.logLevel.toLowerCase()}`,
    );

    if (isCollection) {
      args.push(`--la=${payload.logFileAppend}`);
    } else {
      args.push(`--la=${payload.logFileAppend ? "true" : "false"}`);
    }

    return logFilePathUrl;
  }

  // Runs the ansible-dev-environment editable-mode install for a collection and
  // returns the log output to append to the overall command output.
  private async runAdeEditableInstall(
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    destinationUrl: string,
    logFilePathUrl: string,
    extSettings: SettingsManager,
    webView: vscode.Webview,
  ): Promise<{ output: string; succeeded: boolean }> {
    let commandOutput = "";
    const venvPathUrl = path.join(destinationUrl, ".venv");
    const adeArgs = [
      "install",
      "--venv",
      venvPathUrl,
      "--editable",
      ".",
      "--no-ansi",
    ];
    this.appendVerbosityArgs(adeArgs, payload.verbosity);

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
    let adeVersion: string;
    let adeEnv: ResolvedToolEnv;
    try {
      adeEnv = await this.resolveToolEnv(extSettings.settings, ADE_EXECUTABLE);
      adeVersion = this.probeToolVersionWithEnv(adeEnv).version;
    } catch (error) {
      console.error(
        "[ade] Version discovery failed:",
        error instanceof Error ? error.message : error,
      );
      commandOutput += `${PYTHON_ENV_FAILURE_OUTPUT}\n`;
      return { output: commandOutput, succeeded: false };
    }

    if (!adeVersion || adeVersion === "failed") {
      commandOutput +=
        "ansible-dev-environment (ade) is not installed or not found in PATH.\n" +
        "Please install ade or select a Python environment where it is available, then try again.\n";
      return { output: commandOutput, succeeded: false };
    }

    const adeVersionCheck = checkToolVersionWithError(
      adeVersion,
      ADE_ISOLATION_MODE_MIN,
    );
    const exceedADEImVersion = adeVersionCheck.isGte;

    if (exceedADEImVersion) {
      adeArgs.push("--im=cfg");
      const adeExecutionResult = runCommandArgv(
        adeEnv.executable,
        adeArgs,
        adeEnv.env,
        destinationUrl,
      );
      commandOutput += adeExecutionResult.output;
      console.debug("[ade] command: ", ADE_EXECUTABLE, adeArgs.join(" "));
      return {
        output: commandOutput,
        succeeded: adeExecutionResult.status === "passed",
      };
    }

    commandOutput += `Collection could not be installed in editable mode.\n`;
    commandOutput += `The required version of ansible-dev-environment (ade) for editable mode (using --isolation-mode=cfg) is ${ADE_ISOLATION_MODE_MIN}.\n`;
    commandOutput += `The installed ade version on this system is ${adeVersion}\n`;
    commandOutput += `Please upgrade to the latest version of ade for this feature.`;
    console.debug("[ade] command: ", ADE_EXECUTABLE, adeArgs.join(" "));
    return { output: commandOutput, succeeded: false };
  }

  public async isADEPresent(webView: vscode.Webview) {
    let ADEVersion: string | Buffer;
    try {
      ADEVersion = await getBinDetail("ade", "--version");
    } catch (error) {
      console.error(
        "[ade] Presence check failed:",
        error instanceof Error ? error.message : error,
      );
      await webView.postMessage({
        command: "ADEPresence",
        arguments: false,
      });
      return;
    }
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
  ): string[] {
    return [
      "init",
      "collection",
      `${namespaceName}.${collectionName}`,
      initPathUrl,
      "--no-ansi",
    ];
  }

  public getPluginCreatorCommand(
    pluginName: string,
    pluginType: string,
    url: string,
  ): string[] {
    return ["add", "plugin", pluginType, pluginName, url, "--no-ansi"];
  }

  public getPlaybookCreatorCommand(
    namespace: string,
    collection: string,
    url: string,
  ): string[] {
    return ["init", "playbook", `${namespace}.${collection}`, url, "--no-ansi"];
  }
}
