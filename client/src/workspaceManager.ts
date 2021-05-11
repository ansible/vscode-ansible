import { Uri, workspace as Workspace, WorkspaceFolder } from 'vscode';

export class WorkspaceManager {
  private sortedWorkspaceFolders: string[] = [];
  constructor() {
    Workspace.onDidChangeWorkspaceFolders(() => this.refreshWorkspaceFolders());
    this.refreshWorkspaceFolders();
  }

  public getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
    for (const element of this.sortedWorkspaceFolders) {
      let uri = folder.uri.toString();
      if (!uri.endsWith('/')) {
        uri = `${uri}/`;
      }
      if (uri.startsWith(element)) {
        const outerFolder = Workspace.getWorkspaceFolder(Uri.parse(element));
        if (outerFolder) {
          return outerFolder;
        }
      }
    }
    return folder;
  }

  private refreshWorkspaceFolders() {
    if (Workspace.workspaceFolders) {
      this.sortedWorkspaceFolders = Workspace.workspaceFolders
        .map((folder) => {
          let result = folder.uri.toString();
          if (!result.endsWith('/')) {
            result = `${result}/`;
          }
          return result;
        })
        .sort((a, b) => {
          return a.length - b.length;
        });
    } else {
      this.sortedWorkspaceFolders = [];
    }
  }
}
