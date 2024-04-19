import { URI } from "vscode-uri";
import { Connection } from "vscode-languageserver";
import { withInterpreter, asyncExec } from "./misc";
import { getAnsibleCommandExecPath } from "./execPath";
import { WorkspaceFolderContext } from "../services/workspaceManager";
import { ExtensionSettings } from "../interfaces/extensionSettings";

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
    let command: string | undefined;
    let runEnv: NodeJS.ProcessEnv | undefined;
    const isEEEnabled = this.settings.executionEnvironment.enabled;
    let interpreterPathFromConfig = this.settings.python.interpreterPath;
    if (interpreterPathFromConfig.includes("${workspaceFolder}")) {
      const workspaceFolder = URI.parse(this.context.workspaceFolder.uri).path;
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
      [command, runEnv] = withInterpreter(
        executablePath,
        args,
        interpreterPath,
        this.settings.python.activationScript,
      );
    } else {
      // prepare command and env for execution environment run
      const executionEnvironment = await this.context.executionEnvironment;
      command = executionEnvironment.wrapContainerArgs(
        `${executable} ${args}`,
        mountPaths,
      );
      runEnv = undefined;
    }
    if (command === undefined) {
      return { stdout: "", stderr: "" };
    }

    const currentWorkingDirectory = workingDirectory
      ? workingDirectory
      : URI.parse(this.context.workspaceFolder.uri).path;
    const result = await asyncExec(command, {
      encoding: "utf-8",
      cwd: currentWorkingDirectory,
      env: runEnv,
      maxBuffer: 10 * 1000 * 1000,
    });

    return result;
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
