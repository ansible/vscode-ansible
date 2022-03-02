/* "stdlib" */
import * as vscode from 'vscode';


/**
 * A set of commands and context menu items for running Ansible playbooks using
 * `ansible-navigator run` and `ansible-playbook` commands.
 */
export class AnsiblePlaybookRunProvider {
  private disposableTerminal: vscode.Terminal | undefined;
  constructor(private vsCodeExtCtx: vscode.ExtensionContext) {
    // this.disposableTerminal = this.makeTerminal();
    this.configureCommands();
  }

  /**
     * Register a set of command callbacks for executing Ansible playbooks
     * within VS Code.
     */
  private configureCommands() {
    this.vsCodeExtCtx.subscriptions.push(
      vscode.commands.registerCommand(
        'extension.ansible-playbook.run',
        fileObj => this.makeCmdRunner()(fileObj),
      ),
    );
    console.debug('Added a "Run Ansible Playbook" command...');
    this.vsCodeExtCtx.subscriptions.push(
      vscode.commands.registerCommand(
        'extension.ansible-navigator.run',
        fileObj => this.makeCmdRunner(true)(fileObj),
      ),
    );
    console.debug('Added a "Run with Ansible Navigator" command...');
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
      const playbookFsPath = extractTargetFsPath(...fileObj);
      if (typeof playbookFsPath === 'undefined') {
        let tool_name = 'ansible-playbook';
        if (useNavigator) {
          tool_name = 'ansible-navigator';
        }
        vscode.window.showErrorMessage(
          `No Ansible playbook file has been specified to be executed with ${tool_name}.`
        );
        return;
      }
      console.debug(
        `Got a request to run ansible-${
          useNavigator
            ? 'navigator'
            : 'playbook'
        } against`,
        playbookFsPath,
      );
      runPlaybook([playbookFsPath]);
    };
  }

  /**
     * A property representing the `ansible-navigator` executable.
     */
  private get ansibleNavigatorExecutablePath(): string {
    return vscode.workspace
      .getConfiguration('ansible.ansibleNavigator').path;
  }

  /**
     * A property representing the `ansible-playbook` executable.
     */
  private get ansiblePlaybookExecutablePath(): string {
    return `${vscode.workspace
      .getConfiguration('ansible.ansible.path').path || 'ansible'  }-playbook`;
  }

  /**
     * A property representing the target terminal for running playbooks in.
     */
  private get terminal(): vscode.Terminal {
    if (typeof this.disposableTerminal === 'undefined') {
      const terminal = vscode.window.createTerminal('Ansible Terminal');
      this.vsCodeExtCtx.subscriptions.push(terminal);
      this.vsCodeExtCtx.subscriptions.push(
        vscode.window.onDidCloseTerminal(
          (term: vscode.Terminal) => {
            if (term !== terminal) {
              return;
            }
            this.disposableTerminal = undefined;
          }
        )
      );
      this.disposableTerminal = terminal;
    }
    return this.disposableTerminal as vscode.Terminal;
  }

  /**
     * A helper method for executing commands in terminal.
     */
  private invokeInTerminal(cmd: string) {
    this.terminal.show();
    this.terminal.sendText(cmd);
  }

  /**
     * A helper method for running `ansible-playbook`.
     * @param argv Arguments to the `ansible-playbook` command.
     */
  private invokeViaAnsiblePlaybook(argv: string[]) {
    const runExecutable = this.ansiblePlaybookExecutablePath;
    const cmdArgs = argv.map(arg => `'${arg}'`).join(' ');
    this.invokeInTerminal(`${runExecutable} ${cmdArgs}`);
  }

  /**
     * A helper method for running `ansible-navigator run`.
     * @param argv Arguments to the `ansible-navigator run` command.
     */
  private invokeViaAnsibleNavigator(argv: string[]) {
    const runExecutable = this.ansibleNavigatorExecutablePath;
    const cmdArgs = argv.map(arg => `'${arg}'`).join(' ');
    this.invokeInTerminal(`${runExecutable} run ${cmdArgs}`);
  }
}


/**
 * A helper function for inferring selected file from the context.
 * @param priorityPathObjs Target file path candidates.
 * @returns A path to the currently selected file.
 */
function extractTargetFsPath(...priorityPathObjs: vscode.Uri[] | undefined[]):
        string | undefined {
  const pathCandidates: vscode.Uri[] = [
    ...priorityPathObjs,
    vscode.window.activeTextEditor?.document.uri,
  ]
    .filter(p => p instanceof vscode.Uri)
    .map(p => <vscode.Uri>p)
    .filter(p => p.scheme === 'file');
  return pathCandidates[0]?.fsPath;
}
