/* eslint-disable  @typescript-eslint/no-explicit-any */
import {
  ExtensionContext,
  window,
  MarkdownString,
  ThemeColor,
  StatusBarItem,
  StatusBarAlignment,
} from "vscode";
import { NotificationType } from "vscode-languageclient";
import { LanguageClient } from "vscode-languageclient/node";
import { TelemetryManager, sendTelemetry } from "../utils/telemetryUtils";
import { formatAnsibleMetaData } from "./utils/formatAnsibleMetaData";
import { compareObjects, getValueFromObject } from "./utils/data";
import { SettingsManager } from "../settings";

interface ansibleMetadataEvent {
  ansibleVersion: string;
  pythonVersion?: string;
  ansibleLintVersion?: string;
  eeEnabled: boolean;
  lightSpeedEnabled: boolean;
  lightSpeedCodeAssistEnabled: boolean;
}

export class MetadataManager {
  private context;
  private client;
  private cachedAnsibleVersion = "";
  private metadataStatusBarItem: StatusBarItem;
  private telemetry: TelemetryManager;
  private extensionSettings: SettingsManager;
  private currentAnsibleMetaEventData: ansibleMetadataEvent | undefined;
  private previousAnsibleMetaEventData: ansibleMetadataEvent | undefined;
  private ansibleMetaData: any;

  constructor(
    context: ExtensionContext,
    client: LanguageClient,
    telemetry: TelemetryManager,
    extensionSettings: SettingsManager,
  ) {
    this.context = context;
    this.client = client;
    this.telemetry = telemetry;
    this.extensionSettings = extensionSettings;

    this.metadataStatusBarItem = this.initialiseStatusBar();
    this.currentAnsibleMetaEventData = undefined;
    this.previousAnsibleMetaEventData = undefined;
    this.ansibleMetaData = undefined;
  }

  private initialiseStatusBar(): StatusBarItem {
    // create a new status bar item that we can manage
    const metadataStatusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Right,
      100,
    );
    this.context.subscriptions.push(metadataStatusBarItem);
    return metadataStatusBarItem;
  }

  /**
   * Calls the 'updateAnsibleInfo' function to update the ansible metadata
   * in the statusbar hovering action
   */
  public async updateAnsibleInfoInStatusbar(): Promise<void> {
    if (window.activeTextEditor?.document.languageId !== "ansible") {
      this.metadataStatusBarItem.hide();
      return;
    }

    await this.updateAnsibleInfo();
  }

  /**
   * Sends notification with active file uri as param to the server
   * and receives notification from the server with ansible meta data associated with the opened file as param
   */
  public async updateAnsibleInfo(): Promise<void> {
    if (!this.client.isRunning()) {
      return;
    }
    this.metadataStatusBarItem.tooltip = new MarkdownString(
      ` $(sync~spin) Fetching... `,
      true,
    );
    this.metadataStatusBarItem.show();
    this.client.onNotification(
      new NotificationType(`update/ansible-metadata`),
      (ansibleMetaDataList: any) => {
        this.ansibleMetaData = formatAnsibleMetaData(ansibleMetaDataList[0]);
        if (this.ansibleMetaData.ansiblePresent) {
          console.log("Ansible found in the workspace");
          this.cachedAnsibleVersion =
            this.ansibleMetaData.metaData["ansible information"][
              "core version"
            ];
          const tooltip = this.ansibleMetaData.markdown;
          this.metadataStatusBarItem.text = this.ansibleMetaData.eeEnabled
            ? `$(bracket-dot) [EE] ${this.cachedAnsibleVersion}`
            : `$(bracket-dot) ${this.cachedAnsibleVersion}`;
          this.metadataStatusBarItem.backgroundColor = "";
          this.metadataStatusBarItem.tooltip = tooltip;

          if (!this.ansibleMetaData.ansibleLintPresent) {
            this.metadataStatusBarItem.text = `$(warning) ${this.cachedAnsibleVersion}`;
            this.metadataStatusBarItem.backgroundColor = new ThemeColor(
              "statusBarItem.warningBackground",
            );
          }
          this.metadataStatusBarItem.show();
        } else {
          console.log("Ansible not found in the workspace");
          this.metadataStatusBarItem.text = "$(error) Ansible";
          this.metadataStatusBarItem.tooltip = this.ansibleMetaData.markdown;
          this.metadataStatusBarItem.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground",
          );
          this.metadataStatusBarItem.show();
        }
      },
    );
    const activeFileUri = window.activeTextEditor?.document.uri.toString();
    this.client.sendNotification(
      new NotificationType(`update/ansible-metadata`),
      [activeFileUri],
    );

    return;
  }

  public async sendAnsibleMetadataTelemetry(): Promise<void> {
    if (!this.ansibleMetaData) {
      return;
    }
    // Extract ansibleVersion and pythonVersion safely
    const ansibleVersion = getValueFromObject(this.ansibleMetaData.metaData, [
      "ansible information",
      "core version",
    ]);
    const pythonVersion = getValueFromObject(this.ansibleMetaData.metaData, [
      "python information",
      "version",
    ]);
    const ansibleLintVersion = this.ansibleMetaData.ansibleLintPresent
      ? getValueFromObject(this.ansibleMetaData.metaData, [
          "ansible-lint information",
          "version",
        ])
      : null;
    this.currentAnsibleMetaEventData = {
      ansibleVersion,
      pythonVersion,
      eeEnabled: this.extensionSettings.settings.executionEnvironment.enabled,
      lightSpeedEnabled:
        this.extensionSettings.settings.lightSpeedService.enabled,
      lightSpeedCodeAssistEnabled:
        this.extensionSettings.settings.lightSpeedService.suggestions.enabled,
    };
    if (this.ansibleMetaData.ansibleLintPresent) {
      this.currentAnsibleMetaEventData["ansibleLintVersion"] =
        ansibleLintVersion;
    }
    // Retrieve the previous event data from VS Code cache
    this.previousAnsibleMetaEventData =
      this.context.globalState.get<ansibleMetadataEvent>(
        "prevAnsibleMetadataEvent",
      );
    // send telemetry event only when ansible metadata changes
    if (
      ansibleVersion &&
      pythonVersion &&
      !compareObjects(
        this.currentAnsibleMetaEventData,
        this.previousAnsibleMetaEventData,
      )
    ) {
      console.log("Sending ansibleMetadata telemetry event");
      await sendTelemetry(
        this.telemetry.telemetryService,
        this.telemetry.isTelemetryInit,
        "ansibleMetadata",
        this.currentAnsibleMetaEventData,
      );
      this.context.globalState.update(
        "prevAnsibleMetadataEvent",
        this.currentAnsibleMetaEventData,
      );
    }
  }
}
