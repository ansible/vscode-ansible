/* stdlib */

/* local */
import { ExtensionSettings } from "../../interfaces/extensionSettings";

/**
 * A helper method to build a command with appropriate environment variables.
 *
 * NOTE: This function is maintained for backward compatibility.
 * For terminal-based execution, prefer using TerminalService which handles
 * Python environment activation automatically via the Python extension.
 *
 * @param settings - The extension setting.
 * @param runExecutable - The name of the executable to run.
 * @param cmdArgs - The arguments to the executable.
 * @returns The complete command to be executed with environment.
 */
export function withInterpreter(
  settings: ExtensionSettings,
  runExecutable: string,
  cmdArgs: string,
): { command: string; env: NodeJS.ProcessEnv } {
  const command = `${runExecutable} ${cmdArgs}`;

  const newEnv = Object.assign({}, process.env, {
    ANSIBLE_FORCE_COLOR: "0", // ensure output is parsable (no ANSI)
    PYTHONBREAKPOINT: "0", // We want to be sure that python debugger is never
    // triggered, even if we mistakenly left a breakpoint() there while
    // debugging ansible-lint, or another tool we call.
  });

  return { command: command, env: newEnv } as const;
}
