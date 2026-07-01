import * as path from "path";
import { URI } from "vscode-uri";
import { Connection } from "vscode-languageserver";
import { withInterpreter, asyncExec, asyncSpawn } from "@src/utils/misc.js";
import { getAnsibleCommandExecPath } from "@src/utils/execPath.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";
import * as os from "node:os";

export class CommandRunner {
  private connection: Connection | undefined;
  private context: WorkspaceFolderContext;
  private settings: ExtensionSettings;

  constructor(
    connection: Connection | undefined,
    context: WorkspaceFolderContext,
    settings: ExtensionSettings,
  ) {
    this.connection = connection;
    this.context = context;
    this.settings = settings;
  }

  public async runCommand(
    executable: string,
    args: string,
    workingDirectory?: string,
    mountPaths?: Set<string>,
  ): Promise<{
    stdout: string;
    stderr: string;
  }> {
    let executablePath: string;
    let command: string | string[] | undefined;
    let runEnv: NodeJS.ProcessEnv;
    const isEEEnabled = this.settings.executionEnvironment.enabled;
    const workspaceFolder = URI.parse(this.context.workspaceFolder.uri).path;
    const currentWorkingDirectory = workingDirectory
      ? workingDirectory
      : workspaceFolder;
    const ansibleConfigPath = this.resolveConfigPath(workspaceFolder);
    let interpreterPathFromConfig = this.settings.python.interpreterPath;
    if (interpreterPathFromConfig.includes("${workspaceFolder}")) {
      interpreterPathFromConfig = interpreterPathFromConfig.replace(
        "${workspaceFolder}",
        workspaceFolder,
      );
    }

    const interpreterPath = isEEEnabled ? "python3" : interpreterPathFromConfig;
    if (executable.startsWith("ansible")) {
      executablePath = isEEEnabled
        ? executable
        : getAnsibleCommandExecPath(executable, this.settings);
    } else {
      executablePath = executable;
    }

    // prepare command and env for local run
    if (!isEEEnabled) {
      const result = withInterpreter(
        executablePath,
        args,
        interpreterPath,
        this.settings.python.activationScript,
      );
      command = result.command;
      runEnv = {
        ...result.env,
        ...(ansibleConfigPath ? { ANSIBLE_CONFIG: ansibleConfigPath } : {}),
      };
    } else {
      // prepare command and env for execution environment run
      const executionEnvironment = await this.context.executionEnvironment;
      const effectiveMountPaths = mountPaths
        ? new Set(mountPaths)
        : new Set<string>([currentWorkingDirectory]);
      if (ansibleConfigPath) {
        effectiveMountPaths.add(path.dirname(ansibleConfigPath));
      }
      command = executionEnvironment.wrapContainerArgs(
        `${executable} ${args}`,
        effectiveMountPaths,
        ansibleConfigPath ? { ANSIBLE_CONFIG: ansibleConfigPath } : undefined,
      );
      runEnv = { ...process.env };
    }
    if (command === undefined) {
      return { stdout: "", stderr: "" };
    }
    const spawnOptions = {
      encoding: "utf-8" as const,
      cwd: currentWorkingDirectory,
      env: runEnv,
      maxBuffer: 10 * 1000 * 1000,
    };

    if (Array.isArray(command)) {
      const [executable, ...args] = command;
      return asyncSpawn(executable, args, spawnOptions);
    }

    const result = await asyncExec(command, spawnOptions);

    return result;
  }

  private resolveConfigPath(workspaceFolder: string): string | undefined {
    const configuredPath = this.settings.config?.path?.trim();

    if (!configuredPath) {
      return undefined;
    }

    let resolvedPath = configuredPath;

    if (resolvedPath === "~" || resolvedPath.startsWith("~/")) {
      resolvedPath = path.join(os.homedir(), resolvedPath.slice(1));
    }

    if (resolvedPath.includes("${workspaceFolder}")) {
      resolvedPath = resolvedPath.replace(
        /\$\{workspaceFolder\}/g,
        workspaceFolder,
      );
    }

    if (!path.isAbsolute(resolvedPath)) {
      resolvedPath = path.resolve(workspaceFolder, resolvedPath);
    }

    return resolvedPath;
  }

  /**
   * A method to return the path to the provided executable
   * @param executable - String representing the name of the executable
   * @returns Complete path of the executable (string) or undefined depending upon the presence of the executable
   */
  public async getExecutablePath(
    executable: string,
  ): Promise<string | undefined> {
    try {
      const executablePath = await this.runCommand(
        "command",
        `-v ${executable}`,
      );
      return executablePath.stdout.trim();
    } catch (error) {
      console.log(error);
    }

    try {
      const executablePath = await this.runCommand("whereis", executable);
      const outParts = executablePath.stdout.split(":");
      return outParts.length >= 2 ? outParts[1].trim() : undefined;
    } catch (error) {
      console.log(error);
    }
  }
}
