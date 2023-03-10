import {
  ExtensionContext,
  window,
  StatusBarAlignment,
  StatusBarItem,
  ThemeColor,
} from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { WisdomAPI } from "./api";
import { TelemetryManager } from "../../utils/telemetryUtils";
import { SettingsManager } from "../../settings";

export class WisdomManager {
  private context;
  public client;
  public settingsManager: SettingsManager;
  public telemetry: TelemetryManager;
  public wisdomStatusBar: StatusBarItem;
  public apiInstance: WisdomAPI;

  constructor(
    context: ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
    telemetry: TelemetryManager
  ) {
    this.context = context;
    this.client = client;
    this.settingsManager = settingsManager;
    this.telemetry = telemetry;
    this.apiInstance = new WisdomAPI(this.settingsManager);

    // create a new ansible wisdom status bar item that we can manage
    this.wisdomStatusBar = this.initialiseStatusBar();
    this.updateWisdomStatusbar();
  }

  public reInitialize(): void {
    this.updateWisdomStatusbar();
    this.apiInstance.reInitialize();
  }
  private initialiseStatusBar(): StatusBarItem {
    // create a new status bar item that we can manage
    const wisdomStatusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Right,
      100
    );
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
      this.wisdomStatusBar.backgroundColor = new ThemeColor(
        "statusBarItem.prominentForeground"
      );
    } else {
      this.wisdomStatusBar.backgroundColor = new ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
    this.wisdomStatusBar.show();
  }

  public updateWisdomStatusbar(): void {
    if (
      window.activeTextEditor?.document.languageId !== "ansible" ||
      !this.settingsManager.settings.wisdomService.enabled
    ) {
      this.wisdomStatusBar.hide();
      return;
    }

    this.handleStatusBar();
  }
}
