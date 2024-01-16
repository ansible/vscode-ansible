import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAPI } from "./api";
import { SettingsManager } from "../../settings";
import {
  LightSpeedCommands,
  LIGHTSPEED_DEFAULT,
} from "../../definitions/lightspeed";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";
import { LightspeedAuthSession } from "../../interfaces/lightspeed";
import {
  ANSIBLE_LIGHTSPEED_AUTH_ID,
  getLoggedInSessionDetails,
} from "./utils/webUtils";
import { lightSpeedManager } from "../../extension";

export class LightspeedStatusBar {
  private apiInstance: LightSpeedAPI;
  private lightSpeedAuthProvider: LightSpeedAuthenticationProvider;
  private context;
  public client;
  public settingsManager: SettingsManager;
  public statusBar: vscode.StatusBarItem;

  constructor(
    apiInstance: LightSpeedAPI,
    lightSpeedAuthProvider: LightSpeedAuthenticationProvider,
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager
  ) {
    this.apiInstance = apiInstance;
    this.lightSpeedAuthProvider = lightSpeedAuthProvider;
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
    this.getLightSpeedStatusBarText().then((text) => {
      lightSpeedStatusBarItem.text = text;
    });
    this.context.subscriptions.push(lightSpeedStatusBarItem);
    return lightSpeedStatusBarItem;
  }

  public async getLightSpeedStatusBarText(
    rhUserHasSeat?: boolean,
    rhOrgHasSubscription?: boolean
  ): Promise<string> {
    let lightSpeedStatusbarText;
    if (rhUserHasSeat === undefined) {
      rhUserHasSeat = await this.lightSpeedAuthProvider.rhUserHasSeat();
    }
    if (rhOrgHasSubscription === undefined) {
      rhOrgHasSubscription =
        await this.lightSpeedAuthProvider.rhOrgHasSubscription();
    }
    if (rhUserHasSeat === true) {
      lightSpeedStatusbarText = "Lightspeed (licensed)";
    } else if (rhOrgHasSubscription === true && rhUserHasSeat === false) {
      lightSpeedStatusbarText = "Lightspeed (no seat assigned)";
    } else if (rhUserHasSeat === false) {
      lightSpeedStatusbarText = "Lightspeed (Tech Preview)";
    } else {
      lightSpeedStatusbarText = "Lightspeed";
    }
    return lightSpeedStatusbarText;
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

  public async setLightSpeedStatusBarTooltip(
    session?: LightspeedAuthSession
  ): Promise<void> {
    if (session === undefined) {
      session = <LightspeedAuthSession>await vscode.authentication.getSession(
        ANSIBLE_LIGHTSPEED_AUTH_ID,
        [],
        {
          createIfNone: false,
        }
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
                    <li>Model: ${modelName || LIGHTSPEED_DEFAULT}</li>
                  </ul>\n`;

    const mdStringObj = new vscode.MarkdownString(mdString, true);
    mdStringObj.supportHtml = true;
    mdStringObj.isTrusted = true;

    lightSpeedManager.statusBarProvider.statusBar.tooltip = mdStringObj;
  }
}
