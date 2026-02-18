import {
  ExtensionContext,
  window,
  MarkdownString,
  StatusBarItem,
  StatusBarAlignment,
  ThemeColor,
} from "vscode";
import { TelemetryManager } from "../utils/telemetryUtils";
import { SettingsManager } from "../settings";
import { AnsibleCommands } from "../definitions/constants";
import { PythonEnvironmentService } from "../services/PythonEnvironmentService";

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
    this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
      ` Change environment `,
      true,
    );
    this.pythonInterpreterStatusBarItem.show();

    // Ensure service is initialized before checking availability
    await this.pythonEnvService.initialize();

    // Check if Python Environments extension API is available
    if (!this.pythonEnvService.isAvailable()) {
      this.pythonInterpreterStatusBarItem.text =
        "$(warning) Python Environments not configured";
      this.pythonInterpreterStatusBarItem.backgroundColor = new ThemeColor(
        "statusBarItem.warningBackground",
      );
      this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
        "#### Configure Python Environments\n" +
          "Click to install or enable the Python Environments extension for environment management.",
        true,
      );
      this.pythonInterpreterStatusBarItem.command =
        AnsibleCommands.ANSIBLE_PYTHON_SET_INTERPRETER;
      return;
    }

    // Get the current environment from the Python Environments API
    const activeURI = window.activeTextEditor?.document.uri;
    const environment = await this.pythonEnvService.getEnvironment(activeURI);

    if (environment) {
      // Display environment information
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

      this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
        tooltipLines.join("\n\n"),
        true,
      );
    } else {
      // No environment selected
      this.pythonInterpreterStatusBarItem.text = "Select python environment";
      this.pythonInterpreterStatusBarItem.backgroundColor = new ThemeColor(
        "statusBarItem.warningBackground",
      );
      this.pythonInterpreterStatusBarItem.tooltip = new MarkdownString(
        "#### Select Python Environment\n" +
          "Click to select a Python environment for this workspace.",
        true,
      );
    }

    // add action to change the interpreter
    this.pythonInterpreterStatusBarItem.command =
      AnsibleCommands.ANSIBLE_PYTHON_SET_INTERPRETER;

    return;
  }
}
