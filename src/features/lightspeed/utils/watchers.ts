import * as vscode from "vscode";
import * as path from "path";
import { LightSpeedManager } from "@src/features/lightspeed/base";
import { getRoleNamePathFromFilePath } from "@src/features/lightspeed/utils/getRoleNamePathFromFilePath";
import {
  updateRoleContext,
  updateRolesContext,
} from "@src/features/lightspeed/utils/updateRolesContext";

import { StandardRolePaths } from "@src/definitions/constants";

export async function watchRolesDirectory(
  lightSpeedManager: LightSpeedManager,
  rolesPath: string,
  workspaceRoot?: string,
): Promise<vscode.Disposable[]> {
  if (!workspaceRoot) {
    workspaceRoot = "common";
  }
  const ansibleRolesCache = lightSpeedManager.ansibleRolesCache;
  if (
    ansibleRolesCache[workspaceRoot] &&
    rolesPath in ansibleRolesCache[workspaceRoot]
  ) {
    console.log(`Directory ${rolesPath} is already being watched`);
    await updateRolesContext(
      lightSpeedManager.ansibleRolesCache,
      rolesPath,
      workspaceRoot,
    );
    return [];
  }

  await updateRolesContext(
    lightSpeedManager.ansibleRolesCache,
    rolesPath,
    workspaceRoot,
  );
  console.log(`Created roles cache for ${rolesPath}`);

  const watcher = vscode.workspace.createFileSystemWatcher(
    path.join(rolesPath, "**/*"),
  );

  watcher.onDidChange(async (uri) => {
    const currentWorkspaceRoot = vscode.workspace.workspaceFolders;
    if (currentWorkspaceRoot) {
      const workspaceRoot = currentWorkspaceRoot[0].uri.fsPath;
      const rolePath = getRoleNamePathFromFilePath(uri.fsPath);
      await updateRoleContext(
        lightSpeedManager.ansibleRolesCache,
        rolePath,
        workspaceRoot,
      );
      console.log(`Directory ${uri.fsPath} has been changed`);
    }
  });

  watcher.onDidDelete((uri) => {
    const dirPath = path.extname(uri.fsPath)
      ? path.dirname(uri.fsPath)
      : uri.fsPath;

    if (StandardRolePaths.includes(dirPath)) {
      const commonCache = lightSpeedManager.ansibleRolesCache["common"];
      if (commonCache) {
        delete commonCache[dirPath];
      }
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const workspaceFolder = workspaceFolders[0].uri.fsPath;
        const wsCache = lightSpeedManager.ansibleRolesCache[workspaceFolder];
        if (wsCache && dirPath in wsCache) {
          delete wsCache[dirPath];
        }
      }
    }
    console.log(`Directory ${dirPath} has been deleted`);
  });

  watcher.onDidCreate(async (uri) => {
    const currentWorkspaceRoot = vscode.workspace.workspaceFolders;
    if (currentWorkspaceRoot) {
      const workspaceRoot = currentWorkspaceRoot[0].uri.fsPath;
      const rolePath = getRoleNamePathFromFilePath(uri.fsPath);
      await updateRoleContext(
        lightSpeedManager.ansibleRolesCache,
        rolePath,
        workspaceRoot,
      );
      console.log(`Directory ${uri.fsPath} has been created`);
    }
  });

  return [watcher];
}
