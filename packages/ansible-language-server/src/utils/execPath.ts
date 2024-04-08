// utils function to resolve executable path
import * as path from "path";
import { ExtensionSettings } from "../interfaces/extensionSettings";

/**
 * A method to return the path to the provided executable
 * @param name - String representing the name of the ansible executable
 * @param settings - The settings received from client
 * @returns Complete path of the ansible executable (string)
 */
export function getAnsibleCommandExecPath(
  name: string,
  settings: ExtensionSettings,
): string {
  return name === "ansible-lint"
    ? settings.validation.lint.path
    : path.join(path.dirname(settings.ansible.path), name);
}
