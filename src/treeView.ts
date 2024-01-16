/* eslint-disable @typescript-eslint/no-namespace */
import * as vscode from "vscode";
import {
  LightspeedAuthSession,
  LightspeedSessionInfo,
} from "./interfaces/lightspeed";
import { getLoggedInSessionDetails } from "./features/lightspeed/utils/webUtils";

export class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  onDidChangeTreeData?: vscode.Event<TreeItem | null | undefined> | undefined;

  data: TreeItem[];

  constructor(sessionData: LightspeedAuthSession | undefined) {
    if (!sessionData) {
      this.data = [];
    } else {
      const loggedMessage = `Logged dev in as: ${sessionData.account.label}`;
      const children: TreeItem[] = [];
      const labels: string[] = [];
      const sessionInfo: LightspeedSessionInfo =
        getLoggedInSessionDetails(sessionData);

      labels.push(`User Type: ${sessionInfo.userInfo?.userType}`);
      if (sessionInfo.userInfo?.role !== undefined) {
        labels.push(`Role: ${sessionInfo.userInfo?.role}`);
      }

      labels.forEach((label) => {
        children.push({
          label,
          children: [],
        });
      });

      this.data = [new TreeItem(loggedMessage, children)];
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(
    element?: TreeItem | undefined
  ): vscode.ProviderResult<TreeItem[]> {
    if (element === undefined) {
      return this.data;
    }
    return element.children;
  }
}

class TreeItem extends vscode.TreeItem {
  children: TreeItem[] | undefined;

  constructor(label: string, children?: TreeItem[]) {
    super(
      label,
      children === undefined
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Expanded
    );
    this.children = children;
  }
}
