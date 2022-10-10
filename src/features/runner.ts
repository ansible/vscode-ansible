/* "stdlib" */
import * as vscode from "vscode";

/* local */
import { withInterpreter } from "./utils/commandRunner";
import { ExtensionSettings } from "../interfaces/extensionSettings";
import { getContainerEngine } from "../utils/executionEnvironment";

/**
 * A set of commands and context menu items for running Ansible playbooks using
 * `ansible-navigator run` and `ansible-playbook` commands.
 */
export class AnsiblePlaybookRunProvider {
  private settings: ExtensionSettings;

  constructor(
    private vsCodeExtCtx: vscode.ExtensionContext,
    settings: ExtensionSettings
  ) {
    this.configureCommands();
    this.settings = settings;
  }

  /**
   * Register a set of command callbacks for executing Ansible playbooks
   * within VS Code.
   */
  private configureCommands() {
    this.vsCodeExtCtx.subscriptions.push(
      vscode.commands.registerCommand(
        "extension.ansible-playbook.run",
        (fileObj) => this.makeCmdRunner()(fileObj)
      )
    );
    console.log('Added a "Run Ansible Playbook" command...');
    this.vsCodeExtCtx.subscriptions.push(
      vscode.commands.registerCommand(
        "extension.ansible-navigator.run",
        (fileObj) => this.makeCmdRunner(true)(fileObj)
      )
    );
    console.log('Added a "Run with Ansible Navigator" command...');
  }

  /**
   * A factory method for creating an Ansible playbook runner.
   *
   * @param useNavigator A flag for preferring `ansible-navigator run`
   *                     over `ansible-playbook`.
   * @returns A callable for running a supplied playbook.
   */
  private makeCmdRunner(useNavigator = false) {
    const runPlaybook = useNavigator
      ? this.invokeViaAnsibleNavigator.bind(this)
      : this.invokeViaAnsiblePlaybook.bind(this);
    return (...fileObj: vscode.Uri[] | undefined[]) => {
      const commandLineArgs: string[] = [];
      const playbookFsPath = extractTargetFsPath(...fileObj);
      if (typeof playbookFsPath === "undefined") {
        let tool_name = "ansible-playbook";
        if (useNavigator) {
          tool_name = "ansible-navigator";
        }
        vscode.window.showErrorMessage(
          `No Ansible playbook file has been specified to be executed with ${tool_name}.`
        );
        return;
      }
      commandLineArgs.push(playbookFsPath);
      if (useNavigator) {
        this.addEEArgs(commandLineArgs);
      }
      console.debug(
        `Got a request to run ansible-${
          useNavigator ? "navigator" : "playbook"
        } against`,
        playbookFsPath
      );
      runPlaybook(commandLineArgs);
    };
  }

  private addEEArgs(commandLineArgs: string[]): void {
    const eeSettings = this.settings.executionEnvironment;
    if (!eeSettings.enabled) {
      return;
    }
    commandLineArgs.push("--ee true");
    commandLineArgs.push(
      `--ce ${getContainerEngine(eeSettings.containerEngine)}`
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
      vscode.workspace.getConfiguration("ansible.ansible.path").path ||
      "ansible"
    }-playbook`;
  }

  /**
   * A property representing the target terminal for running playbooks in.
   */
  private createTerminal(
    runEnv: NodeJS.ProcessEnv | undefined
  ): vscode.Terminal {
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
      })
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
   * A helper method for running `ansible-playbook`.
   * @param argv Arguments to the `ansible-playbook` command.
   */
  private invokeViaAnsiblePlaybook(argv: string[]) {
    let command: string;
    let runEnv: NodeJS.ProcessEnv | undefined;
    const runExecutable = this.ansiblePlaybookExecutablePath;
    const cmdArgs = argv.map((arg) => arg).join(" ");
    [command, runEnv] = withInterpreter(this.settings, runExecutable, cmdArgs);
    this.invokeInTerminal(command, runEnv);
  }

  /**
   * A helper method for running `ansible-navigator run`.
   * @param argv Arguments to the `ansible-navigator run` command.
   */
  private invokeViaAnsibleNavigator(argv: string[]) {
    let command: string;
    let runEnv: NodeJS.ProcessEnv | undefined;
    const runExecutable = this.ansibleNavigatorExecutablePath;
    const cmdArgs = argv.map((arg) => arg).join(" ");
    const runCmdArgs = `run ${cmdArgs}`;
    [command, runEnv] = withInterpreter(
      this.settings,
      runExecutable,
      runCmdArgs
    );
    this.invokeInTerminal(command, runEnv);
  }
}

/**
 * A helper function for inferring selected file from the context.
 * @param priorityPathObjs Target file path candidates.
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
