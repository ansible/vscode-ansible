import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import { Connection } from "vscode-languageserver";
import { v4 as uuidv4 } from "uuid";
import { AnsibleConfig } from "./ansibleConfig";
import { ImagePuller } from "../utils/imagePuller";
import { asyncExec } from "../utils/misc";
import { WorkspaceFolderContext } from "./workspaceManager";
import {
  ExtensionSettings,
  IContainerEngine,
} from "../interfaces/extensionSettings";
import { IVolumeMounts } from "../interfaces/extensionSettings";

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
      if (!this.settings.executionEnvironment.enabled) {
        return;
      }
      this._container_image = this.settings.executionEnvironment.image;
      this._container_engine =
        this.settings.executionEnvironment.containerEngine;
      this._container_volume_mounts =
        this.settings.executionEnvironment.volumeMounts;

      const setEngineSuccess = this.setContainerEngine();
      if (setEngineSuccess === false) {
        this.isServiceInitialized = false;
        return;
      }

      this.updateContainerVolumeMountFromSettings();
      this.settingsContainerOptions =
        this.settings.executionEnvironment.containerOptions;

      const pullSuccess = await this.pullContainerImage();
      if (pullSuccess === false) {
        this.isServiceInitialized = false;
        return;
      }
    } catch (error) {
      if (error instanceof Error) {
        this.connection.window.showErrorMessage(error.message);
      } else {
        this.connection.console.error(
          `Exception in ExecutionEnvironment service: ${JSON.stringify(error)}`,
        );
      }
      this.isServiceInitialized = false;
    }
    this.isServiceInitialized = true;
  }

  public async fetchPluginDocs(ansibleConfig: AnsibleConfig): Promise<void> {
    if (!this.isServiceInitialized || !this._container_image) {
      this.connection.console.error(
        `ExecutionEnvironment service not correctly initialized. Failed to fetch plugin docs`,
      );
      return;
    }
    const containerName = `${this._container_image.replace(
      /[^a-z0-9]/gi,
      "_",
    )}`;
    let progressTracker;

    try {
      const containerImageIdCommand = `${this._container_engine} images ${this._container_image} --format="{{.ID}}" | head -n 1`;
      this.connection.console.log(containerImageIdCommand);
      this._container_image_id = child_process
        .execSync(containerImageIdCommand, {
          encoding: "utf-8",
        })
        .trim();
      const hostCacheBasePath = path.resolve(
        `${process.env.HOME}/.cache/ansible-language-server/${containerName}/${this._container_image_id}`,
      );

      const isContainerRunning = this.runContainer(containerName);
      if (!isContainerRunning) {
        return;
      }

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
        if (this.useProgressTracker) {
          progressTracker =
            await this.connection.window.createWorkDoneProgress();
        }
        if (progressTracker) {
          progressTracker.begin(
            "execution-environment",
            undefined,
            `Copy plugin docs from '${this._container_image} to host cache path`,
            true,
          );
        }
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
      this.connection.console.log(
        `Copied plugin paths by ExecutionEnvironment service: \n collections_paths: ${ansibleConfig.collections_paths} \n module_locations: ${ansibleConfig.module_locations}`,
      );
      // plugin cache successfully created
      fs.closeSync(
        fs.openSync(path.join(hostCacheBasePath, this.successFileMarker), "w+"),
      );
    } catch (error) {
      this.connection.window.showErrorMessage(
        `Exception in ExecutionEnvironment service while fetching docs: ${JSON.stringify(
          error,
        )}`,
      );
    } finally {
      if (progressTracker) {
        progressTracker.done();
      }
      this.cleanUpContainer(containerName);
    }
  }

  public wrapContainerArgs(
    command: string,
    mountPaths?: Set<string>,
  ): string | undefined {
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
    const workspaceFolderPath = URI.parse(
      this.context.workspaceFolder.uri,
    ).path;
    const containerCommand: Array<string> = [this._container_engine];
    containerCommand.push(...["run", "--rm"]);
    containerCommand.push(...["--workdir", workspaceFolderPath]);

    containerCommand.push(
      ...["-v", `${workspaceFolderPath}:${workspaceFolderPath}`],
    );

    // TODO: add condition to check file path exists or not
    for (const mountPath of mountPaths || []) {
      // push to array only if mount path is valid
      if (mountPath === "" || !fs.existsSync(mountPath)) {
        this.connection.console.error(
          `Volume mount source path '${mountPath}' does not exist. Ignoring this volume mount entry.`,
        );
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
      this.settingsVolumeMounts.forEach((volumeMount) => {
        if (containerCommand.includes(volumeMount)) {
          return;
        }
        containerCommand.push("-v", volumeMount);
      });
    }

    // handle Ansible environment variables
    for (const [envVarKey, envVarValue] of Object.entries(process.env)) {
      if (envVarKey.startsWith("ANSIBLE_")) {
        containerCommand.push("-e", `${envVarKey}=${envVarValue}`);
      }
    }
    // ensure output is parseable (no ANSI)
    containerCommand.push("-e", "ANSIBLE_FORCE_COLOR=0");

    if (this._container_engine === "podman") {
      // container namespace stuff
      containerCommand.push("--group-add=root");
      containerCommand.push("--ipc=host");

      // docker does not support this option
      containerCommand.push("--quiet");
    } else {
      if (process.getuid) {
        containerCommand.push(`--user=${process.getuid()}`);
      }
    }

    // handle container options setting from client
    if (this.settingsContainerOptions && this.settingsContainerOptions !== "") {
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
    containerCommand.push(`--name als_${uuidv4()}`);
    containerCommand.push(this._container_image);
    containerCommand.push(command);
    const generatedCommand = containerCommand.join(" ");
    this.connection.console.log(
      `container engine invocation: ${generatedCommand}`,
    );
    return generatedCommand;
  }

  private async pullContainerImage(): Promise<boolean> {
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
        } catch (error) {
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

  private cleanUpContainer(containerName: string): void {
    const cleanUpCommands = [
      `${this._container_engine} stop $(${this._container_engine} ps -q --filter "name=${containerName}")`,
      `${this._container_engine} rm $(${this._container_engine} container ls -aq -f 'name=${containerName}')`,
    ];

    if (!this.doesContainerNameExist(containerName)) {
      return;
    }
    for (const command of cleanUpCommands) {
      try {
        child_process.execSync(command, {
          cwd: URI.parse(this.context.workspaceFolder.uri).path,
        });
      } catch (error) {
        console.error(
          `Error detected while trying to stop the container ${containerName}: ${error}`,
        );
        // container already stopped and/or removed
        break;
      }
    }
  }

  private doesContainerNameExist(containerName: string): boolean {
    let containerNameExist = false;
    try {
      const result = child_process.spawnSync(
        `${this._container_engine} container ls -aq -f 'name=${containerName}'`,
        { shell: false },
      );
      containerNameExist = result.toString() !== "";
    } catch (error) {
      containerNameExist = false;
    }
    return containerNameExist;
  }

  private updateContainerVolumeMountFromSettings(): void {
    for (const volumeMounts of this._container_volume_mounts || []) {
      const fsSrcPath = volumeMounts.src;
      const fsDestPath = volumeMounts.dest;
      const options = volumeMounts.options;
      if (fsSrcPath === "" || !fs.existsSync(fsSrcPath)) {
        this.connection.console.error(
          `Volume mount source path '${fsSrcPath}' does not exist. Ignoring this volume mount entry.`,
        );
        continue;
      }
      if (fsDestPath === "") {
        this.connection.console.error(
          `Volume mount destination path '${fsDestPath}' not provided. Ignoring this volume mount entry.`,
        );
        continue;
      }

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
    const completeSearchPath = path.join(searchPath, pluginFolderPath);
    const command = `${this._container_engine} exec ${containerName} ls ${completeSearchPath}`;
    try {
      this.connection.console.info(`Executing command ${command}`);
      const result = child_process
        .execSync(command, {
          encoding: "utf-8",
        })
        .trim();
      return result.trim() !== "";
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
    // ensure container is not running
    this.cleanUpContainer(containerName);

    try {
      // Do not add '-t' option when running the containers as this causes stderr noise, such:
      // The input device is not a TTY. The --tty and--interactive flags might not work properly
      let command = `${this._container_engine} run -i --rm -d `;
      if (this.settingsVolumeMounts && this.settingsVolumeMounts.length > 0) {
        command += this.settingsVolumeMounts.join(" ");
      }

      // handle Ansible environment variables
      for (const [envVarKey, envVarValue] of Object.entries(process.env)) {
        if (envVarKey.startsWith("ANSIBLE_")) {
          command += ` -e ${envVarKey}=${envVarValue} `;
        }
      }
      command += ` -e ANSIBLE_FORCE_COLOR=0 `; // ensure output is parseable (no ANSI)
      if (
        this.settingsContainerOptions &&
        this.settingsContainerOptions !== ""
      ) {
        command += ` ${this.settingsContainerOptions} `;
      }
      command += ` --name ${containerName} ${this._container_image} bash`;

      this.connection.console.log(`run container with command '${command}'`);
      child_process.execSync(command, {
        encoding: "utf-8",
      });
    } catch (error) {
      this.connection.window.showErrorMessage(
        `Failed to initialize execution environment '${this._container_image}': ${error}`,
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
    const updatedHostDocPath: string[] = [];

    containerPluginPaths.forEach((srcPath) => {
      const destPath = path.join(hostPluginDocCacheBasePath, srcPath);
      if (fs.existsSync(destPath)) {
        updatedHostDocPath.push(destPath);
      } else {
        if (
          srcPath === "" ||
          !this.isPluginInPath(containerName, srcPath, searchKind)
        ) {
          return;
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
        asyncExec(copyCommand, {
          encoding: "utf-8",
        });

        updatedHostDocPath.push(destPath);
      }
    });

    return updatedHostDocPath;
  }

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

  private isPluginDocCacheValid(hostCacheBasePath: string) {
    const markerFilePath = path.join(hostCacheBasePath, this.successFileMarker);
    return fs.existsSync(markerFilePath);
  }

  public get getBasicContainerAndImageDetails() {
    return {
      containerEngine: this._container_engine,
      containerImage: this._container_image,
      containerImageId: this._container_image_id,
      containerVolumeMounts: this._container_volume_mounts,
    };
  }
}
