import * as fs from "node:fs";
import * as os from "os";
import * as path from "node:path";
import * as vscode from "vscode";
import { isAlias, isScalar, parseDocument, type Document } from "yaml";
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
  unresolvedEnvVarToken,
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
const ADE_INSTALL_FLAGS = [
  "--editable",
  "--no-ansi",
  "--im=cfg",
  "-vvv",
  "-vv",
  "-v",
  ".",
] as const;

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
    parts.at(-2) === "collections" &&
    parts.at(-1) === "ansible_collections"
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

  private unresolvedCreatorPathMessage(resolvedPath: string): string | null {
    const token = unresolvedEnvVarToken(resolvedPath);
    if (token === null) {
      return null;
    }
    return (
      `The destination path contains unresolved environment variable ${token}.\n` +
      "Enter a literal filesystem path and try again.\n"
    );
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
      fs.existsSync(path.join(destinationUrl, "devfile.yaml")) &&
      fs.existsSync(path.join(destinationUrl, "meta"))
    );
  }

  private resolveCollectionInitPaths(
    initPath: string,
    namespaceName: string,
    collectionName: string,
  ): { creatorInitPathUrl: string; destinationUrl: string } {
    const selectedInitPath =
      initPath.trim().length === 0 ? this.defaultCollectionsPath() : initPath;
    const initPathUrl = resolveCanonicalPath(
      this.creatorPath(selectedInitPath),
    );
    const destinationUrl = isAnsibleCollectionsRoot(initPathUrl)
      ? path.join(initPathUrl, namespaceName, collectionName)
      : initPathUrl;
    const creatorInitPathUrl = isAnsibleCollectionsRoot(initPathUrl)
      ? initPathUrl
      : destinationUrl;
    return { creatorInitPathUrl, destinationUrl };
  }

  private readGalaxyDocument(
    destinationUrl: string,
  ):
    | { kind: "missing" }
    | { kind: "invalid"; message: string }
    | { kind: "unknown" }
    | { kind: "ok"; namespace: string; name: string } {
    const galaxyPath = path.join(destinationUrl, "galaxy.yml");
    if (!fs.existsSync(galaxyPath)) {
      return { kind: "missing" };
    }
    try {
      const content = fs.readFileSync(galaxyPath, "utf8");
      const doc = parseDocument(content);
      if (doc.errors.length > 0) {
        const details = doc.errors
          .map((error) => error.message)
          .filter((message) => message.length > 0)
          .join("\n");
        return {
          kind: "invalid",
          message:
            `The file "${galaxyPath}" is invalid YAML and must be fixed before continuing.\n` +
            (details.length > 0 ? `${details}\n` : ""),
        };
      }
      const namespace = this.galaxyYamlString(doc, "namespace");
      const name = this.galaxyYamlString(doc, "name");
      if (namespace && name) {
        return { kind: "ok", namespace, name };
      }
    } catch (error) {
      console.error(
        "[ansible-creator] Failed to read galaxy.yml:",
        error instanceof Error ? error.message : error,
      );
    }
    return { kind: "unknown" };
  }

  private galaxyYamlString(doc: Document, key: string): string | null {
    const node = doc.get(key, true);
    const resolved = isAlias(node) ? node.resolve(doc) : node;
    if (isScalar(resolved) && typeof resolved.value === "string") {
      return resolved.value.length > 0 ? resolved.value : null;
    }
    return null;
  }

  private readGalaxyCollectionId(
    destinationUrl: string,
  ): { namespace: string; name: string } | null {
    const document = this.readGalaxyDocument(destinationUrl);
    if (document.kind !== "ok") {
      return null;
    }
    return { namespace: document.namespace, name: document.name };
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

  private conflictMessageFromGalaxyDocument(
    document: ReturnType<AnsibleCreatorOperations["readGalaxyDocument"]>,
    destinationUrl: string,
    namespaceName: string,
    collectionName: string,
  ): string | null {
    if (document.kind === "missing") {
      return null;
    }
    if (document.kind === "invalid") {
      return document.message;
    }
    if (
      document.kind === "ok" &&
      document.namespace === namespaceName &&
      document.name === collectionName
    ) {
      return null;
    }
    const existingLabel =
      document.kind === "ok"
        ? `${document.namespace}.${document.name}`
        : "another collection";
    return (
      `The directory "${destinationUrl}" already contains collection ${existingLabel}.\n` +
      `It does not match the requested collection ${namespaceName}.${collectionName}.\n` +
      "Choose a different destination. Overwrite cannot replace a different collection identity.\n"
    );
  }

  private existingCollectionConflictMessage(
    destinationUrl: string,
    namespaceName: string,
    collectionName: string,
  ): string | null {
    return this.conflictMessageFromGalaxyDocument(
      this.readGalaxyDocument(destinationUrl),
      destinationUrl,
      namespaceName,
      collectionName,
    );
  }

  private galaxyIdentityRequiredForAde(
    destinationUrl: string,
    namespaceName: string,
    collectionName: string,
  ): string | null {
    const document = this.readGalaxyDocument(destinationUrl);
    if (document.kind === "missing") {
      const galaxyPath = path.join(destinationUrl, "galaxy.yml");
      return (
        `The file "${galaxyPath}" is missing.\n` +
        `ADE cannot start until collection ${namespaceName}.${collectionName} exists at this destination.\n`
      );
    }
    return this.conflictMessageFromGalaxyDocument(
      document,
      destinationUrl,
      namespaceName,
      collectionName,
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
    const unresolvedPath =
      this.unresolvedCreatorPathMessage(destinationPathUrl);
    if (unresolvedPath) {
      await this.postExecutionFailure(webView, unresolvedPath, {
        projectUrl: destinationPathUrl,
      });
      return;
    }
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

    if (
      await this.postInitDestinationGuards(
        webView,
        isCollection,
        collectionPayload,
        destinationUrl,
      )
    ) {
      return;
    }

    const skipCreatorScaffold = this.shouldSkipCreatorScaffoldForEditableResume(
      collectionPayload,
      payload,
      destinationUrl,
    );

    let gate: { passed: boolean; creatorEnv?: ResolvedToolEnv } = {
      passed: true,
    };
    const initUrlPayload = this.buildInitUrlPayload(
      isCollection,
      destinationUrl,
    );
    if (!skipCreatorScaffold) {
      gate = await this.checkCreatorVersionGate(
        webView,
        "",
        initUrlPayload,
        extSettings.settings,
      );
      if (!gate.passed) {
        return;
      }
      if (
        await this.postCollectionConflictIfNeeded(
          webView,
          collectionPayload,
          destinationUrl,
        )
      ) {
        return;
      }
    }

    this.applyOverwriteFlag(cmdArgs, payload.isOverwritten);
    this.appendVerbosityArgs(cmdArgs, payload.verbosity);

    const logFilePathUrl = this.applyLogFileArgs(
      cmdArgs,
      payload,
      isCollection,
    );

    const creatorStep = await this.runCreatorInitStep(
      webView,
      skipCreatorScaffold,
      gate,
      initUrlPayload,
      extSettings.settings,
      cmdArgs,
    );
    if (creatorStep === null) {
      return;
    }

    let commandOutput = creatorStep.output;
    const { extraOutput, finalStatus } = await this.runEditableAdeIfNeeded(
      isCollection,
      payload,
      destinationUrl,
      logFilePathUrl,
      extSettings,
      webView,
      creatorStep.status,
    );
    commandOutput += extraOutput;

    await webView.postMessage({
      command: "execution-log",
      arguments: {
        commandOutput,
        logFileUrl: logFilePathUrl,
        ...initUrlPayload,
        status: finalStatus,
      },
    });
  }

  private async postInitDestinationGuards(
    webView: vscode.Webview,
    isCollection: boolean,
    collectionPayload: AnsibleCollectionFormInterface | undefined,
    destinationUrl: string,
  ): Promise<boolean> {
    const unresolvedPath = this.unresolvedCreatorPathMessage(destinationUrl);
    if (unresolvedPath) {
      await this.postExecutionFailure(webView, unresolvedPath, {
        collectionUrl: isCollection ? destinationUrl : undefined,
        projectUrl: isCollection ? undefined : destinationUrl,
      });
      return true;
    }
    if (collectionPayload?.isEditableModeInstall && /\s/.test(destinationUrl)) {
      await this.postExecutionFailure(
        webView,
        "ansible-dev-environment cannot install into a destination path that contains spaces.\n" +
          "Choose a destination without spaces and try again.\n",
        { collectionUrl: destinationUrl },
      );
      return true;
    }
    return this.postCollectionConflictIfNeeded(
      webView,
      collectionPayload,
      destinationUrl,
    );
  }

  private async postCollectionConflictIfNeeded(
    webView: vscode.Webview,
    collectionPayload: AnsibleCollectionFormInterface | undefined,
    destinationUrl: string,
  ): Promise<boolean> {
    if (!collectionPayload) {
      return false;
    }
    const conflict = this.existingCollectionConflictMessage(
      destinationUrl,
      collectionPayload.namespaceName,
      collectionPayload.collectionName,
    );
    if (!conflict) {
      return false;
    }
    await this.postExecutionFailure(webView, conflict, {
      collectionUrl: destinationUrl,
    });
    return true;
  }

  private shouldSkipCreatorScaffoldForEditableResume(
    collectionPayload: AnsibleCollectionFormInterface | undefined,
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    destinationUrl: string,
  ): boolean {
    if (!collectionPayload?.isEditableModeInstall) {
      return false;
    }
    if (payload.isOverwritten) {
      return false;
    }
    if (!this.isCollectionScaffoldPresent(destinationUrl)) {
      return false;
    }
    return this.collectionScaffoldMatchesRequest(
      destinationUrl,
      collectionPayload.namespaceName,
      collectionPayload.collectionName,
    );
  }

  private buildInitUrlPayload(
    isCollection: boolean,
    destinationUrl: string,
  ): Record<string, string | undefined> {
    return {
      collectionUrl: isCollection ? destinationUrl : undefined,
      projectUrl: isCollection ? undefined : destinationUrl,
    };
  }

  private async runCreatorInitStep(
    webView: vscode.Webview,
    skipCreatorScaffold: boolean,
    gate: { passed: boolean; creatorEnv?: ResolvedToolEnv },
    initUrlPayload: Record<string, string | undefined>,
    settings: ExtensionSettings,
    cmdArgs: string[],
  ): Promise<{ output: string; status: string } | null> {
    if (skipCreatorScaffold) {
      return {
        output:
          "Existing collection scaffold detected; skipping ansible-creator init and running the editable install step only.\n",
        status: "passed",
      };
    }
    if (gate.creatorEnv) {
      const result = runCommandArgv(
        gate.creatorEnv.executable,
        cmdArgs,
        gate.creatorEnv.env,
      );
      return {
        output: `------------------------------------------- ansible-creator logs ---------------------------------------------\n${result.output}`,
        status: result.status,
      };
    }
    const resolvedInterpreter = await this.withInterpreterOrNotify(
      webView,
      initUrlPayload,
      settings,
      ANSIBLE_CREATOR_EXECUTABLE,
      cmdArgs,
    );
    if (!resolvedInterpreter) {
      return null;
    }
    const result = runCommandArgv(
      resolvedInterpreter.executable,
      resolvedInterpreter.args,
      resolvedInterpreter.env,
    );
    return {
      output: `------------------------------------------- ansible-creator logs ---------------------------------------------\n${result.output}`,
      status: result.status,
    };
  }

  private adeEditableInstallSucceeded(
    output: string,
    execution: { exitCode?: number | null; status: string },
  ): boolean {
    if (execution.status === "passed") {
      return true;
    }
    if (execution.exitCode !== 2) {
      return false;
    }
    if (this.adeOutputHasFailureDiagnostic(output)) {
      return false;
    }
    return /Note:\s+All required system packages are installed/i.test(output);
  }

  private adeOutputHasFailureDiagnostic(output: string): boolean {
    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }
      // Node execFileSync prefixes non-zero exits with "Command failed: <argv>".
      // Fail closed unless the remainder is only an ADE install argv (a venv
      // path may contain ERROR). Extra text after argv is a real failure.
      const commandFailedMatch = /^Command failed:\s*/i.exec(line);
      if (commandFailedMatch) {
        const remainder = line.slice(commandFailedMatch[0].length).trim();
        if (this.adeCommandFailedRemainderIsBenign(remainder)) {
          continue;
        }
        return true;
      }
      if (this.adeLineHasExplicitFailureDiagnostic(line)) {
        return true;
      }
      if (/(^|\s)ERROR(\s|:|$)/.test(line)) {
        return true;
      }
    }
    return false;
  }

  private adeCommandFailedRemainderIsBenign(remainder: string): boolean {
    let rest = remainder.trim();
    if (rest.length === 0) {
      return true;
    }
    const stripped = this.stripLeadingAdeExecutable(rest);
    if (stripped === undefined) {
      return false;
    }
    rest = stripped;
    if (!this.consumePrefix(rest, "install")) {
      return false;
    }
    rest = rest.slice("install".length).trim();
    while (rest.length > 0) {
      if (this.consumePrefix(rest, "--venv")) {
        rest = rest.slice("--venv".length).trim();
        const nextFlag = this.nextAdeInstallFlagIndex(rest);
        if (nextFlag === 0) {
          return false;
        }
        if (nextFlag === -1) {
          return rest.length > 0;
        }
        rest = rest.slice(nextFlag).trim();
        continue;
      }
      const flag = this.leadingAdeInstallFlag(rest);
      if (flag === undefined) {
        return false;
      }
      rest = rest.slice(flag.length).trim();
    }
    return true;
  }

  private stripLeadingAdeExecutable(remainder: string): string | undefined {
    const lower = remainder.toLowerCase();
    const adeAt = lower.indexOf("ade ");
    if (adeAt === -1) {
      return undefined;
    }
    if (adeAt > 0) {
      const prefix = remainder.slice(0, adeAt);
      if (!prefix.endsWith("/") && !prefix.endsWith("\\")) {
        return undefined;
      }
      if (prefix.includes(" ") || prefix.includes("\t")) {
        return undefined;
      }
    }
    return remainder.slice(adeAt + "ade ".length).trim();
  }

  private consumePrefix(value: string, prefix: string): boolean {
    if (value.length < prefix.length) {
      return false;
    }
    if (value.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
      return false;
    }
    return (
      value.length === prefix.length ||
      value[prefix.length] === " " ||
      value[prefix.length] === "\t"
    );
  }

  private leadingAdeInstallFlag(rest: string): string | undefined {
    for (const flag of ADE_INSTALL_FLAGS) {
      if (this.consumePrefix(rest, flag)) {
        return flag;
      }
    }
    return undefined;
  }

  private nextAdeInstallFlagIndex(rest: string): number {
    let found = -1;
    for (const flag of ADE_INSTALL_FLAGS) {
      let from = 0;
      while (from < rest.length) {
        const idx = rest.toLowerCase().indexOf(flag.toLowerCase(), from);
        if (idx === -1) {
          break;
        }
        const beforeOk =
          idx === 0 || rest[idx - 1] === " " || rest[idx - 1] === "\t";
        const afterIdx = idx + flag.length;
        const afterOk =
          afterIdx === rest.length ||
          rest[afterIdx] === " " ||
          rest[afterIdx] === "\t";
        if (beforeOk && afterOk && (found === -1 || idx < found)) {
          found = idx;
          break;
        }
        from = idx + 1;
      }
    }
    return found;
  }

  private adeLineHasExplicitFailureDiagnostic(line: string): boolean {
    return (
      /\bError:\s/i.test(line) ||
      /^Traceback\b/i.test(line) ||
      /\bfailed to install\b/i.test(line) ||
      /\bNo such file\b/i.test(line) ||
      /\bcommand not found\b/i.test(line) ||
      /\bRequired system packages are missing\b/i.test(line) ||
      /\bMissing python dependencies\b/i.test(line) ||
      /\bFailed to install requirements\b/i.test(line)
    );
  }

  private buildAdeFailureRecoveryOutput(
    isOverwritten: boolean,
    namespaceName: string,
    collectionName: string,
  ): string {
    const adeCacheBuildDir = path.join(
      ".venv",
      ".ansible-dev-environment",
      `${namespaceName}.${collectionName}`,
      "build",
    );
    let recovery =
      "\nCollection files are on disk. Fix the ADE issue above and submit the same form again to retry the editable install without re-scaffolding.\n" +
      "If a partial .venv directory was left behind, move or remove it before resubmitting so ADE can recreate the environment.\n" +
      `If the collection version changed, remove leftover .tar.gz files from ADE's cache build directory (${adeCacheBuildDir}) or the build path ADE reported, then retry so ADE finds exactly one archive.\n`;
    if (isOverwritten) {
      recovery +=
        "Overwrite is enabled, so submitting this form again will re-run ansible-creator with --overwrite and can replace files you edited.\n" +
        "Disable overwrite, keep editable mode and the same collection details, then submit again to retry ADE without re-scaffolding.\n";
    }
    return recovery;
  }

  private async runEditableAdeIfNeeded(
    isCollection: boolean,
    payload: AnsibleCollectionFormInterface | AnsibleProjectFormInterface,
    destinationUrl: string,
    logFilePathUrl: string,
    extSettings: SettingsManager,
    webView: vscode.Webview,
    creatorStatus: string,
  ): Promise<{ extraOutput: string; finalStatus: string }> {
    let finalStatus = creatorStatus;
    let extraOutput = "";
    if (!isCollection || creatorStatus !== "passed") {
      return { extraOutput, finalStatus };
    }
    const collectionPayload = payload as AnsibleCollectionFormInterface;
    if (!collectionPayload.isEditableModeInstall) {
      return { extraOutput, finalStatus };
    }
    const adeInstallResult = await this.runAdeEditableInstall(
      collectionPayload,
      destinationUrl,
      logFilePathUrl,
      extSettings,
      webView,
    );
    extraOutput = adeInstallResult.output;
    if (!adeInstallResult.succeeded) {
      finalStatus = "failed";
      extraOutput += this.buildAdeFailureRecoveryOutput(
        collectionPayload.isOverwritten,
        collectionPayload.namespaceName,
        collectionPayload.collectionName,
      );
    }
    return { extraOutput, finalStatus };
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
      const { creatorInitPathUrl, destinationUrl } =
        this.resolveCollectionInitPaths(
          initPath,
          namespaceName,
          collectionName,
        );
      const args = this.getCollectionCreatorCommand(
        namespaceName,
        collectionName,
        creatorInitPathUrl,
      );
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
      const identityConflict = this.galaxyIdentityRequiredForAde(
        destinationUrl,
        payload.namespaceName,
        payload.collectionName,
      );
      if (identityConflict) {
        commandOutput += identityConflict;
        return { output: commandOutput, succeeded: false };
      }
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
        succeeded: this.adeEditableInstallSucceeded(
          adeExecutionResult.output,
          adeExecutionResult,
        ),
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
