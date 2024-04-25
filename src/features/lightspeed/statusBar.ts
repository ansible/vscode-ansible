import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAPI } from "./api";
import { SettingsManager } from "../../settings";
import {
  LightSpeedCommands,
  LIGHTSPEED_MODEL_DEFAULT,
  LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT,
} from "../../definitions/lightspeed";
import { getLoggedInUserDetails, getUserTypeLabel } from "./utils/webUtils";
import { lightSpeedManager } from "../../extension";
import { LightspeedUser } from "./lightspeedUser";

export class LightspeedStatusBar {
  private apiInstance: LightSpeedAPI;
  private lightspeedAuthenticatedUser: LightspeedUser;
  private context;
  public client;
  public settingsManager: SettingsManager;
  public statusBar: vscode.StatusBarItem;

  constructor(
    apiInstance: LightSpeedAPI,
    lightspeedAuthenticatedUser: LightspeedUser,
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
  ) {
    this.apiInstance = apiInstance;
    this.lightspeedAuthenticatedUser = lightspeedAuthenticatedUser;
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
      100,
    );
    lightSpeedStatusBarItem.command =
      LightSpeedCommands.LIGHTSPEED_STATUS_BAR_CLICK;
    lightSpeedStatusBarItem.text = LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT;
    this.getLightSpeedStatusBarText().then((text) => {
      lightSpeedStatusBarItem.text = text;
    });
    this.context.subscriptions.push(lightSpeedStatusBarItem);
    return lightSpeedStatusBarItem;
  }

  public async getLightSpeedStatusBarText(
    rhUserHasSeat?: boolean,
    rhOrgHasSubscription?: boolean,
  ): Promise<string> {
    if (rhUserHasSeat === undefined) {
      rhUserHasSeat = await this.lightspeedAuthenticatedUser.rhUserHasSeat();
    }
    if (rhOrgHasSubscription === undefined) {
      rhOrgHasSubscription =
        await this.lightspeedAuthenticatedUser.rhOrgHasSubscription();
    }
    return this.getLightSpeedStatusBarTextSync(
      rhOrgHasSubscription,
      rhUserHasSeat,
    );
  }

  private getLightSpeedStatusBarTextSync(
    rhUserHasSeat?: boolean,
    rhOrgHasSubscription?: boolean,
  ): string {
    const userTypeLabel = getUserTypeLabel(
      rhOrgHasSubscription,
      rhUserHasSeat,
    ).toLowerCase();
    return `Lightspeed (${userTypeLabel})`;
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
        "statusBarItem.prominentForeground",
      );
    } else {
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    }
    this.setLightSpeedStatusBarTooltip();
    this.statusBar.show();
  }

  public async updateLightSpeedStatusbar(): Promise<void> {
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

  public async setLightSpeedStatusBarTooltip(): Promise<void> {
    const userDetails =
      await this.lightspeedAuthenticatedUser.getLightspeedUserDetails(false);
    const statusBarInfo = getLoggedInUserDetails(userDetails);
    const userType = statusBarInfo.userInfo?.userType;
    const role = statusBarInfo.userInfo?.role;
    let mdString = "";
    if (userType !== undefined || role !== undefined) {
      mdString = `<h4>User Details:</h4>\n<hr>\n<ul>`;
      if (userType) {
        mdString += `<li>User Type: ${userType}</li>\n`;
      }
      if (role) {
        mdString += `<li>Role: ${role}</li>\n`;
      }
      mdString += `</ul>\n`;
    }
    const modelName =
      lightSpeedManager.settingsManager.settings.lightSpeedService.model;
    mdString += `<h4>Model Details:</h4>
                  <hr>
                  <ul>
                    <li>Model: ${modelName || LIGHTSPEED_MODEL_DEFAULT}</li>
                  </ul>\n`;

    const mdStringObj = new vscode.MarkdownString(mdString, true);
    mdStringObj.supportHtml = true;
    mdStringObj.isTrusted = true;

    lightSpeedManager.statusBarProvider.statusBar.tooltip = mdStringObj;
  }
}
