import * as vscode from "vscode";
import {
  ExtensionContext,
  window,
  StatusBarAlignment,
  StatusBarItem,
  ThemeColor,
  TextDocument,
  Position,
} from "vscode";

import { WisdomAPI } from "./api";
import { ExtensionSettings } from "../../interfaces/extensionSettings";
import { TelemetryManager } from "../../utils/telemetryUtils";
import { getCurrentUTCDateTime } from "../utils/dateTime";
import { removePromptFromSuggestion } from "../utils/wisdom";



export class WisdomManager {
  private context;
  public settings: ExtensionSettings;
  public telemetry: TelemetryManager;
  public wisdomStatusBar: StatusBarItem;
  public apiInstance: WisdomAPI;

  constructor(
    context: ExtensionContext,
    settings: ExtensionSettings,
    telemetry: TelemetryManager
  ) {
    this.context = context;
    this.settings = settings;
    this.telemetry = telemetry;
    this.apiInstance = new WisdomAPI(settings);

    // create a new ansible wisdom status bar item that we can manage
    this.wisdomStatusBar = window.createStatusBarItem(
      StatusBarAlignment.Right,
      100
    );

    this.handleStatusBar();
  }

  private handleStatusBar() {
    //wisdomStatusBar.command = await window.showInputBox("Enable Wisdom")
    this.wisdomStatusBar.text = "Wisdom";
    //wisdomStatusBar.color = "#FF0000";
    this.wisdomStatusBar.backgroundColor = new ThemeColor(
      "statusBarItem.prominentForeground"
    );
    this.context.subscriptions.push(this.wisdomStatusBar);
    this.wisdomStatusBar.show();
  }
}
