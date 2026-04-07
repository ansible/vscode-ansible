import * as child_process from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import { Connection } from "vscode-languageserver";
import { AnsibleConfig } from "@src/services/ansibleConfig.js";
import { ImagePuller } from "@src/utils/imagePuller.js";
import { asyncExec } from "@src/utils/misc.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import type {
  ExtensionSettings,
  IContainerEngine,
  IVolumeMounts,
} from "@src/interfaces/extensionSettings.js";

/* We are forced to ignore coverage because we can only measure it if we do
it on all 3 platforms: linux, macos, wsl. Currently macos runners do not
have podman/docker available. Once this is addressed please remove this coverage
ignore. Why this? Because we have auto-update enabled on vite for coverage
levels when they go up, so we do not have to rely on external systems like
codecov.io or sonarcloud.io to do this (proved unreliable over time).
*/
/* v8 ignore start */
export class ExecutionEnvironment {
  public isServiceInitialized: boolean = false;
  private settings: ExtensionSettings | undefined = undefined;
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private useProgressTracker = false;
  private successFileMarker = "SUCCESS";
  private settingsVolumeMounts: string[] = [];
  private settingsContainerOptions: string | undefined = undefined;
  private _container_engine: IContainerEngine | undefined = undefined;
  private _container_image: string | undefined = undefined;
  private _container_image_id: string | undefined = undefined;
  private _container_volume_mounts: Array<IVolumeMounts> | undefined =
    undefined;

  // Persistent container state
  private _persistentContainerName: string | undefined = undefined;
  private _isPersistentContainerRunning = false;
  private _lastHealthCheckTime = 0;
  private static readonly HEALTH_CHECK_INTERVAL_MS = 5000;

  // Command result cache for immutable queries (version checks, executable paths)
  private _commandCache: Map<string, { stdout: string; stderr: string }> =
    new Map();

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  public async initialize(): Promise<void> {
    try {
      this.settings = await this.context.documentSettings.get(
        this.context.workspaceFolder.uri,
      );
      /* v8 ignore next 4 */
      if (!this.settings.executionEnvironment.enabled) {
        this.isServiceInitialized = true;
        return;
      }
      this._container_image = this.settings.executionEnvironment.image;
      this._container_engine =
        this.settings.executionEnvironment.containerEngine;
      this._container_volume_mounts =
        this.settings.executionEnvironment.volumeMounts;

      const setEngineSuccess = this.setContainerEngine();
      /* v8 ignore next 4 */
      if (!setEngineSuccess) {
        this.isServiceInitialized = false;
        return;
      }

      /* v8 ignore next 3 */
      this.updateContainerVolumeMountFromSettings();
      this.settingsContainerOptions =
        this.settings.executionEnvironment.containerOptions;

      const pullSuccess = await this.pullContainerImage();
      /* v8 ignore next 4 */
      if (!pullSuccess) {
        this.isServiceInitialized = false;
        return;
      }

      const containerStarted = this.startPersistentContainer();
      /* v8 ignore next 4 */
      if (!containerStarted) {
        this.isServiceInitialized = false;
        return;
      }
    } catch (error) {
      /* v8 ignore next 3 */
      if (error instanceof Error) {
        this.connection.window.showErrorMessage(error.message);
      } else {
        /* v8 ignore next 3 */
        this.connection.console.error(
          `Exception in ExecutionEnvironment service: ${JSON.stringify(error)}`,
        );
      }
      /* v8 ignore next 2 */
      this.isServiceInitialized = false;
      return;
    }
    this.isServiceInitialized = true;
  }

  public async fetchPluginDocs(ansibleConfig: AnsibleConfig): Promise<void> {
    /* v8 ignore next 6 */
    if (!this.isServiceInitialized || !this._container_image) {
      this.connection.console.error(
        `ExecutionEnvironment service not correctly initialized. Failed to fetch plugin docs`,
      );
      return;
    }

    this.ensurePersistentContainerHealthy();

    if (!this._persistentContainerName || !this._isPersistentContainerRunning) {
      this.connection.console.error(
        "Persistent container is not running. Cannot fetch plugin docs.",
      );
      return;
    }

    const containerName = this._persistentContainerName;
    const imageSafeName = this._container_image.replace(/[^a-z0-9]/gi, "_");
    let progressTracker;

    try {
      /* v8 ignore next 11 */
      const containerImageIdCommand = `${this._container_engine} images ${this._container_image} --format="{{.ID}}" | head -n 1`;
      this.connection.console.log(containerImageIdCommand);
      this._container_image_id = child_process
        .execSync(containerImageIdCommand, {
          encoding: "utf-8",
        })
        .trim();
      const hostCacheBasePath = path.resolve(
        `${process.env.HOME}/.cache/ansible-language-server/${imageSafeName}/${this._container_image_id}`,
      );

      /* v8 ignore next 10 */
      if (this.isPluginDocCacheValid(hostCacheBasePath)) {
        ansibleConfig.collections_paths = this.updateCachePaths(
          ansibleConfig.collections_paths,
          hostCacheBasePath,
        );
        ansibleConfig.module_locations = this.updateCachePaths(
          ansibleConfig.module_locations,
          hostCacheBasePath,
        );

        this.connection.console.log(
          `Cached plugin paths: \n collections_paths: ${ansibleConfig.collections_paths} \n module_locations: ${ansibleConfig.module_locations}`,
        );
      } else {
        /* v8 ignore next 4 */
        if (this.useProgressTracker) {
          progressTracker =
            await this.connection.window.createWorkDoneProgress();
        }
        /* v8 ignore next 7 */
        if (progressTracker) {
          progressTracker.begin(
            "execution-environment",
            undefined,
            `Copy plugin docs from '${this._container_image} to host cache path`,
            true,
          );
        }
        /* v8 ignore next 38 */
        this.connection.console.log(
          `Identified plugin paths by AnsibleConfig service: \n collections_paths: ${ansibleConfig.collections_paths} \n module_locations: ${ansibleConfig.module_locations}`,
        );
        ansibleConfig.collections_paths = await this.copyPluginDocFiles(
          hostCacheBasePath,
          containerName,
          ansibleConfig.collections_paths,
          "ansible_collections",
        );

        const builtin_plugin_locations: string[] = [];
        ansibleConfig.module_locations.forEach((modulePath) => {
          const pluginsPathParts = modulePath.split(path.sep).slice(0, -1);
          if (pluginsPathParts.includes("site-packages")) {
            // ansible-config returns default builtin configured module path
            // as ``<python-path>/site-packages/ansible/modules`` to copy other plugins
            // to local cache strip the ``modules`` part from the path and append
            // ``plugins`` folder.
            pluginsPathParts.push("plugins");
          }
          builtin_plugin_locations.push(pluginsPathParts.join(path.sep));
        });
        // Copy builtin plugins
        await this.copyPluginDocFiles(
          hostCacheBasePath,
          containerName,
          builtin_plugin_locations,
          "/",
        );

        // Copy builtin modules
        ansibleConfig.module_locations = await this.copyPluginDocFiles(
          hostCacheBasePath,
          containerName,
          ansibleConfig.module_locations,
          "/",
        );
      }
      /* v8 ignore next 6 */
      this.connection.console.log(
        `Copied plugin paths by ExecutionEnvironment service: \n collections_paths: ${ansibleConfig.collections_paths} \n module_locations: ${ansibleConfig.module_locations}`,
      );
      // plugin cache successfully created
      fs.closeSync(
        fs.openSync(path.join(hostCacheBasePath, this.successFileMarker), "w+"),
      );
    } catch (error) {
      /* v8 ignore next 6 */
      this.connection.window.showErrorMessage(
        `Exception in ExecutionEnvironment service while fetching docs: ${JSON.stringify(
          error,
        )}`,
      );
    } finally {
      /* v8 ignore next 3 */
      if (progressTracker) {
        progressTracker.done();
      }
    }
  }

  /**
   * Execute a command inside the persistent background container via
   * `docker exec` / `podman exec`. This avoids the overhead of provisioning
   * a new container (namespace, overlayFS, veth pair) for every single
   * diagnostic or linting command.
   */ // cspell:ignore veth
  public execInContainer(command: string): string | undefined {
    /* v8 ignore next 10 */
    if (
      !this.isServiceInitialized ||
      !this._container_engine ||
      !this._container_image
    ) {
      this.connection.console.error(
        "ExecutionEnvironment service not correctly initialized.",
      );
      return undefined;
    }

    // Ensure the persistent container is still alive (restarts if dead)
    this.ensurePersistentContainerHealthy();

    if (!this._isPersistentContainerRunning || !this._persistentContainerName) {
      this.connection.console.error(
        "Persistent container is not running. Cannot execute command.",
      );
      return undefined;
    }

    const workspaceFolderPath = URI.parse(
      this.context.workspaceFolder.uri,
    ).path;
    const containerCommand: Array<string> = [this._container_engine];
    containerCommand.push("exec");
    containerCommand.push("--workdir", workspaceFolderPath);

    // Pass Ansible environment variables into the exec call
    for (const [envVarKey, envVarValue] of Object.entries(process.env)) {
      if (envVarKey.startsWith("ANSIBLE_")) {
        containerCommand.push("-e", `${envVarKey}=${envVarValue}`);
      }
    }
    containerCommand.push("-e", "ANSIBLE_FORCE_COLOR=0");

    containerCommand.push(this._persistentContainerName);
    containerCommand.push(command);

    const generatedCommand = containerCommand.join(" ");
    this.connection.console.log(
      `container exec invocation: ${generatedCommand}`,
    );
    return generatedCommand;
  }

  private async pullContainerImage(): Promise<boolean> {
    /* v8 ignore next 23 */
    if (!this._container_engine || !this._container_image || !this.settings) {
      this.connection.window.showErrorMessage(
        "Execution environment not properly initialized.",
      );
      return false;
    }
    const imagePuller = new ImagePuller(
      this.connection,
      this.context,
      this._container_engine,
      this._container_image,
      this.settings.executionEnvironment.pull.policy,
      this.settings.executionEnvironment.pull.arguments,
    );
    const setupDone = await imagePuller.setupImage();
    if (!setupDone) {
      this.connection.window.showErrorMessage(
        `Execution environment image '${this._container_image}' setup failed.
         For more details check output console logs for ansible-language-server`,
      );
      return false;
    }
    return true;
  }

  private setContainerEngine(): boolean {
    /* v8 ignore next 41 */
    if (!this._container_engine) {
      this.connection.window.showErrorMessage(
        "Unable to setContainerEngine with incompletely initialized settings.",
      );
      return false;
    }

    if (this._container_engine === "auto") {
      for (const ce of ["podman", "docker"]) {
        try {
          child_process.execSync(`command -v ${ce}`, {
            encoding: "utf-8",
          });
        } catch {
          this.connection.console.info(`Container engine '${ce}' not found`);
          continue;
        }
        this._container_engine = <IContainerEngine>ce;
        this.connection.console.log(`Container engine set to: '${ce}'`);
        break;
      }
    } else {
      try {
        child_process.execSync(`command -v ${this._container_engine}`, {
          encoding: "utf-8",
        });
      } catch (error) {
        this.connection.window.showErrorMessage(
          `Container engine '${this._container_engine}' not found. Failed with error '${error}'`,
        );
        return false;
      }
    }
    if (!["podman", "docker"].includes(this._container_engine)) {
      this.connection.window.showErrorMessage(
        "Valid container engine not found. Install either 'podman' or 'docker' if you want to use execution environment, if not disable Ansible extension execution environment setting.",
      );
      return false;
    }
    return true;
  }

  /**
   * Generate a deterministic container name for the workspace folder.
   * Uses a hash of the workspace folder URI so the name is stable across
   * language server restarts, enabling reconnection to existing containers.
   */
  private generatePersistentContainerName(): string {
    const workspaceUri = this.context.workspaceFolder.uri;
    const hash = crypto
      .createHash("sha256")
      .update(workspaceUri)
      .digest("hex")
      .substring(0, 12);
    return `als_persistent_${hash}`;
  }

  /**
   * Start a single persistent background container that will be reused for
   * all command execution via `docker exec` / `podman exec`.
   */
  private startPersistentContainer(): boolean {
    /* v8 ignore next 5 */
    if (!this._container_engine || !this._container_image) {
      this.connection.console.error(
        "Cannot start persistent container: engine or image not set.",
      );
      return false;
    }

    this._persistentContainerName = this.generatePersistentContainerName();

    // Check if a container with this name already exists (e.g., from a
    // previous language server session) and reuse it if healthy.
    if (this.doesContainerNameExist(this._persistentContainerName)) {
      if (this.isContainerRunning(this._persistentContainerName)) {
        this.connection.console.log(
          `Reusing existing persistent container '${this._persistentContainerName}'`,
        );
        this._isPersistentContainerRunning = true;
        this._lastHealthCheckTime = Date.now();
        return true;
      }
      // Container exists but is not running — remove it before starting fresh
      this.cleanUpContainer(this._persistentContainerName);
    }

    try {
      const workspaceFolderPath = URI.parse(
        this.context.workspaceFolder.uri,
      ).path;

      // Build the docker/podman run command for a long-lived background container.
      // Do not add '-t' option as it causes stderr noise about TTY.
      const containerCommand: Array<string> = [this._container_engine];
      containerCommand.push("run", "--rm", "-d");
      containerCommand.push("--workdir", workspaceFolderPath);

      // Mount workspace folder
      containerCommand.push(
        "-v",
        `${workspaceFolderPath}:${workspaceFolderPath}`,
      );

      // Mount configured volume mounts
      if (this.settingsVolumeMounts && this.settingsVolumeMounts.length > 0) {
        containerCommand.push(...this.settingsVolumeMounts);
      }

      // Handle Ansible environment variables
      for (const [envVarKey, envVarValue] of Object.entries(process.env)) {
        if (envVarKey.startsWith("ANSIBLE_")) {
          containerCommand.push("-e", `${envVarKey}=${envVarValue}`);
        }
      }
      containerCommand.push("-e", "ANSIBLE_FORCE_COLOR=0");

      if (this._container_engine === "podman") {
        containerCommand.push("--group-add=root");
        containerCommand.push("--ipc=host");
        containerCommand.push("--quiet");
      } else {
        if (process.getuid) {
          containerCommand.push(`--user=${process.getuid()}`);
        }
      }

      // Handle container options setting from client
      if (
        this.settingsContainerOptions &&
        this.settingsContainerOptions !== ""
      ) {
        const containerOptions = this.settingsContainerOptions.split(" ");
        containerOptions.forEach((containerOption) => {
          if (
            containerOption === "" ||
            containerCommand.includes(containerOption)
          ) {
            return;
          }
          containerCommand.push(containerOption);
        });
      }

      containerCommand.push("--name", this._persistentContainerName);
      containerCommand.push(this._container_image);
      // Keep the container alive indefinitely; docker exec is used for all commands.
      containerCommand.push("sleep", "infinity");

      const command = containerCommand.join(" ");
      this.connection.console.log(`Starting persistent container: ${command}`);
      child_process.execSync(command, { encoding: "utf-8" });

      // Verify the container is responsive
      const healthCheck = child_process.spawnSync(
        this._container_engine,
        ["exec", this._persistentContainerName, "echo", "ok"],
        { encoding: "utf-8", timeout: 10000, shell: false },
      );
      if (healthCheck.status !== 0) {
        this.connection.console.error(
          `Persistent container health check failed: ${healthCheck.stderr}`,
        );
        this.cleanUpContainer(this._persistentContainerName);
        return false;
      }

      this._isPersistentContainerRunning = true;
      this._lastHealthCheckTime = Date.now();
      this.connection.console.log(
        `Persistent container '${this._persistentContainerName}' started and healthy.`,
      );
      return true;
    } catch (error) {
      this.connection.window.showErrorMessage(
        `Failed to start persistent execution environment container '${this._container_image}': ${error}`,
      );
      this._isPersistentContainerRunning = false;
      return false;
    }
  }

  /**
   * Check if a named container is currently running (not just existing).
   */
  private isContainerRunning(containerName: string): boolean {
    if (!this._container_engine) {
      return false;
    }
    try {
      const result = child_process.spawnSync(
        this._container_engine,
        ["ps", "-q", "--filter", `name=^${containerName}$`],
        { encoding: "utf-8", shell: false },
      );
      return result.stdout.trim() !== "";
    } catch {
      return false;
    }
  }

  /**
   * Ensure the persistent container is still running. If it has died
   * (e.g., OOM kill, manual docker kill), restart it automatically.
   * The health check result is cached for HEALTH_CHECK_INTERVAL_MS to
   * avoid per-command overhead.
   */
  private ensurePersistentContainerHealthy(): void {
    if (!this._persistentContainerName || !this._container_engine) {
      return;
    }

    const now = Date.now();
    if (
      this._isPersistentContainerRunning &&
      now - this._lastHealthCheckTime <
        ExecutionEnvironment.HEALTH_CHECK_INTERVAL_MS
    ) {
      return; // Recent health check was OK, skip
    }

    const running = this.isContainerRunning(this._persistentContainerName);
    this._lastHealthCheckTime = now;

    if (running) {
      this._isPersistentContainerRunning = true;
      return;
    }

    // Container is dead — attempt restart
    this.connection.console.info(
      `Persistent container '${this._persistentContainerName}' is not running. Restarting...`,
    );
    this._isPersistentContainerRunning = false;
    this._commandCache.clear();
    this.startPersistentContainer();
  }

  /**
   * Stop and remove the persistent container. Called on language server
   * shutdown, configuration change, or workspace folder removal.
   */
  public dispose(): void {
    this._commandCache.clear();
    if (this._persistentContainerName) {
      this.connection.console.log(
        `Disposing persistent container '${this._persistentContainerName}'`,
      );
      this.cleanUpContainer(this._persistentContainerName);
      this._isPersistentContainerRunning = false;
      this._persistentContainerName = undefined;
    }
  }

  /**
   * Get a cached command result, or undefined if not cached.
   */
  public getCachedCommand(
    cacheKey: string,
  ): { stdout: string; stderr: string } | undefined {
    return this._commandCache.get(cacheKey);
  }

  /**
   * Cache the result of a command execution.
   */
  public setCachedCommand(
    cacheKey: string,
    result: { stdout: string; stderr: string },
  ): void {
    this._commandCache.set(cacheKey, result);
  }

  /**
   * Clear the command result cache (e.g., on configuration change).
   */
  public clearCommandCache(): void {
    this._commandCache.clear();
  }

  private cleanUpContainer(containerName: string): void {
    /* v8 ignore next 75 */
    if (!this._container_engine) {
      return;
    }

    if (!this.doesContainerNameExist(containerName)) {
      return;
    }

    const cwd = URI.parse(this.context.workspaceFolder.uri).path;

    let runningContainers: string;
    try {
      const result = child_process.spawnSync(
        this._container_engine,
        ["ps", "-q", "--filter", `name=^${containerName}$`],
        { encoding: "utf-8", shell: false },
      );
      runningContainers = result.stdout.trim();
    } catch {
      runningContainers = "";
    }

    // Stop running containers if any exist
    if (runningContainers) {
      try {
        const containerIds = runningContainers
          .split("\n")
          .filter((id) => id.trim() !== "");
        if (containerIds.length > 0) {
          child_process.spawnSync(
            this._container_engine,
            ["stop", ...containerIds],
            { cwd, shell: false },
          );
        }
      } catch (error) {
        console.error(
          `Error detected while trying to stop the container ${containerName}: ${error}`,
        );
      }
    }

    // Get all containers (including stopped ones) with the specified name
    let allContainers: string;
    try {
      const result = child_process.spawnSync(
        this._container_engine,
        ["container", "ls", "-aq", "-f", `name=^${containerName}$`],
        { encoding: "utf-8", shell: false },
      );
      allContainers = result.stdout.trim();
    } catch {
      allContainers = "";
    }

    // Remove containers if any exist
    if (allContainers) {
      try {
        const containerIds = allContainers
          .split("\n")
          .filter((id) => id.trim() !== "");
        if (containerIds.length > 0) {
          child_process.spawnSync(
            this._container_engine,
            ["rm", ...containerIds],
            { cwd, shell: false },
          );
        }
      } catch (error) {
        console.error(
          `Error detected while trying to remove the container ${containerName}: ${error}`,
        );
      }
    }
  }

  private doesContainerNameExist(containerName: string): boolean {
    /* v8 ignore next 16 */
    if (!this._container_engine) {
      return false;
    }

    let containerNameExist: boolean;
    try {
      const result = child_process.spawnSync(
        this._container_engine,
        ["container", "ls", "-aq", "-f", `name=^${containerName}$`],
        { encoding: "utf-8", shell: false },
      );
      containerNameExist = result.stdout.trim() !== "";
    } catch {
      containerNameExist = false;
    }
    return containerNameExist;
  }

  private updateContainerVolumeMountFromSettings(): void {
    /* v8 ignore next 16 */
    for (const volumeMounts of this._container_volume_mounts || []) {
      const fsSrcPath = volumeMounts.src;
      const fsDestPath = volumeMounts.dest;
      const options = volumeMounts.options;

      let mountPath = `${fsSrcPath}:${fsDestPath}`;
      if (options && options !== "") {
        mountPath += `:${options}`;
      }
      if (this.settingsVolumeMounts.includes(mountPath)) {
        continue;
      } else {
        this.settingsVolumeMounts.push("-v", mountPath);
      }
    }
  }

  private isPluginInPath(
    containerName: string,
    searchPath: string,
    pluginFolderPath: string,
  ): boolean {
    /* v8 ignore next 21 */
    const completeSearchPath = path.join(searchPath, pluginFolderPath);
    const engine = this._container_engine;
    if (!engine) {
      return false;
    }
    try {
      this.connection.console.info(
        `Executing command ${engine} exec ${containerName} ls ${completeSearchPath}`,
      );
      const result = child_process.spawnSync(
        engine,
        ["exec", containerName, "ls", completeSearchPath],
        {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
          shell: false,
        },
      );
      if (result.status !== 0) {
        return false;
      }
      return (result.stdout?.trim() ?? "") !== "";
    } catch (error) {
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = JSON.stringify(error);
      }
      this.connection.console.error(message);
      return false;
    }
  }

  private async copyPluginDocFiles(
    hostPluginDocCacheBasePath: string,
    containerName: string,
    containerPluginPaths: string[],
    searchKind: string,
  ): Promise<string[]> {
    /* v8 ignore next 33 */
    const updatedHostDocPath: string[] = [];

    for (const srcPath of containerPluginPaths) {
      const destPath = path.join(hostPluginDocCacheBasePath, srcPath);
      if (fs.existsSync(destPath)) {
        updatedHostDocPath.push(destPath);
      } else {
        if (
          srcPath === "" ||
          !this.isPluginInPath(containerName, srcPath, searchKind)
        ) {
          continue;
        }
        const destPathFolder = destPath
          .split(path.sep)
          .slice(0, -1)
          .join(path.sep);
        fs.mkdirSync(destPath, { recursive: true });
        const copyCommand = `${this._container_engine} cp ${containerName}:${srcPath} ${destPathFolder}`;
        this.connection.console.log(
          `Copying plugins from container to local cache path ${copyCommand}`,
        );
        await asyncExec(copyCommand, {
          encoding: "utf-8",
        });

        updatedHostDocPath.push(destPath);
      }
    }

    return updatedHostDocPath;
  }

  /* v8 ignore start */
  private updateCachePaths(
    pluginPaths: string[],
    cacheBasePath: string,
  ): string[] {
    const localCachePaths: string[] = [];
    pluginPaths.forEach((srcPath) => {
      const destPath = path.join(cacheBasePath, srcPath);
      if (fs.existsSync(destPath)) {
        localCachePaths.push(destPath);
      }
    });
    return localCachePaths;
  }
  /* v8 ignore end */

  /* v8 ignore start */
  private isPluginDocCacheValid(hostCacheBasePath: string) {
    const markerFilePath = path.join(hostCacheBasePath, this.successFileMarker);
    return fs.existsSync(markerFilePath);
  }
  /* v8 ignore end */

  /* v8 ignore start */
  public get getBasicContainerAndImageDetails() {
    return {
      containerEngine: this._container_engine,
      containerImage: this._container_image,
      containerImageId: this._container_image_id,
      containerVolumeMounts: this._container_volume_mounts,
    };
  }
  /* v8 ignore end */
}
