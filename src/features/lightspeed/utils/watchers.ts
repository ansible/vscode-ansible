import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LightSpeedManager } from "@src/features/lightspeed/base";
import { getRoleNamePathFromFilePath } from "@src/features/lightspeed/utils/getRoleNamePathFromFilePath";
import {
  updateRoleContext,
  updateRolesContext,
} from "@src/features/lightspeed/utils/updateRolesContext";

import { StandardRolePaths } from "@src/definitions/constants";

export function watchRolesDirectory(
  lightSpeedManager: LightSpeedManager,
  rolesPath: string,
  workspaceRoot?: string,
) {
  if (!workspaceRoot) {
    workspaceRoot = "common";
  }
  const ansibleRolesCache = lightSpeedManager.ansibleRolesCache;
  if (
    ansibleRolesCache[workspaceRoot] &&
    rolesPath in ansibleRolesCache[workspaceRoot]
  ) {
    console.log(`Directory ${rolesPath} is already being watched`);
    updateRolesContext(
      lightSpeedManager.ansibleRolesCache,
      rolesPath,
      workspaceRoot,
    );
    return;
  } else {
    updateRolesContext(
      lightSpeedManager.ansibleRolesCache,
      rolesPath,
      workspaceRoot,
    );
    console.log(`Created roles cache for ${rolesPath}`);
  }

  const watcher = vscode.workspace.createFileSystemWatcher(
    path.join(rolesPath, "**/*"),
  );

  watcher.onDidChange((uri) => {
    const currentWorkspaceRoot = vscode.workspace.workspaceFolders;
    if (currentWorkspaceRoot) {
      const workspaceRoot = currentWorkspaceRoot[0].uri.fsPath;
      const rolePath = getRoleNamePathFromFilePath(uri.fsPath);
      updateRoleContext(
        lightSpeedManager.ansibleRolesCache,
        rolePath,
        workspaceRoot,
      );
      console.log(`Directory ${uri.fsPath} has been changed`);
    }
  });

  watcher.onDidDelete((uri) => {
    let dirPath = uri.fsPath;
    const stats = fs.statSync(dirPath);
    if (stats.isFile()) {
      dirPath = path.dirname(dirPath);
    }
    if (dirPath in StandardRolePaths) {
      Reflect.deleteProperty(ansibleRolesCache["common"], dirPath);
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const workspaceFolder = workspaceFolders[0].uri.fsPath;
        if (dirPath in ansibleRolesCache[workspaceFolder]) {
          Reflect.deleteProperty(ansibleRolesCache[workspaceFolder], dirPath);
        }
      }
    }
    console.log(`Directory ${dirPath} has been deleted`);
  });

  watcher.onDidCreate((uri) => {
    const currentWorkspaceRoot = vscode.workspace.workspaceFolders;
    if (currentWorkspaceRoot) {
      const workspaceRoot = currentWorkspaceRoot[0].uri.fsPath;
      const rolePath = getRoleNamePathFromFilePath(uri.fsPath);
      updateRoleContext(
        lightSpeedManager.ansibleRolesCache,
        rolePath,
        workspaceRoot,
      );
      console.log(`Directory ${uri.fsPath} has been changed`);
    }
  });
}
