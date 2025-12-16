import * as vscode from "vscode";
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
  public settingsManager: SettingsManager;
  public statusBar: vscode.StatusBarItem;

  constructor(
    apiInstance: LightSpeedAPI,
    lightspeedAuthenticatedUser: LightspeedUser,
    context: vscode.ExtensionContext,
    settingsManager: SettingsManager,
  ) {
    this.apiInstance = apiInstance;
    this.lightspeedAuthenticatedUser = lightspeedAuthenticatedUser;
    this.context = context;
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
    this.context.subscriptions.push(lightSpeedStatusBarItem);
    return lightSpeedStatusBarItem;
  }

  public async getLightSpeedStatusBarText(): Promise<string> {
    const provider = this.settingsManager.settings.lightSpeedService.provider;

    // For LLM providers (not WCA), show provider name instead of login status
    if (provider && provider !== "wca") {
      // Capitalize first letter for display
      const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);
      return `Lightspeed (${displayName})`;
    }

    // For WCA, show login status
    const userDetails =
      await this.lightspeedAuthenticatedUser.getLightspeedUserDetails(false);
    if (!userDetails) {
      return LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT;
    }
    return this.getLightSpeedStatusBarTextSync(
      userDetails.rhOrgHasSubscription,
    );
  }

  private getLightSpeedStatusBarTextSync(
    rhOrgHasSubscription?: boolean,
  ): string {
    const userTypeLabel = getUserTypeLabel(rhOrgHasSubscription).toLowerCase();
    return `Lightspeed (${userTypeLabel})`;
  }

  private handleStatusBar() {
    try {
      this.getLightSpeedStatusBarText().then((text) => {
        this.statusBar.text = text;
        this.setLightSpeedStatusBarTooltip();
      });
    } catch (error) {
      console.log(
        `an error occurred updating status bar and tooltip: ${error}`,
      );
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
    if (!(await this.lightspeedAuthenticatedUser.isAuthenticated())) {
      vscode.commands.executeCommand(
        LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
      );
    }
  }

  public async setLightSpeedStatusBarTooltip(): Promise<void> {
    const userDetails =
      await this.lightspeedAuthenticatedUser.getLightspeedUserDetails(false);
    if (!userDetails) {
      return undefined;
    }
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
      lightSpeedManager.settingsManager.settings.lightSpeedService.modelName;
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
