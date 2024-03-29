import * as vscode from "vscode";
import * as path from "path";

export function findProjectDir() {
  const docUri = vscode.window.activeTextEditor?.document.uri;
  if (docUri) {
    const workspace = vscode.workspace.getWorkspaceFolder(docUri);
    if (workspace) {
      const folder = workspace.uri.fsPath;
      console.log(`tox workspace folder: ${folder}`);
      return folder;
    } else {
      const docDir = path.dirname(docUri.fsPath);
      console.log(`tox doc path: ${docUri.fsPath} -> ${docDir}`);
      return docDir;
    }
  } else {
    console.log("tox ansible no active editor found");

    // Fixme: this is not working for multi-root workspaces
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const rootPath = workspaceFolders[0].uri.fsPath;
      console.log("Workspace root directory:", rootPath);
      return rootPath;
    }
  }
}

export function getTerminal(
  projDir: string | undefined = findProjectDir(),
  name = "Ansible Tox",
): vscode.Terminal {
  for (const terminal of vscode.window.terminals) {
    if (terminal.name === name) {
      return terminal;
    }
  }
  return vscode.window.createTerminal({ cwd: projDir, name: name });
}

export function getRootParentLabelDesc(test: vscode.TestItem): string {
  let root = test;

  while (root.parent !== undefined) {
    root = root.parent;
  }

  return `${root.label} ${root.description}`;
}
