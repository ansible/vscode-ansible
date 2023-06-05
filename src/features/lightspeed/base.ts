import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { v4 as uuidv4 } from "uuid";
import { LightSpeedAPI } from "./api";
import { TelemetryManager } from "../../utils/telemetryUtils";
import { SettingsManager } from "../../settings";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";
import {
  AnsibleContentUploadTrigger,
  FeedbackRequestParams,
  IDocumentTracker,
} from "../../definitions/lightspeed";
import {
  LightSpeedCommands,
  LIGHTSPEED_FEEDBACK_FORM_URL,
  LIGHTSPEED_REPORT_EMAIL_ADDRESS,
} from "../../definitions/constants";
import { AttributionsWebview } from "./attributionsWebview";
import {
  ANSIBLE_LIGHTSPEED_AUTH_ID,
  ANSIBLE_LIGHTSPEED_AUTH_NAME,
} from "./utils/webUtils";

export class LightSpeedManager {
  private context;
  public client;
  public settingsManager: SettingsManager;
  public telemetry: TelemetryManager;
  public lightSpeedStatusBar: vscode.StatusBarItem;
  public apiInstance: LightSpeedAPI;
  public lightSpeedAuthenticationProvider: LightSpeedAuthenticationProvider;
  public lightSpeedActivityTracker: IDocumentTracker;
  public attributionsProvider: AttributionsWebview;

  constructor(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
    telemetry: TelemetryManager
  ) {
    this.context = context;
    this.client = client;
    this.settingsManager = settingsManager;
    this.telemetry = telemetry;
    this.lightSpeedActivityTracker = {};
    // initiate the OAuth service for Ansible Lightspeed
    this.lightSpeedAuthenticationProvider =
      new LightSpeedAuthenticationProvider(
        this.context,
        this.settingsManager,
        ANSIBLE_LIGHTSPEED_AUTH_ID,
        ANSIBLE_LIGHTSPEED_AUTH_NAME
      );
    if (this.settingsManager.settings.lightSpeedService.enabled) {
      this.lightSpeedAuthenticationProvider.initialize();
    }
    this.apiInstance = new LightSpeedAPI(
      this.settingsManager,
      this.lightSpeedAuthenticationProvider
    );
    this.attributionsProvider = new AttributionsWebview(
      this.context,
      this.client,
      this.settingsManager,
      this.apiInstance
    );

    // create a new project lightspeed status bar item that we can manage
    this.lightSpeedStatusBar = this.initialiseStatusBar();
    this.updateLightSpeedStatusbar();
  }

  public async reInitialize(): Promise<void> {
    const lightspeedEnabled = await vscode.workspace
      .getConfiguration("ansible")
      .get("lightspeed.enabled");

    if (!lightspeedEnabled) {
      await this.lightSpeedAuthenticationProvider.dispose();
      // reload the window to remove the login notification
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
      this.lightSpeedStatusBar.hide();
      return;
    } else {
      this.lightSpeedAuthenticationProvider.initialize();
    }

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
      this.lightSpeedStatusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.prominentForeground"
      );
    } else {
      this.lightSpeedStatusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
    this.lightSpeedStatusBar.show();
  }

  public updateLightSpeedStatusbar(): void {
    if (
      vscode.window.activeTextEditor?.document.languageId !== "ansible" ||
      !this.settingsManager.settings.lightSpeedService.enabled
    ) {
      this.lightSpeedStatusBar.hide();
      return;
    }

    this.handleStatusBar();
  }

  public ansibleContentFeedback(
    document: vscode.TextDocument,
    trigger: AnsibleContentUploadTrigger
  ): void {
    if (
      document.languageId !== "ansible" ||
      !this.settingsManager.settings.lightSpeedService.enabled ||
      !this.settingsManager.settings.lightSpeedService.URL.trim()
    ) {
      return;
    }

    const documentUri = document.uri.toString();
    let activityId: string | undefined = undefined;
    if (trigger === AnsibleContentUploadTrigger.FILE_OPEN) {
      activityId = uuidv4();
      this.lightSpeedActivityTracker[documentUri] = uuidv4();
    } else if (trigger === AnsibleContentUploadTrigger.TAB_CHANGE) {
      // retrieve previous activity tracker
      activityId = this.lightSpeedActivityTracker[documentUri];

      // start a new activity tracker
      this.lightSpeedActivityTracker[documentUri] = uuidv4();
    } else if (trigger === AnsibleContentUploadTrigger.FILE_CLOSE) {
      // retrieve previous activity tracker
      activityId = this.lightSpeedActivityTracker[documentUri];

      // end previous activity tracker
      delete this.lightSpeedActivityTracker[documentUri];
    }
    const inputData: FeedbackRequestParams = {
      ansibleContent: {
        content: document.getText(),
        documentUri: documentUri,
        trigger: trigger,
        activityId: activityId,
      },
    };
    console.log(
      "[ansible-lightspeed-feedback] Event lightSpeedServiceAnsibleContentFeedbackEvent sent."
    );
    this.apiInstance.feedbackRequest(inputData);
  }

  public async lightSpeedStatusBarClickHandler() {
    // show an information message feedback buttons
    const contactButton = `Contact Us`;
    const feedbackButton = "Take Survey";
    const inputButton = await vscode.window.showInformationMessage(
      "Ansible Lightspeed with Watson Code Assistant feedback",
      //{ modal: true },
      feedbackButton,
      contactButton
    );
    if (inputButton === feedbackButton) {
      // open a URL in the default browser
      vscode.env.openExternal(vscode.Uri.parse(LIGHTSPEED_FEEDBACK_FORM_URL));
    } else if (inputButton === contactButton) {
      // open the user's default email client
      const mailtoUrl = encodeURI(`mailto:${LIGHTSPEED_REPORT_EMAIL_ADDRESS}`);
      vscode.env.openExternal(vscode.Uri.parse(mailtoUrl));
    }
  }
}
