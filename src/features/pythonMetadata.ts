import {
  ExtensionContext,
  window,
  MarkdownString,
  StatusBarItem,
  StatusBarAlignment,
  ThemeColor,
} from "vscode";
import { TelemetryManager } from "@src/utils/telemetryUtils";
import { SettingsManager } from "@src/settings";
import { AnsibleCommands } from "@src/definitions/constants";
import { PythonEnvironmentService } from "@src/services/PythonEnvironmentService";

export class PythonInterpreterManager {
  private context;
  private pythonInterpreterStatusBarItem: StatusBarItem;
  private telemetry: TelemetryManager;
  private extensionSettings: SettingsManager;
  private pythonEnvService: PythonEnvironmentService;

  constructor(
    context: ExtensionContext,
    telemetry: TelemetryManager,
    extensionSettings: SettingsManager,
    pythonEnvService?: PythonEnvironmentService,
  ) {
    this.context = context;
    this.telemetry = telemetry;
    this.extensionSettings = extensionSettings;
    this.pythonEnvService =
      pythonEnvService || PythonEnvironmentService.getInstance();

    this.pythonInterpreterStatusBarItem = this.initialiseStatusBar();
  }

  private initialiseStatusBar(): StatusBarItem {
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
    this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
      ` Change environment `,
      true,
    );
    this.pythonInterpreterStatusBarItem.show();

    await this.pythonEnvService.initialize();

    // getEnvironment() checks the Python Envs API first, then falls back
    // to ansible.python.interpreterPath — so it works in all environments.
    const activeURI = window.activeTextEditor?.document.uri;
    const environment = await this.pythonEnvService.getEnvironment(activeURI);

    if (environment) {
      const displayName = environment.displayName || environment.name;
      this.pythonInterpreterStatusBarItem.text = displayName;
      this.pythonInterpreterStatusBarItem.backgroundColor = new ThemeColor(
        "statusBar.background",
      );

      const tooltipLines = [
        "#### Change environment",
        `**Name:** ${displayName}`,
      ];

      if (environment.version) {
        tooltipLines.push(`**Version:** ${environment.version}`);
      }

      if (environment.displayPath) {
        tooltipLines.push(`**Path:** ${environment.displayPath}`);
      }

      if (!this.pythonEnvService.isAvailable()) {
        tooltipLines.push(
          `*Using ansible.python.interpreterPath setting (Python Environments extension not available)*`,
        );
      }

      this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
        tooltipLines.join("\n\n"),
        true,
      );
    } else {
      this.pythonInterpreterStatusBarItem.text =
        "$(warning) No Python interpreter configured";
      this.pythonInterpreterStatusBarItem.backgroundColor = new ThemeColor(
        "statusBarItem.warningBackground",
      );
      this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
        "#### Configure Python Interpreter\n" +
          "Click to select a Python environment or set the interpreter path in settings.",
        true,
      );
    }

    this.pythonInterpreterStatusBarItem.command =
      AnsibleCommands.ANSIBLE_PYTHON_SET_INTERPRETER;

    return;
  }
}
