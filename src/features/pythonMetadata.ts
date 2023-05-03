/* eslint-disable  @typescript-eslint/no-explicit-any */
import {
  ExtensionContext,
  window,
  MarkdownString,
  StatusBarItem,
  StatusBarAlignment,
} from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { TelemetryManager } from "../utils/telemetryUtils";
import { SettingsManager } from "../settings";
import { IInterpreterDetails, getInterpreterDetails } from "../python";
import { AnsibleCommands } from "../definitions/constants";
import { execSync } from "child_process";

export class PythonInterpreterManager {
  private context;
  private client;
  private cachedAnsibleVersion = "";
  private pythonInterpreterStatusBarItem: StatusBarItem;
  private telemetry: TelemetryManager;
  private extensionSettings: SettingsManager;

  constructor(
    context: ExtensionContext,
    client: LanguageClient,
    telemetry: TelemetryManager,
    extensionSettings: SettingsManager
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
      100
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
      true
    );
    this.pythonInterpreterStatusBarItem.show();

    if (this.extensionSettings.settings.interpreterPath) {
      const interpreterPath = this.extensionSettings.settings.interpreterPath;
      const label = this.makeLabelFromPath(interpreterPath);
      if (label) {
        this.pythonInterpreterStatusBarItem.text = label;
      }
    } else {
      const pythonExtensionDetails = await getInterpreterDetails();
      if (pythonExtensionDetails.path) {
        const label = this.makeLabelFromInterpreterDetails(
          pythonExtensionDetails
        );
        if (label) {
          this.pythonInterpreterStatusBarItem.text = label;
        }
      }
    }

    // add action to change the interpreter
    this.pythonInterpreterStatusBarItem.command =
      AnsibleCommands.ANSIBLE_PYTHON_SET_INTERPRETER;

    return;
  }

  public makeLabelFromInterpreterDetails(
    pythonInterpreterDetails: IInterpreterDetails
  ): string | undefined {
    const envLabel = `Python ${pythonInterpreterDetails.version} (${pythonInterpreterDetails.environment})`;
    return envLabel;
  }

  public makeLabelFromPath(interpreterPath: string): string | undefined {
    const version = execSync(`${interpreterPath} -V`).toString().trim();

    const sysPrefix = execSync(
      `${interpreterPath} -c "import sys;print(sys.prefix.split('/').pop())"`
    )
      .toString()
      .trim();

    const envLabel = `${version} (${sysPrefix})`;
    return envLabel;
  }
}
