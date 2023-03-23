import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { v4 as uuidv4 } from "uuid";
import { WisdomAPI } from "./api";
import { TelemetryManager } from "../../utils/telemetryUtils";
import { SettingsManager } from "../../settings";
import { WisdomAuthenticationProvider } from "./wisdomOAuthProvider";
import {
  AnsibleContentUploadTrigger,
  FeedbackRequestParams,
  IDocumentTracker,
} from "../../definitions/wisdom";
import {
  WisdomCommands,
  WISDOM_FEEDBACK_FORM_URL,
  WISDOM_REPORT_EMAIL_ADDRESS,
} from "../../definitions/constants";

export class WisdomManager {
  private context;
  public client;
  public settingsManager: SettingsManager;
  public telemetry: TelemetryManager;
  public wisdomStatusBar: vscode.StatusBarItem;
  public apiInstance: WisdomAPI;
  public wisdomAuthenticationProvider: WisdomAuthenticationProvider;
  public wisdomActivityTracker: IDocumentTracker;

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
    this.wisdomActivityTracker = {};
    // initiate the OAuth service for Wisdom
    this.wisdomAuthenticationProvider = new WisdomAuthenticationProvider(
      this.context,
      this.settingsManager
    );
    this.apiInstance = new WisdomAPI(
      this.settingsManager,
      this.wisdomAuthenticationProvider
    );

    // create a new ansible wisdom status bar item that we can manage
    this.wisdomStatusBar = this.initialiseStatusBar();
    this.updateWisdomStatusbar();
  }

  public reInitialize(): void {
    this.updateWisdomStatusbar();
  }

  private initialiseStatusBar(): vscode.StatusBarItem {
    // create a new status bar item that we can manage
    const wisdomStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    wisdomStatusBarItem.command = WisdomCommands.WISDOM_STATUS_BAR_CLICK;
    wisdomStatusBarItem.text = "Wisdom";
    this.context.subscriptions.push(wisdomStatusBarItem);
    return wisdomStatusBarItem;
  }

  private handleStatusBar() {
    if (!this.client.isRunning()) {
      return;
    }
    if (
      this.settingsManager.settings.wisdomService.enabled &&
      this.settingsManager.settings.wisdomService.suggestions.enabled
    ) {
      this.wisdomStatusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.prominentForeground"
      );
    } else {
      this.wisdomStatusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
    this.wisdomStatusBar.show();
  }

  public updateWisdomStatusbar(): void {
    if (
      vscode.window.activeTextEditor?.document.languageId !== "ansible" ||
      !this.settingsManager.settings.wisdomService.enabled
    ) {
      this.wisdomStatusBar.hide();
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
      !this.settingsManager.settings.wisdomService.enabled ||
      !this.settingsManager.settings.wisdomService.basePath
    ) {
      return;
    }

    const documentUri = document.uri.toString();
    let activityId: string | undefined = undefined;
    if (trigger === AnsibleContentUploadTrigger.FILE_OPEN) {
      activityId = uuidv4();
      this.wisdomActivityTracker[documentUri] = uuidv4();
    } else if (trigger === AnsibleContentUploadTrigger.TAB_CHANGE) {
      // retrieve previous activity tracker
      activityId = this.wisdomActivityTracker[documentUri];

      // start a new activity tracker
      this.wisdomActivityTracker[documentUri] = uuidv4();
    } else if (trigger === AnsibleContentUploadTrigger.FILE_CLOSE) {
      // retrieve previous activity tracker
      activityId = this.wisdomActivityTracker[documentUri];

      // end previous activity tracker
      delete this.wisdomActivityTracker[documentUri];
    }
    const inputData: FeedbackRequestParams = {
      ansibleContent: {
        content: document.getText(),
        documentUri: documentUri,
        trigger: trigger,
        activityId: activityId,
      },
    };
    console.log("Sending ansible content feedback event: ", inputData);
    this.apiInstance.feedbackRequest(inputData);
  }

  public async wisdomStatusBarClickHandler() {
    // show an information message feedback buttons
    const contactButton = `Contact Us`;
    const feedbackButton = "Take Survey";
    const inputButton = await vscode.window.showInformationMessage(
      "Ansible wisdom feedback",
      //{ modal: true },
      feedbackButton,
      contactButton
    );
    if (inputButton === feedbackButton) {
      // open a URL in the default browser
      vscode.env.openExternal(vscode.Uri.parse(WISDOM_FEEDBACK_FORM_URL));
    } else if (inputButton === contactButton) {
      // open the user's default email client
      const mailtoUrl = encodeURI(`mailto:${WISDOM_REPORT_EMAIL_ADDRESS}`);
      vscode.env.openExternal(vscode.Uri.parse(mailtoUrl));
    }
  }
}
