/* "stdlib" */
import * as vscode from "vscode";

/* local */
import { withInterpreter } from "./utils/commandRunner";
import { getContainerEngine } from "../utils/executionEnvironment";
import { AnsibleCommands } from "../definitions/constants";
import { registerCommandWithTelemetry } from "../utils/registerCommands";
import { TelemetryManager } from "../utils/telemetryUtils";
import { SettingsManager } from "../settings";

/**
 * A set of commands and context menu items for running Ansible playbooks using
 * `ansible-navigator run` and `ansible-playbook` commands.
 */
export class AnsiblePlaybookRunProvider {
  private extensionSettings: SettingsManager;
  private telemetry: TelemetryManager;

  constructor(
    private vsCodeExtCtx: vscode.ExtensionContext,
    extensionSettings: SettingsManager,
    telemetry: TelemetryManager,
  ) {
    this.extensionSettings = extensionSettings;
    this.telemetry = telemetry;
    this.configureCommands();
  }

  /**
   * Register a set of command callbacks for executing Ansible playbooks
   * within VS Code.
   */
  private configureCommands() {
    registerCommandWithTelemetry(
      this.vsCodeExtCtx,
      this.telemetry,
      AnsibleCommands.ANSIBLE_PLAYBOOK_RUN,
      (fileObj) => this.invokeViaAnsiblePlaybook(fileObj),
      false,
    );
    console.log('Added a "Run Ansible Playbook" command...');

    registerCommandWithTelemetry(
      this.vsCodeExtCtx,
      this.telemetry,
      AnsibleCommands.ANSIBLE_NAVIGATOR_RUN,
      (fileObj) => this.invokeViaAnsibleNavigator(fileObj),
      false,
    );

    console.log('Added a "Run with Ansible Navigator" command...');
  }

  private addEEArgs(commandLineArgs: string[]): void {
    const eeSettings = this.extensionSettings.settings.executionEnvironment;
    if (!eeSettings.enabled) {
      commandLineArgs.push("--ee false");
      return;
    }
    commandLineArgs.push("--ee true");
    commandLineArgs.push(
      `--ce ${getContainerEngine(eeSettings.containerEngine)}`,
    );
    commandLineArgs.push(`--eei ${eeSettings.image}`);
    if (eeSettings.containerOptions !== "") {
      commandLineArgs.push(`--co ${eeSettings.containerOptions}`);
    }
    eeSettings.volumeMounts.forEach((volumeMount) => {
      let mountPath = `${volumeMount.src}:${volumeMount.dest}`;
      if (volumeMount.options !== undefined) {
        mountPath += `:${volumeMount.options}`;
      }
      commandLineArgs.push(`--eev ${mountPath}`);
    });
  }

  /**
   * A property representing the `ansible-navigator` executable.
   */
  private get ansibleNavigatorExecutablePath(): string {
    return vscode.workspace.getConfiguration("ansible.ansibleNavigator").path;
  }

  /**
   * A property representing the `ansible-playbook` executable.
   */
  private get ansiblePlaybookExecutablePath(): string {
    return `${
      vscode.workspace.getConfiguration("ansible.ansible").path || "ansible"
    }-playbook`;
  }

  /**
   * A property representing the target terminal for running playbooks in.
   */
  private createTerminal(
    runEnv: NodeJS.ProcessEnv | undefined,
  ): vscode.Terminal {
    if (vscode.workspace.getConfiguration("ansible.ansible").reuseTerminal) {
      const reuse_terminal = vscode.window.terminals.find(
        (terminal) => terminal.name === "Ansible Terminal",
      );
      if (reuse_terminal) {
        return reuse_terminal as vscode.Terminal;
      }
    }
    const terminal = vscode.window.createTerminal({
      name: "Ansible Terminal",
      env: runEnv,
    });
    this.vsCodeExtCtx.subscriptions.push(terminal);
    this.vsCodeExtCtx.subscriptions.push(
      vscode.window.onDidCloseTerminal((term: vscode.Terminal) => {
        if (term !== terminal) {
          return;
        }
      }),
    );
    return terminal as vscode.Terminal;
  }

  /**
   * A helper method for executing commands in terminal.
   */
  private invokeInTerminal(cmd: string, runEnv: NodeJS.ProcessEnv | undefined) {
    const newTerminal = this.createTerminal(runEnv);
    newTerminal.show();
    newTerminal.sendText(cmd);
  }

  /**
   * A callback method for running `ansible-playbook` command.
   * @param fileObj - The file path to execute the command.
   */
  private async invokeViaAnsiblePlaybook(
    ...fileObj: vscode.Uri[] | undefined[]
  ): Promise<void> {
    const runExecutable = this.ansiblePlaybookExecutablePath;
    const playbookArguments =
      this.extensionSettings.settings.playbook.arguments;
    const commandLineArgs: string[] = [];
    const playbookFsPath = extractTargetFsPath(...fileObj);
    if (typeof playbookFsPath === "undefined") {
      vscode.window.showErrorMessage(
        `No Ansible playbook file has been specified to be executed with ansible-playbook.`,
      );
      return;
    }

    commandLineArgs.push(playbookArguments);

    // replace spaces in file name with escape sequence '\ '
    commandLineArgs.push(playbookFsPath.replace(/(\s)/, "\\ "));
    const cmdArgs = commandLineArgs.map((arg) => arg).join(" ");
    const [command, runEnv] = withInterpreter(
      this.extensionSettings.settings,
      runExecutable,
      cmdArgs,
    );

    console.debug(`Running command: ${command}`);
    this.invokeInTerminal(command, runEnv);
  }

  /**
   * A callback method for running `ansible-navigator run command`.
   * @param fileObj - The file path to execute the command.
   */
  private async invokeViaAnsibleNavigator(
    ...fileObj: vscode.Uri[] | undefined[]
  ): Promise<void> {
    const runExecutable = this.ansibleNavigatorExecutablePath;
    const commandLineArgs: string[] = [];
    const playbookFsPath = extractTargetFsPath(...fileObj);
    if (typeof playbookFsPath === "undefined") {
      vscode.window.showErrorMessage(
        `No Ansible playbook file has been specified to be executed with ansible-navigator run.`,
      );
      return;
    }
    commandLineArgs.push(playbookFsPath);

    this.addEEArgs(commandLineArgs);

    const cmdArgs = commandLineArgs.map((arg) => arg).join(" ");
    const runCmdArgs = `run ${cmdArgs}`;
    const [command, runEnv] = withInterpreter(
      this.extensionSettings.settings,
      runExecutable,
      runCmdArgs,
    );
    console.debug(`Running command: ${command}`);
    this.invokeInTerminal(command, runEnv);
  }
}

/**
 * A helper function for inferring selected file from the context.
 * @param priorityPathObjs - Target file path candidates.
 * @returns A path to the currently selected file.
 */
function extractTargetFsPath(
  ...priorityPathObjs: vscode.Uri[] | undefined[]
): string | undefined {
  const pathCandidates: vscode.Uri[] = [
    ...priorityPathObjs,
    vscode.window.activeTextEditor?.document.uri,
  ]
    .filter((p) => p instanceof vscode.Uri)
    .map((p) => <vscode.Uri>p)
    .filter((p) => p.scheme === "file");
  return pathCandidates[0]?.fsPath;
}
