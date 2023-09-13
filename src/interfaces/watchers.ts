import * as vscode from "vscode";

export type IAnsibleType = "vars_files";

export interface IWatchersType {
  watcher: vscode.FileSystemWatcher;
  type: IAnsibleType;
}

export interface IFileSystemWatchers {
  [key: string]: IWatchersType;
}
