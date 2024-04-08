import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { globalFileSystemWatcher } from "../../../extension";
import { LightSpeedManager } from "../base";
import { IAnsibleType } from "../../../interfaces/watchers";
import { getRolePathFromPathWithinRole } from "./data";
import { readVarFiles } from "./readVarFiles";
import { updateRoleContext, updateRolesContext } from "./updateRolesContext";

import { isFile } from "../../../utils/fileUtils";
import { StandardRolePaths } from "../../../definitions/constants";

export async function watchAnsibleFile(
  lightSpeedManager: LightSpeedManager,
  filePath: string,
  ansibleType: IAnsibleType,
) {
  try {
    if (!isFile(filePath)) {
      console.error(`${filePath} is not a file`);
      return;
    }
    if (globalFileSystemWatcher[filePath] !== undefined) {
      console.log(`File ${filePath} is already being watched`);
      return;
    }

    const fileWatcher = vscode.workspace.createFileSystemWatcher(filePath);

    fileWatcher.onDidChange(() => {
      console.log(`File ${filePath} watcher has been changed`);
      if (ansibleType === "vars_files") {
        console.log(`File ${filePath} is a vars_file`);
        const updatedFileContents = readVarFiles(filePath);
        if (!updatedFileContents) {
          return;
        }
        lightSpeedManager.ansibleVarFilesCache[filePath] = updatedFileContents;
      }
    });

    fileWatcher.onDidDelete(() => {
      console.log(`File ${filePath} watcher has been deleted`);
      if (filePath in lightSpeedManager.ansibleVarFilesCache) {
        delete lightSpeedManager.ansibleVarFilesCache[filePath];
      }
    });

    fileWatcher.onDidCreate(() => {
      console.log(`File ${filePath} watcher has been created`);
    });

    globalFileSystemWatcher.filePath.watcher = fileWatcher;
    globalFileSystemWatcher.filePath.type = ansibleType;

    console.log(`Watching file ${filePath}`);
  } catch (err) {
    console.error(`Failed to watch file ${filePath} with error ${err}`);
    return;
  }
}

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
      const rolePath = getRolePathFromPathWithinRole(uri.fsPath);
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
      delete ansibleRolesCache["common"][dirPath];
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const workspaceFolder = workspaceFolders[0].uri.fsPath;
        if (dirPath in ansibleRolesCache[workspaceFolder]) {
          delete ansibleRolesCache[workspaceFolder][dirPath];
        }
      }
    }
    console.log(`Directory ${dirPath} has been deleted`);
  });

  watcher.onDidCreate((uri) => {
    const currentWorkspaceRoot = vscode.workspace.workspaceFolders;
    if (currentWorkspaceRoot) {
      const workspaceRoot = currentWorkspaceRoot[0].uri.fsPath;
      const rolePath = getRolePathFromPathWithinRole(uri.fsPath);
      updateRoleContext(
        lightSpeedManager.ansibleRolesCache,
        rolePath,
        workspaceRoot,
      );
      console.log(`Directory ${uri.fsPath} has been changed`);
    }
  });
}
