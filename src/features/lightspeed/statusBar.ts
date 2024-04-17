import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAPI } from "./api";
import { SettingsManager } from "../../settings";
import {
  LightSpeedCommands,
  LIGHTSPEED_MODEL_DEFAULT,
  LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT,
} from "../../definitions/lightspeed";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";
import { LightspeedAuthSession } from "../../interfaces/lightspeed";
import {
  ANSIBLE_LIGHTSPEED_AUTH_ID,
  getLoggedInSessionDetails,
  getUserTypeLabel,
} from "./utils/webUtils";
import { lightSpeedManager } from "../../extension";
import { LightspeedNoLocalSession } from "./base";

export class LightspeedStatusBar {
  private apiInstance: LightSpeedAPI;
  private lightSpeedAuthenticationProvider: LightSpeedAuthenticationProvider;
  private context;
  public client;
  public settingsManager: SettingsManager;
  public statusBar: vscode.StatusBarItem;

  constructor(
    apiInstance: LightSpeedAPI,
    lightSpeedAuthenticationProvider: LightSpeedAuthenticationProvider,
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
  ) {
    this.apiInstance = apiInstance;
    this.lightSpeedAuthenticationProvider = lightSpeedAuthenticationProvider;
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

    this.context.subscriptions.push(lightSpeedStatusBarItem);
    return lightSpeedStatusBarItem;
  }

  public async getLightSpeedStatusBarText(): Promise<string> {
    try {
      const rhUserHasSeat =
        await this.lightSpeedAuthenticationProvider.rhUserHasSeat();
      const rhOrgHasSubscription =
        await this.lightSpeedAuthenticationProvider.rhOrgHasSubscription();
      return this.getLightSpeedStatusBarTextSync(
        rhOrgHasSubscription,
        rhUserHasSeat,
      );
    } catch (error) {
      if (error instanceof LightspeedNoLocalSession) {
        return "Lightspeed (Not logged in)";
      } else {
        console.log(error);
      }
    }
    return "Lightspeed (Not logged in)";
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

    if (this.lightSpeedAuthenticationProvider.userIsConnected) {
      try {
        this.getLightSpeedStatusBarText().then((text) => {
          this.statusBar.text = text;
        });
        this.setLightSpeedStatusBarTooltip();
      } catch (error) {
        console.log(`something went wrong: ${error}`);
      }
    } else {
      this.statusBar.text = "Lightspeed (Not logged in)";
      this.statusBar.tooltip = undefined;
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
    if (this.lightSpeedAuthenticationProvider.userIsConnected) {
      vscode.commands.executeCommand(LightSpeedCommands.LIGHTSPEED_FEEDBACK);
    } else {
      vscode.commands.executeCommand(
        LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
      );
    }
  }

  public async setLightSpeedStatusBarTooltip(
    session?: LightspeedAuthSession,
  ): Promise<void> {
    if (session === undefined) {
      session = <LightspeedAuthSession>await vscode.authentication.getSession(
        ANSIBLE_LIGHTSPEED_AUTH_ID,
        [],
        {
          createIfNone: false,
        },
      );
    }
    const statusBarInfo = getLoggedInSessionDetails(session);
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
