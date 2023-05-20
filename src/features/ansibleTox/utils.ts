import * as vscode from "vscode";
import * as path from "path";

export function findProjectDir() {
  const docUri = vscode.window.activeTextEditor?.document.uri;

  if (!docUri) {
    throw new Error("No active editor found.");
  }

  const workspace = vscode.workspace.getWorkspaceFolder(docUri);

  if (workspace) {
    const folder = workspace.uri.fsPath;
    console.log(`tox workspace folder: ${folder}`);
    return folder;
  }

  const docDir = path.dirname(docUri.fsPath);
  console.log(`tox doc path: ${docUri.fsPath} -> ${docDir}`);
  return docDir;
}

export function getTerminal(
  projDir: string = findProjectDir(),
  name = "Ansible Tox"
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
