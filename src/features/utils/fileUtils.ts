/* "stdlib" */
import * as vscode from "vscode";

/**
 * A helper function for inferring selected file from the context.
 * @param priorityPathObjs - Target file path candidates.
 * @returns A path to the currently selected file.
 */
export function extractTargetFsPath(
  ...priorityPathObjs: vscode.Uri[] | undefined[]
): { filePath: string; fileUri: vscode.Uri } {
  const pathCandidates: vscode.Uri[] = [
    ...priorityPathObjs,
    vscode.window.activeTextEditor?.document.uri,
  ]
    .filter((p) => p instanceof vscode.Uri)
    .map((p) => <vscode.Uri>p)
    .filter((p) => p.scheme === "file");
  const filePath = pathCandidates[0]?.fsPath;
  const fileUri = pathCandidates[0];
  return { filePath, fileUri };
}

export async function readFileContent(
  fileUri: vscode.Uri
): Promise<string | undefined> {
  try {
    const fileContentUint8Array = await vscode.workspace.fs.readFile(fileUri);
    const fileContent = new TextDecoder().decode(fileContentUint8Array);
    return fileContent;
  } catch (error) {
    vscode.window.showErrorMessage(`Could not read file: ${fileUri.fsPath}`);
    return;
  }
}
