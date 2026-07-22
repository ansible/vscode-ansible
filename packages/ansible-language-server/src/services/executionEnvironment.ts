import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "node:os";
import * as path from "path";
import { URI } from "vscode-uri";
import { Connection } from "vscode-languageserver";
import { v4 as uuidv4 } from "uuid";
import { AnsibleConfig } from "@src/services/ansibleConfig.js";
import { ImagePuller } from "@src/utils/imagePuller.js";
import {
  formatVolumeMountSpec,
  parseContainerOptions,
  splitCommandString,
  UnsafeContainerSettingError,
  validateContainerEngineSetting,
  validateExecutionEnvironmentSettings,
} from "@src/utils/containerCommandSafety.js";
import { asyncSpawn, spawnSyncWithResult } from "@src/utils/misc.js";
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
  private readonly successFileMarker = "SUCCESS";
  private settingsVolumeMounts: string[] = [];
  private settingsContainerOptions: string | undefined = undefined;
  private _container_engine: IContainerEngine | undefined = undefined;
  private _container_image: string | undefined = undefined;
  private _container_image_id: string | undefined = undefined;
  private _container_volume_mounts: Array<IVolumeMounts> | undefined =
    undefined;

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

      validateExecutionEnvironmentSettings(
        this.settings.executionEnvironment.containerOptions,
        this._container_volume_mounts || [],
        this._container_image,
      );

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
    } catch (error) {
      /* v8 ignore next 3 */
      if (error instanceof UnsafeContainerSettingError) {
        this.connection.window.showErrorMessage(error.message);
      } else if (error instanceof Error) {
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
    if (
      !this.isServiceInitialized ||
      !this._container_image ||
      !this._container_engine
    ) {
      this.connection.console.error(
        `ExecutionEnvironment service not correctly initialized. Failed to fetch plugin docs`,
      );
      return;
    }
    const containerEngine = this._container_engine;
    const containerName = this._container_image.replace(/[^a-z0-9]/gi, "_");
    let progressTracker;

    try {
      /* v8 ignore next 11 */
      const imageIdArgv = ["images", this._container_image, "--format={{.ID}}"];
      this.connection.console.log(
        `${containerEngine} ${imageIdArgv.join(" ")}`,
      );
      const imageIdResult = spawnSyncWithResult(containerEngine, imageIdArgv);
      this._container_image_id =
        imageIdResult.stdout
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line !== "") ?? "";
      const cacheBase =
        process.env.XDG_CACHE_HOME ||
        `${process.env.HOME || os.homedir()}/.cache`;
      const hostCacheBasePath = path.resolve(
        `${cacheBase}/ansible-language-server/${containerName}/${this._container_image_id}`,
      );

      /* v8 ignore next 3 */
      const isContainerRunning = this.runContainer(containerName);
      if (!isContainerRunning) {
        return;
      }

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
          `Cached plugin paths: \n collections_paths: ${ansibleConfig.collections_paths.join(", ")} \n module_locations: ${ansibleConfig.module_locations.join(", ")}`,
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
          `Identified plugin paths by AnsibleConfig service: \n collections_paths: ${ansibleConfig.collections_paths.join(", ")} \n module_locations: ${ansibleConfig.module_locations.join(", ")}`,
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
        `Copied plugin paths by ExecutionEnvironment service: \n collections_paths: ${ansibleConfig.collections_paths.join(", ")} \n module_locations: ${ansibleConfig.module_locations.join(", ")}`,
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
      /* v8 ignore next */
      this.cleanUpContainer(containerName);
    }
  }

  public wrapContainerArgs(
    command: string,
    mountPaths?: Set<string>,
  ): string[] | undefined {
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
    /* v8 ignore next 92 */
    const workspaceFolderPath = URI.parse(
      this.context.workspaceFolder.uri,
    ).path;
    const containerCommand: Array<string> = [this._container_engine];
    containerCommand.push(...["run", "--rm"]);
    containerCommand.push(...["--workdir", workspaceFolderPath]);

    containerCommand.push(
      ...["-v", `${workspaceFolderPath}:${workspaceFolderPath}`],
    );

    for (const mountPath of mountPaths || []) {
      // push to array only if mount path isn't an empty string, then let podman produce errors as needed
      if (mountPath === "") {
        continue;
      }

      const volumeMountPath = `${mountPath}:${mountPath}`;
      if (containerCommand.includes(volumeMountPath)) {
        continue;
      }
      containerCommand.push("-v", volumeMountPath);
    }

    // handle container volume mounts setting from client
    if (this.settingsVolumeMounts && this.settingsVolumeMounts.length > 0) {
      this.settingsVolumeMounts.forEach((volumeMountSpec) => {
        if (containerCommand.includes(volumeMountSpec)) {
          return;
        }
        containerCommand.push("-v", volumeMountSpec);
      });
    }

    // handle Ansible environment variables
    for (const [envVarKey, envVarValue] of Object.entries(process.env)) {
      if (envVarKey.startsWith("ANSIBLE_")) {
        containerCommand.push("-e", `${envVarKey}=${envVarValue}`);
      }
    }
    // ensure output is parsable (no ANSI)
    containerCommand.push("-e", "ANSIBLE_FORCE_COLOR=0");

    if (this._container_engine === "podman") {
      // container namespace stuff
      containerCommand.push("--group-add=root", "--ipc=host");

      // docker does not support this option
      containerCommand.push("--quiet");
    } else {
      if (process.getuid) {
        containerCommand.push(`--user=${process.getuid()}`);
      }
    }

    // handle container options setting from client
    if (this.settingsContainerOptions && this.settingsContainerOptions !== "") {
      const containerOptions = parseContainerOptions(
        this.settingsContainerOptions,
      );
      containerOptions.forEach((containerOption) => {
        if (containerCommand.includes(containerOption)) {
          return;
        }
        containerCommand.push(containerOption);
      });
    }
    containerCommand.push(
      "--name",
      `als_${uuidv4()}`,
      this._container_image,
      ...splitCommandString(command),
    );
    this.connection.console.log(
      `container engine invocation: ${containerCommand.join(" ")}`,
    );
    return containerCommand;
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

  private isExecutableAvailable(command: string): boolean {
    const result = child_process.spawnSync("which", [command], {
      encoding: "utf-8",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return result.status === 0;
  }

  private validateManualEngine(engine: string): boolean {
    /* v8 ignore next 14 */
    try {
      validateContainerEngineSetting(engine);
    } catch (error) {
      if (error instanceof Error) {
        this.connection.window.showErrorMessage(error.message);
      }
      return false;
    }
    if (!this.isExecutableAvailable(engine)) {
      this.connection.window.showErrorMessage(
        `Container engine '${engine}' not found.`,
      );
      return false;
    }
    return true;
  }

  private setContainerEngine(): boolean {
    /* v8 ignore next 24 */
    if (!this._container_engine) {
      this.connection.window.showErrorMessage(
        "Unable to setContainerEngine with incompletely initialized settings.",
      );
      return false;
    }

    if (this._container_engine === "auto") {
      for (const ce of ["podman", "docker"]) {
        if (!this.isExecutableAvailable(ce)) {
          this.connection.console.info(`Container engine '${ce}' not found`);
          continue;
        }
        this._container_engine = <IContainerEngine>ce;
        this.connection.console.log(`Container engine set to: '${ce}'`);
        break;
      }
    } else if (!this.validateManualEngine(this._container_engine)) {
      return false;
    }
    if (!["podman", "docker"].includes(this._container_engine)) {
      this.connection.window.showErrorMessage(
        "Valid container engine not found. Install either 'podman' or 'docker' if you want to use execution environment, if not disable Ansible extension execution environment setting.",
      );
      return false;
    }
    return true;
  }

  private getContainerIds(engine: string, args: string[]): string[] {
    /* v8 ignore next 10 */
    try {
      const result = child_process.spawnSync(engine, args, {
        encoding: "utf-8",
        shell: false,
      });
      return result.stdout
        .trim()
        .split("\n")
        .filter((id) => id.trim() !== "");
    } catch {
      return [];
    }
  }

  private runContainerCommand(
    engine: string,
    action: string,
    ids: string[],
    containerName: string,
    cwd: string,
  ): void {
    /* v8 ignore next 8 */
    try {
      child_process.spawnSync(engine, [action, ...ids], {
        cwd,
        shell: false,
      });
    } catch (error) {
      console.error(
        `Error detected while trying to ${action} the container ${containerName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private cleanUpContainer(containerName: string): void {
    /* v8 ignore next 18 */
    if (!this._container_engine) {
      return;
    }
    if (!this.doesContainerNameExist(containerName)) {
      return;
    }

    const engine = this._container_engine;
    const cwd = URI.parse(this.context.workspaceFolder.uri).path;

    const running = this.getContainerIds(engine, [
      "ps",
      "-q",
      "--filter",
      `name=${containerName}`,
    ]);
    if (running.length > 0) {
      this.runContainerCommand(engine, "stop", running, containerName, cwd);
    }

    const all = this.getContainerIds(engine, [
      "container",
      "ls",
      "-aq",
      "-f",
      `name=${containerName}`,
    ]);
    if (all.length > 0) {
      this.runContainerCommand(engine, "rm", all, containerName, cwd);
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
        ["container", "ls", "-aq", "-f", `name=${containerName}`],
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
      const mountPath = formatVolumeMountSpec(volumeMounts);
      if (this.settingsVolumeMounts.includes(mountPath)) {
        continue;
      }
      this.settingsVolumeMounts.push(mountPath);
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

  private runContainer(containerName: string): boolean {
    /* v8 ignore next 38 */
    if (!this._container_engine || !this._container_image) {
      return false;
    }
    const containerEngine = this._container_engine;
    const containerImage = this._container_image;

    // ensure container is not running
    this.cleanUpContainer(containerName);

    try {
      // Do not add '-t' option when running the containers as this causes stderr noise, such:
      // The input device is not a TTY. The --tty and--interactive flags might not work properly
      const runArgv: string[] = ["run", "-i", "--rm", "-d"];
      if (this.settingsVolumeMounts && this.settingsVolumeMounts.length > 0) {
        this.settingsVolumeMounts.forEach((volumeMountSpec) => {
          runArgv.push("-v", volumeMountSpec);
        });
      }

      // handle Ansible environment variables
      for (const [envVarKey, envVarValue] of Object.entries(process.env)) {
        if (envVarKey.startsWith("ANSIBLE_")) {
          runArgv.push("-e", `${envVarKey}=${envVarValue}`);
        }
      }
      runArgv.push("-e", "ANSIBLE_FORCE_COLOR=0"); // ensure output is parsable (no ANSI)
      if (
        this.settingsContainerOptions &&
        this.settingsContainerOptions !== ""
      ) {
        runArgv.push(...parseContainerOptions(this.settingsContainerOptions));
      }
      runArgv.push("--name", containerName, containerImage, "bash");

      this.connection.console.log(
        `run container with command '${containerEngine} ${runArgv.join(" ")}'`,
      );
      spawnSyncWithResult(containerEngine, runArgv);
    } catch (error) {
      this.connection.window.showErrorMessage(
        `Failed to initialize execution environment '${this._container_image}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
    return true;
  }

  private async copyPluginDocFiles(
    hostPluginDocCacheBasePath: string,
    containerName: string,
    containerPluginPaths: string[],
    searchKind: string,
  ): Promise<string[]> {
    /* v8 ignore next 33 */
    const updatedHostDocPath: string[] = [];
    const containerEngine = this._container_engine;
    if (!containerEngine) {
      return updatedHostDocPath;
    }

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
        const copyArgv = ["cp", `${containerName}:${srcPath}`, destPathFolder];
        this.connection.console.log(
          `Copying plugins from container to local cache path ${containerEngine} ${copyArgv.join(" ")}`,
        );
        await asyncSpawn(containerEngine, copyArgv);

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
