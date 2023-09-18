import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAPI } from "./api";
import { SettingsManager } from "../../settings";
import { LightSpeedCommands } from "../../definitions/lightspeed";

export class LightspeedStatusBar {
  private apiInstance: LightSpeedAPI;
  private context;
  public client;
  public settingsManager: SettingsManager;
  public statusBar: vscode.StatusBarItem;

  constructor(
    apiInstance: LightSpeedAPI,
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager
  ) {
    this.apiInstance = apiInstance;
    this.context = context;
    this.client = client;
    this.settingsManager = settingsManager;
    // create a new project lightspeed status bar item that we can manage
    this.statusBar = this.initialiseStatusBar();
    this.updateLightSpeedStatusbar();
  }

  private initialiseStatusBar(): vscode.StatusBarItem {
    // create a new status bar item that we can manage
    const lightSpeedStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    lightSpeedStatusBarItem.command =
      LightSpeedCommands.LIGHTSPEED_STATUS_BAR_CLICK;
    lightSpeedStatusBarItem.text = "Lightspeed";
    this.context.subscriptions.push(lightSpeedStatusBarItem);
    return lightSpeedStatusBarItem;
  }

  private handleStatusBar() {
    if (!this.client.isRunning()) {
      return;
    }
    if (
      this.settingsManager.settings.lightSpeedService.enabled &&
      this.settingsManager.settings.lightSpeedService.suggestions.enabled
    ) {
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.prominentForeground"
      );
    } else {
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
    this.statusBar.show();
  }

  public updateLightSpeedStatusbar(): void {
    if (
      vscode.window.activeTextEditor?.document.languageId !== "ansible" ||
      !this.settingsManager.settings.lightSpeedService.enabled
    ) {
      this.statusBar.hide();
      return;
    }

    this.handleStatusBar();
  }

  public async lightSpeedStatusBarClickHandler() {
    vscode.commands.executeCommand(LightSpeedCommands.LIGHTSPEED_FEEDBACK);
  }
}
