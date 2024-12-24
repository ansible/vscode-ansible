// utils function to resolve executable path
import { URI } from "vscode-uri";
import * as path from "path";
import { ExtensionSettings } from "../interfaces/extensionSettings";
import { WorkspaceFolderContext } from "../services/workspaceManager";

/**
 * A method to return the path to the provided executable
 * @param name - String representing the name of the ansible executable
 * @param settings - The settings received from client
 * @returns Complete path of the ansible executable (string)
 */
export function getAnsibleCommandExecPath(
  name: string,
  settings: ExtensionSettings,
  context: WorkspaceFolderContext,
): string {
  let pathFromSettings =
    name === "ansible-lint"
      ? settings.validation.lint.path
      : path.join(path.dirname(settings.ansible.path), name);
  return replaceWorkspaceFolderInPath(pathFromSettings, context);
}

export function replaceWorkspaceFolderInPath(
  p: string,
  context: WorkspaceFolderContext,
): string {
  if (p.includes("${workspaceFolder}")) {
    const workspaceFolder = URI.parse(context.workspaceFolder.uri).path;
    p = p.replace("${workspaceFolder}", workspaceFolder);
  }
  return p;
}
