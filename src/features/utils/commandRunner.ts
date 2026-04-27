/* local */
import * as path from "path";
import * as vscode from "vscode";
import type { ExtensionSettings } from "@src/interfaces/extensionSettings";
import { PythonEnvironmentService } from "@src/services/PythonEnvironmentService";

/**
 * Build a command with the active Python environment's bin directory in PATH.
 * Uses Python environment resolution with user config fallback.
 * This ensures commands like ansible-creator run from the correct venv.
 *
 * NOTE: For terminal-based execution, prefer using TerminalService which handles
 * Python environment activation automatically via the Python extension.
 *
 * @param settings - The extension setting.
 * @param runExecutable - The name of the executable to run.
 * @param cmdArgs - The arguments to the executable.
 * @param scope - Optional workspace scope for environment resolution.
 * @returns Promise resolving to the command and environment with venv PATH.
 */
export async function withInterpreter(
  settings: ExtensionSettings,
  runExecutable: string,
  cmdArgs: string,
  scope?: import("vscode").Uri,
): Promise<{ command: string; env: NodeJS.ProcessEnv }> {
  // Build command string
  const command = `${runExecutable} ${cmdArgs}`;

  // Start with base environment and Ansible-specific vars
  const env = Object.assign({}, process.env, {
    ANSIBLE_FORCE_COLOR: "0", // ensure output is parsable (no ANSI)
    PYTHONBREAKPOINT: "0", // prevent debugger from being triggered
  });

  // Resolve Python environment and add venv bin to PATH
  const pythonEnvService = PythonEnvironmentService.getInstance();

  // Get interpreter path (respects user config, then Python extension)
  const execPath = await pythonEnvService.resolveInterpreterPath(
    settings.interpreterPath,
    scope,
  );

  if (execPath) {
    // Add venv bin directory to PATH (like TerminalService does)
    const binDir = path.dirname(execPath);
    const existingPath = env.PATH ?? process.env.PATH ?? "";
    env.PATH = `${binDir}${path.delimiter}${existingPath}`;

    // Set VIRTUAL_ENV for tools that check it (defensive pattern from TerminalService)
    const environment = await pythonEnvService.getEnvironment(scope);
    if (environment?.environmentPath) {
      const envPath = environment.environmentPath;
      if (envPath instanceof vscode.Uri) {
        env.VIRTUAL_ENV = envPath.fsPath;
      } else if (typeof envPath === "string") {
        env.VIRTUAL_ENV = envPath;
      }
    }
  }

  return { command, env };
}
