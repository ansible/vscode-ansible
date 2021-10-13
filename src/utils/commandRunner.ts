import { URI } from 'vscode-uri';
import { Connection } from 'vscode-languageserver';
import { withInterpreter, asyncExec } from './misc';
import { getAnsibleCommandExecPath } from './execPath';
import { WorkspaceFolderContext } from '../services/workspaceManager';
import { ExtensionSettings } from '../interfaces/extensionSettings';

export class CommandRunner {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private settings: ExtensionSettings;

  constructor(
    connection: Connection,
    context: WorkspaceFolderContext,
    settings: ExtensionSettings
  ) {
    this.connection = connection;
    this.context = context;
    this.settings = settings;
  }

  public async runCommand(
    executable: string,
    args: string,
    workingDirectory?: string,
    mountPaths?: Set<string>
  ): Promise<{
    stdout: string;
    stderr: string;
  }> {
    let executablePath: string;
    let command: string;
    let runEnv: NodeJS.ProcessEnv | undefined;
    const isEEEnabled = this.settings.executionEnvironment.enabled;
    const interpreterPath = isEEEnabled
      ? 'python3'
      : this.settings.python.interpreterPath;
    if (executable.startsWith('ansible')) {
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
        this.settings.python.activationScript
      );
    } else {
      // prepare command and env for execution environment run
      const executionEnvironment = await this.context.executionEnvironment;
      command = executionEnvironment.wrapContainerArgs(
        `${executable} ${args}`,
        mountPaths
      );
      runEnv = undefined;
    }

    const currentWorkingDirectory = workingDirectory
      ? workingDirectory
      : URI.parse(this.context.workspaceFolder.uri).path;
    const result = await asyncExec(command, {
      encoding: 'utf-8',
      cwd: currentWorkingDirectory,
      env: runEnv,
    });

    return result;
  }

  /**
   * A method to return the path to the provided executable
   * @param executable String representing the name of the executable
   * @returns Complete path of the executable (string) or undefined depending upon the presence of the executable
   */
  public async getExecutablePath(
    executable: string
  ): Promise<string> | undefined {
    try {
      const executablePath = await this.runCommand('which', executable);
      return executablePath.stdout.trim();
    } catch (error) {
      console.log(error);
    }

    try {
      const executablePath = await this.runCommand('whereis', executable);
      const outParts = executablePath.stdout.split(':');
      return outParts.length >= 2 ? outParts[1].trim() : undefined;
    } catch (error) {
      console.log(error);
    }
  }
}
