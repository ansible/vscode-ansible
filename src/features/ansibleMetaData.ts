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
import { TelemetryManager } from "../utils/telemetryUtils";
import { formatAnsibleMetaData } from "./utils/formatAnsibleMetaData";
import { compareObjects } from "./utils/data";
import { SettingsManager } from "../settings";

interface ansibleMetadataEvent {
  ansibleVersion: string;
  ansibleLintVersion?: string;
  eeEnabled: boolean;
  lightSpeedEnabled: boolean;
  lightSpeedCodeAssistEnabled: boolean;
}

let prevEventData: ansibleMetadataEvent = {
  ansibleVersion: "",
  eeEnabled: false,
  lightSpeedEnabled: false,
  lightSpeedCodeAssistEnabled: false,
};

export class MetadataManager {
  private context;
  private client;
  private cachedAnsibleVersion = "";
  private metadataStatusBarItem: StatusBarItem;
  private telemetry: TelemetryManager;
  private extensionSettings: SettingsManager;

  constructor(
    context: ExtensionContext,
    client: LanguageClient,
    telemetry: TelemetryManager,
    extensionSettings: SettingsManager
  ) {
    this.context = context;
    this.client = client;
    this.telemetry = telemetry;
    this.extensionSettings = extensionSettings;

    this.metadataStatusBarItem = this.initialiseStatusBar();
  }

  private initialiseStatusBar(): StatusBarItem {
    // create a new status bar item that we can manage
    const metadataStatusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Right,
      100
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
      true
    );
    this.metadataStatusBarItem.show();
    this.client.onNotification(
      new NotificationType(`update/ansible-metadata`),
      (ansibleMetaDataList: any) => {
        const ansibleMetaData = formatAnsibleMetaData(ansibleMetaDataList[0]);
        if (ansibleMetaData.ansiblePresent) {
          console.log("Ansible found in the workspace");
          this.cachedAnsibleVersion =
            ansibleMetaData.metaData["ansible information"]["core version"];
          const tooltip = ansibleMetaData.markdown;
          this.metadataStatusBarItem.text = ansibleMetaData.eeEnabled
            ? `$(bracket-dot) [EE] ${this.cachedAnsibleVersion}`
            : `$(bracket-dot) ${this.cachedAnsibleVersion}`;
          this.metadataStatusBarItem.backgroundColor = "";
          this.metadataStatusBarItem.tooltip = tooltip;

          if (!ansibleMetaData.ansibleLintPresent) {
            this.metadataStatusBarItem.text = `$(warning) ${this.cachedAnsibleVersion}`;
            this.metadataStatusBarItem.backgroundColor = new ThemeColor(
              "statusBarItem.warningBackground"
            );
          }

          this.metadataStatusBarItem.show();
          const eventData: ansibleMetadataEvent = {
            ansibleVersion:
              ansibleMetaData.metaData["ansible information"]["core version"],
            eeEnabled:
              this.extensionSettings.settings.executionEnvironment.enabled,
            lightSpeedEnabled:
              this.extensionSettings.settings.lightSpeedService.enabled,
            lightSpeedCodeAssistEnabled:
              this.extensionSettings.settings.lightSpeedService.suggestions
                .enabled,
          };
          if (ansibleMetaData.ansibleLintPresent) {
            eventData["ansibleLintVersion"] =
              ansibleMetaData.metaData["ansible-lint information"]["version"];
          }
          // send telemetry event only when ansible metadata changes
          if (!compareObjects(eventData, prevEventData)) {
            this.telemetry.sendTelemetry("ansibleMetadata", eventData);
            prevEventData = eventData;
          }
        } else {
          console.log("Ansible not found in the workspace");
          this.metadataStatusBarItem.text = "$(error) Ansible Info";
          this.metadataStatusBarItem.tooltip = ansibleMetaData.markdown;
          this.metadataStatusBarItem.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground"
          );
          this.metadataStatusBarItem.show();
          this.telemetry.sendTelemetry("ansibleMetadata", {
            error: "Ansible not found in the workspace",
          });
        }
      }
    );
    const activeFileUri = window.activeTextEditor?.document.uri.toString();
    this.client.sendNotification(
      new NotificationType(`update/ansible-metadata`),
      [activeFileUri]
    );

    return;
  }
}
