import {
  ExtensionContext,
  window,
  MarkdownString,
  StatusBarItem,
  StatusBarAlignment,
  ThemeColor,
  workspace,
} from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { TelemetryManager } from "../utils/telemetryUtils";
import { SettingsManager } from "../settings";
import { AnsibleCommands } from "../definitions/constants";
import { execSync } from "child_process";

export class PythonInterpreterManager {
  private context;
  private client;
  private pythonInterpreterStatusBarItem: StatusBarItem;
  private telemetry: TelemetryManager;
  private extensionSettings: SettingsManager;

  constructor(
    context: ExtensionContext,
    client: LanguageClient,
    telemetry: TelemetryManager,
    extensionSettings: SettingsManager,
  ) {
    this.context = context;
    this.client = client;
    this.telemetry = telemetry;
    this.extensionSettings = extensionSettings;

    this.pythonInterpreterStatusBarItem = this.initialiseStatusBar();
  }

  private initialiseStatusBar(): StatusBarItem {
    // create a new status bar item that we can manage
    const interpreterStatusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Right,
      100,
    );
    this.context.subscriptions.push(interpreterStatusBarItem);
    return interpreterStatusBarItem;
  }

  /**
   * Calls the 'updatePythonInfo' function to update the ansible metadata
   * in the statusbar hovering action
   */
  public async updatePythonInfoInStatusbar(): Promise<void> {
    if (window.activeTextEditor?.document.languageId !== "ansible") {
      this.pythonInterpreterStatusBarItem.hide();
      return;
    }

    await this.updatePythonInfo();
  }

  /**
   * Sends notification with active file uri as param to the server
   * and receives notification from the server with ansible meta data associated with the opened file as param
   */
  public async updatePythonInfo(): Promise<void> {
    if (!this.client.isRunning()) {
      return;
    }
    this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
      ` Change environment `,
      true,
    );
    this.pythonInterpreterStatusBarItem.show();

    let interpreterPath = this.extensionSettings.settings.interpreterPath;
    if (interpreterPath) {
      const activeURI = window.activeTextEditor?.document.uri;
      if (
        interpreterPath.includes("${workspaceFolder}") &&
        activeURI !== undefined
      ) {
        const workspaceFolder =
          workspace.getWorkspaceFolder(activeURI)?.uri.path;
        if (workspaceFolder !== undefined) {
          interpreterPath = interpreterPath.replace(
            "${workspaceFolder}",
            workspaceFolder,
          );
        } else {
          console.error(
            `Error getting workspace folder for ${activeURI.toString()} `,
          );
        }
      }
      const label = this.makeLabelFromPath(interpreterPath);
      if (label) {
        this.pythonInterpreterStatusBarItem.text = label;
        this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
          `#### Change environment\nCurrent python path: ${interpreterPath}`,
          true,
        );
        this.pythonInterpreterStatusBarItem.backgroundColor = "";
      } else {
        this.pythonInterpreterStatusBarItem.text = "Invalid python environment";
        this.pythonInterpreterStatusBarItem.backgroundColor = new ThemeColor(
          "statusBarItem.warningBackground",
        );
        console.error(
          `The specified python interpreter path in settings does not exist: ${interpreterPath} `,
        );
      }
    } else {
      this.pythonInterpreterStatusBarItem.text = "Select python environment";
      this.pythonInterpreterStatusBarItem.backgroundColor = new ThemeColor(
        "statusBarItem.warningBackground",
      );
    }

    // add action to change the interpreter
    this.pythonInterpreterStatusBarItem.command =
      AnsibleCommands.ANSIBLE_PYTHON_SET_INTERPRETER;

    return;
  }

  public makeLabelFromPath(interpreterPath: string): string | undefined {
    let version: string;
    try {
      version = execSync(`${interpreterPath} -V`).toString().trim();
    } catch (error) {
      console.error(
        `Error gathering python version from ${interpreterPath}: ${error}`,
      );
      return;
    }
    let envLabel: string = version;

    const pythonInVenv = execSync(
      `${interpreterPath} -c "import sys;in_venv = sys.prefix != sys.base_prefix;print(in_venv)"`,
    )
      .toString()
      .trim();

    const inVenv = pythonInVenv === "True";

    if (inVenv) {
      const sysPrefix = execSync(
        `${interpreterPath} -c "import sys;print(sys.prefix.split('/').pop())"`,
      )
        .toString()
        .trim();

      envLabel = `${version} (${sysPrefix})`;
    }

    return envLabel;
  }
}
