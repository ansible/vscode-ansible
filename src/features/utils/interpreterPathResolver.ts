import * as os from "os";
import * as path from "path";
import { Uri, workspace } from "vscode";

/**
 * Expands tilde (~) in a path to the user's home directory.
 * Handles both ~ alone and ~/path formats.
 */
export function expandTilde(filePath: string): string {
  if (!filePath) {
    return filePath;
  }

  if (filePath === "~") {
    return os.homedir();
  }

  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  return filePath;
}

export function resolveInterpreterPath(
  interpreterPath: string | undefined,
  documentUri?: Uri,
): string | undefined {
  if (!interpreterPath || interpreterPath.trim() === "") {
    return undefined;
  }

  let resolvedPath = interpreterPath;

  if (resolvedPath.startsWith("~")) {
    resolvedPath = expandTilde(resolvedPath);
  }

  if (resolvedPath.includes("${workspaceFolder}")) {
    const workspaceFolder = getWorkspaceFolderPath(documentUri);
    if (workspaceFolder) {
      resolvedPath = resolvedPath.replace(
        /\$\{workspaceFolder\}/g,
        workspaceFolder,
      );
    } else {
      console.warn(
        `Cannot resolve \${workspaceFolder} in interpreter path: ${interpreterPath}`,
      );
      return interpreterPath;
    }
  }

  if (!path.isAbsolute(resolvedPath)) {
    const workspaceFolder = getWorkspaceFolderPath(documentUri);
    if (workspaceFolder) {
      resolvedPath = path.resolve(workspaceFolder, resolvedPath);
    }
  }

  return resolvedPath;
}

export function getWorkspaceFolderPath(documentUri?: Uri): string | undefined {
  if (documentUri) {
    const workspaceFolder = workspace.getWorkspaceFolder(documentUri);
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }
  }

  const workspaceFolders = workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }

  return undefined;
}

export function isUserConfiguredPath(
  interpreterPath: string | undefined,
): boolean {
  if (!interpreterPath || interpreterPath.trim() === "") {
    return false;
  }

  if (interpreterPath.includes("${workspaceFolder}")) {
    return true;
  }

  if (interpreterPath.startsWith("~")) {
    return true;
  }

  if (
    !path.isAbsolute(interpreterPath) &&
    (interpreterPath.startsWith("./") || interpreterPath.startsWith("../"))
  ) {
    return true;
  }

  return false;
}
