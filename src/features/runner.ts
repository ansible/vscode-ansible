/* "stdlib" */
import { existsSync } from "fs";
import * as vscode from "vscode";

/* local */
import { validateExecutionEnvironmentSettings } from "@src/utils/containerCommandSafety";
import { getContainerEngine } from "@src/utils/executionEnvironment";
import { AnsibleCommands } from "@src/definitions/constants";
import { registerCommandWithTelemetry } from "@src/utils/registerCommands";
import { TelemetryManager } from "@src/utils/telemetryUtils";
import { SettingsManager } from "@src/settings";
import { TerminalService } from "@src/services/TerminalService";

// eslint-disable-next-line no-control-regex
export const SHELL_METACHARACTERS_PATTERN = /[\x00\n\r$`;&|(){}<>!]/;

export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function validatePlaybookPath(fsPath: string): string | undefined {
  if (SHELL_METACHARACTERS_PATTERN.test(fsPath)) {
    return `Playbook path contains potentially unsafe characters and cannot be executed: ${fsPath}`;
  }
  if (!existsSync(fsPath)) {
    return `Playbook file does not exist: ${fsPath}`;
  }
  return undefined;
}

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
      (fileObj?: vscode.Uri) => this.invokeViaAnsiblePlaybook(fileObj),
      false,
    );
    console.log('Added a "Run Ansible Playbook" command...');

    registerCommandWithTelemetry(
      this.vsCodeExtCtx,
      this.telemetry,
      AnsibleCommands.ANSIBLE_NAVIGATOR_RUN,
      (fileObj?: vscode.Uri) => this.invokeViaAnsibleNavigator(fileObj),
      false,
    );

    console.log('Added a "Run with Ansible Navigator" command...');
  }

  private addEEArgs(commandLineArgs: string[]): boolean {
    const eeSettings = this.extensionSettings.settings.executionEnvironment;
    if (!eeSettings.enabled) {
      commandLineArgs.push("--ee false");
      return true;
    }
    try {
      validateExecutionEnvironmentSettings(
        eeSettings.containerOptions,
        eeSettings.volumeMounts,
        eeSettings.image,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Invalid execution environment settings.";
      vscode.window.showErrorMessage(message);
      return false;
    }
    commandLineArgs.push("--ee true");
    commandLineArgs.push("--pae false");
    commandLineArgs.push(
      `--ce ${getContainerEngine(eeSettings.containerEngine as string)}`,
    );
    commandLineArgs.push(`--eei ${shellQuote(eeSettings.image)}`);
    if (eeSettings.containerOptions !== "") {
      commandLineArgs.push(`--co ${shellQuote(eeSettings.containerOptions)}`);
    }
    eeSettings.volumeMounts.forEach((volumeMount) => {
      let mountPath = `${volumeMount.src}:${volumeMount.dest}`;
      if (volumeMount.options !== undefined) {
        mountPath += `:${volumeMount.options}`;
      }
      commandLineArgs.push(`--eev ${shellQuote(mountPath)}`);
    });
    return true;
  }

  /**
   * A property representing the `ansible-navigator` executable.
   */
  private get ansibleNavigatorExecutablePath(): string {
    return vscode.workspace.getConfiguration("ansible.ansibleNavigator")
      .path as string;
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
   * Create or reuse a terminal with Python environment activated.
   */
  private async getTerminal(): Promise<vscode.Terminal> {
    const reuseTerminal =
      vscode.workspace.getConfiguration("ansible.ansible").reuseTerminal;
    const terminalService = TerminalService.getInstance();

    const managed = await terminalService.createActivatedTerminal({
      name: "Ansible Terminal",
      reuseExisting: reuseTerminal,
    });

    this.vsCodeExtCtx.subscriptions.push(managed.terminal);
    return managed.terminal;
  }

  /**
   * A helper method for executing commands in terminal.
   */
  private async invokeInTerminal(cmd: string): Promise<void> {
    const terminal = await this.getTerminal();
    terminal.show();
    terminal.sendText(cmd);
  }

  /**
   * A callback method for running `ansible-playbook` command.
   * @param fileObj - The file path to execute the command.
   */
  private async invokeViaAnsiblePlaybook(fileObj?: vscode.Uri): Promise<void> {
    const runExecutable = this.ansiblePlaybookExecutablePath;
    const playbookArguments =
      this.extensionSettings.settings.playbook.arguments;
    const commandLineArgs: string[] = [];
    const playbookFsPath = extractTargetFsPath(fileObj);
    if (typeof playbookFsPath === "undefined") {
      vscode.window.showErrorMessage(
        `No Ansible playbook file has been specified to be executed with ansible-playbook.`,
      );
      return;
    }

    const validationError = validatePlaybookPath(playbookFsPath);
    if (validationError) {
      vscode.window.showErrorMessage(validationError);
      return;
    }

    commandLineArgs.push(playbookArguments);
    commandLineArgs.push(shellQuote(playbookFsPath));
    const cmdArgs = commandLineArgs.map((arg) => arg).join(" ");
    const command = `${runExecutable} ${cmdArgs}`;

    console.debug(`Running command: ${command}`);
    await this.invokeInTerminal(command);
  }

  /**
   * A callback method for running `ansible-navigator run command`.
   * @param fileObj - The file path to execute the command.
   */
  private async invokeViaAnsibleNavigator(fileObj?: vscode.Uri): Promise<void> {
    const runExecutable = this.ansibleNavigatorExecutablePath;
    const commandLineArgs: string[] = [];
    const playbookFsPath = extractTargetFsPath(fileObj);
    if (typeof playbookFsPath === "undefined") {
      vscode.window.showErrorMessage(
        `No Ansible playbook file has been specified to be executed with ansible-navigator run.`,
      );
      return;
    }

    const validationError = validatePlaybookPath(playbookFsPath);
    if (validationError) {
      vscode.window.showErrorMessage(validationError);
      return;
    }

    commandLineArgs.push(shellQuote(playbookFsPath));

    if (!this.addEEArgs(commandLineArgs)) {
      return;
    }

    const cmdArgs = commandLineArgs.map((arg) => arg).join(" ");
    const command = `${runExecutable} run ${cmdArgs}`;
    console.debug(`Running command: ${command}`);
    await this.invokeInTerminal(command);
  }
}

/**
 * A helper function for inferring selected file from the context.
 * @param priorityPathObjs - Target file path candidates.
 * @returns A path to the currently selected file.
 */
function extractTargetFsPath(
  ...priorityPathObjs: (vscode.Uri | undefined)[]
): string | undefined {
  const pathCandidates: vscode.Uri[] = [
    ...priorityPathObjs,
    vscode.window.activeTextEditor?.document.uri,
  ]
    .filter((p) => p instanceof vscode.Uri)
    .map((p) => p)
    .filter((p) => p.scheme === "file");
  return pathCandidates[0]?.fsPath;
}
