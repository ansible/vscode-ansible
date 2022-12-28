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

interface ansibleMetadataEvent {
  ansibleVersion: string;
  ansibleLintVersion?: string;
  eeEnabled: boolean;
}

export class MetadataManager {
  private context;
  private client;
  private cachedAnsibleVersion = "";
  private metadataStatusBarItem: StatusBarItem;
  private telemetry: TelemetryManager;

  constructor(
    context: ExtensionContext,
    client: LanguageClient,
    telemetry: TelemetryManager
  ) {
    this.context = context;
    this.client = client;
    this.telemetry = telemetry;

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
  public updateAnsibleInfoInStatusbar(): void {
    if (window.activeTextEditor?.document.languageId !== "ansible") {
      this.metadataStatusBarItem.hide();
      return;
    }

    this.updateAnsibleInfo();
  }

  /**
   * Sends notification with active file uri as param to the server
   * and receives notification from the server with ansible meta data associated with the opened file as param
   */
  public updateAnsibleInfo(): void {
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
            eeEnabled: ansibleMetaData.eeEnabled,
          };
          if (ansibleMetaData.ansibleLintPresent) {
            eventData["ansibleLintVersion"] =
              ansibleMetaData.metaData["ansible-lint information"]["version"];
          }
          this.telemetry.sendTelemetry("ansibleMetadata", eventData);
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
