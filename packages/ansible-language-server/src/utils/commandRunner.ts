import * as os from "node:os";
import * as path from "node:path";
import { URI } from "vscode-uri";
import { Connection } from "vscode-languageserver";
import { withInterpreter, asyncExec, asyncSpawn } from "@src/utils/misc.js";
import { getAnsibleCommandExecPath } from "@src/utils/execPath.js";
import { WorkspaceFolderContext } from "@src/services/workspaceManager.js";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings.js";

interface PreparedCommand {
  command: string | string[] | undefined;
  env: NodeJS.ProcessEnv;
}

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
    const isEEEnabled = this.settings.executionEnvironment.enabled;
    const workspaceFolder = URI.parse(this.context.workspaceFolder.uri).fsPath;
    const currentWorkingDirectory = workingDirectory
      ? workingDirectory
      : workspaceFolder;
    const ansibleConfigPath = this.resolveConfigPath(workspaceFolder);
    const executablePath = this.resolveExecutablePath(executable, isEEEnabled);
    const interpreterPath = this.resolveInterpreterPath(
      workspaceFolder,
      isEEEnabled,
    );
    const preparedCommand = isEEEnabled
      ? await this.prepareExecutionEnvironmentCommand(
          executable,
          args,
          currentWorkingDirectory,
          mountPaths,
          ansibleConfigPath,
        )
      : this.prepareLocalCommand(
          executablePath,
          args,
          interpreterPath,
          ansibleConfigPath,
        );
    const { command, env } = preparedCommand;

    if (command === undefined) {
      return { stdout: "", stderr: "" };
    }
    const spawnOptions = {
      encoding: "utf-8" as const,
      cwd: currentWorkingDirectory,
      env,
      maxBuffer: 10 * 1000 * 1000,
    };

    if (Array.isArray(command)) {
      const [executable, ...args] = command;
      return asyncSpawn(executable, args, spawnOptions);
    }

    const result = await asyncExec(command, spawnOptions);

    return result;
  }

  private resolveExecutablePath(
    executable: string,
    isEEEnabled: boolean,
  ): string {
    if (!executable.startsWith("ansible") || isEEEnabled) {
      return executable;
    }
    return getAnsibleCommandExecPath(executable, this.settings);
  }

  private resolveInterpreterPath(
    workspaceFolder: string,
    isEEEnabled: boolean,
  ): string {
    if (isEEEnabled) {
      return "python3";
    }
    return this.settings.python.interpreterPath.replaceAll(
      "${workspaceFolder}",
      workspaceFolder,
    );
  }

  private prepareLocalCommand(
    executablePath: string,
    args: string,
    interpreterPath: string,
    ansibleConfigPath?: string,
  ): PreparedCommand {
    const result = withInterpreter(
      executablePath,
      args,
      interpreterPath,
      this.settings.python.activationScript,
    );
    return {
      command: result.command,
      env: {
        ...result.env,
        ...(ansibleConfigPath ? { ANSIBLE_CONFIG: ansibleConfigPath } : {}),
      },
    };
  }

  private async prepareExecutionEnvironmentCommand(
    executable: string,
    args: string,
    currentWorkingDirectory: string,
    mountPaths: Set<string> | undefined,
    ansibleConfigPath: string | undefined,
  ): Promise<PreparedCommand> {
    const executionEnvironment = await this.context.executionEnvironment;
    const effectiveMountPaths = mountPaths
      ? new Set(mountPaths)
      : new Set<string>([currentWorkingDirectory]);
    if (ansibleConfigPath) {
      effectiveMountPaths.add(path.dirname(ansibleConfigPath));
    }
    return {
      command: executionEnvironment.wrapContainerArgs(
        `${executable} ${args}`,
        effectiveMountPaths,
        ansibleConfigPath ? { ANSIBLE_CONFIG: ansibleConfigPath } : {},
      ),
      env: { ...process.env },
    };
  }

  private resolveConfigPath(workspaceFolder: string): string | undefined {
    const configuredPath = this.settings.config?.path?.trim();

    if (!configuredPath) {
      return undefined;
    }

    let resolvedPath = configuredPath;

    if (resolvedPath === "~") {
      resolvedPath = os.homedir();
    } else if (resolvedPath.startsWith("~/")) {
      resolvedPath = path.join(os.homedir(), resolvedPath.slice(2));
    }

    resolvedPath = resolvedPath.replaceAll(
      "${workspaceFolder}",
      workspaceFolder,
    );

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
