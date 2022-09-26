/* eslint-disable  @typescript-eslint/no-explicit-any */
import { window, MarkdownString, ThemeColor, StatusBarItem } from "vscode";
import { NotificationType } from "vscode-languageclient";
import { LanguageClient } from "vscode-languageclient/node";
import { formatAnsibleMetaData } from "./utils/formatAnsibleMetaData";

/**
 * Sends notification with active file uri as param to the server
 * and receives notification from the server with ansible meta data associated with the opened file as param
 *
 * @param client Language client
 * @param metadataStatusBarItem Statusbar item
 * @param isActiveClient Boolean representing the activation status of the client
 * @param cachedAnsibleVersion String representing the cached ansible version which is updated globally
 *
 * @returns String representing the cached ansible version
 */
export function updateAnsibleInfo(
  client: LanguageClient,
  metadataStatusBarItem: StatusBarItem,
  isActiveClient: boolean,
  cachedAnsibleVersion: string
): string {
  if (isActiveClient) {
    metadataStatusBarItem.tooltip = new MarkdownString(
      ` $(sync~spin) Fetching... `,
      true
    );
    metadataStatusBarItem.show();
    client.onNotification(
      new NotificationType(`update/ansible-metadata`),
      (ansibleMetaDataList: any) => {
        const ansibleMetaData = formatAnsibleMetaData(ansibleMetaDataList[0]);
        if (ansibleMetaData.ansiblePresent) {
          console.log("Ansible found in the workspace");
          cachedAnsibleVersion =
            ansibleMetaData.metaData["ansible information"]["ansible version"];
          const tooltip = ansibleMetaData.markdown;
          metadataStatusBarItem.text = ansibleMetaData.eeEnabled
            ? `$(bracket-dot) [EE] ${cachedAnsibleVersion}`
            : `$(bracket-dot) ${cachedAnsibleVersion}`;
          metadataStatusBarItem.backgroundColor = "";
          metadataStatusBarItem.tooltip = tooltip;

          if (!ansibleMetaData.ansibleLintPresent) {
            metadataStatusBarItem.text = `$(warning) ${cachedAnsibleVersion}`;
            metadataStatusBarItem.backgroundColor = new ThemeColor(
              "statusBarItem.warningBackground"
            );
          }

          metadataStatusBarItem.show();
        } else {
          console.log("Ansible not found in the workspace");
          metadataStatusBarItem.text = "$(error) Ansible Info";
          metadataStatusBarItem.tooltip = ansibleMetaData.markdown;
          metadataStatusBarItem.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground"
          );
          metadataStatusBarItem.show();
        }
      }
    );
    const activeFileUri = window.activeTextEditor?.document.uri.toString();
    client.sendNotification(new NotificationType(`update/ansible-metadata`), [
      activeFileUri,
    ]);
  }

  return cachedAnsibleVersion;
}
