import { window, MarkdownString, ThemeColor, StatusBarItem } from "vscode";
import { NotificationType } from "vscode-languageclient";
import { LanguageClient } from "vscode-languageclient/node";
import { formatAnsibleMetaData } from "./utils/formatAnsibleMetaData";

/**
 * Sends notification with active file uri as param to the server
 * and receives notification from the server with ansible meta data associated with the opened file as param
 *
 * @param client Language client
 * @param myStatusBarItem Statusbar item
 * @param isActiveClient Boolean representing the activation status of the client
 * @param cachedAnsibleVersion String representing the cached ansible version which is updated globally
 *
 * @returns String representing the cached ansible version
 */
export function updateAnsibleInfo(
  client: LanguageClient,
  myStatusBarItem: StatusBarItem,
  isActiveClient: boolean,
  cachedAnsibleVersion: string
): string {
  if (isActiveClient) {
    myStatusBarItem.tooltip = new MarkdownString(
      ` $(sync~spin) Fetching... `,
      true
    );
    myStatusBarItem.show();
    client.onNotification(
      new NotificationType(`update/ansible-metadata`),
      (ansibleMetaDataList: any) => {
        const ansibleMetaData = formatAnsibleMetaData(ansibleMetaDataList[0]);
        if (ansibleMetaData.ansiblePresent) {
          console.log("Ansible found in the workspace");
          cachedAnsibleVersion =
            ansibleMetaData.metaData["ansible information"]["ansible version"];
          const tooltip = ansibleMetaData.markdown;
          myStatusBarItem.text = ansibleMetaData.eeEnabled
            ? `$(bracket-dot) [EE] ${cachedAnsibleVersion}`
            : `$(bracket-dot) ${cachedAnsibleVersion}`;
          myStatusBarItem.backgroundColor = "";
          myStatusBarItem.tooltip = tooltip;

          if (!ansibleMetaData.ansibleLintPresent) {
            myStatusBarItem.text = `$(warning) ${cachedAnsibleVersion}`;
            myStatusBarItem.backgroundColor = new ThemeColor(
              "statusBarItem.warningBackground"
            );
          }

          myStatusBarItem.show();
        } else {
          console.log("Ansible not found in the workspace");
          myStatusBarItem.text = "$(error) Ansible Info";
          myStatusBarItem.tooltip = ansibleMetaData.markdown;
          myStatusBarItem.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground"
          );
          myStatusBarItem.show();
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
