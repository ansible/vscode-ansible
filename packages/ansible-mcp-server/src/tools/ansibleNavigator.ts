import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Runs ansible-navigator on an Ansible file using the `run` mode.
 *
 * @param filePath - The path to the Ansible file to run.
 * @param mode - Optional mode for output (e.g., 'stdout', 'stdout-minimal', 'interactive'). Defaults to 'stdout'.
 * @returns A promise that resolves with an object containing the output and debug information.
 * @throws An error if the process fails or returns an error.
 */
export async function runAnsibleNavigator(
  filePath: string,
  mode?: string,
): Promise<{ output: string; debugOutput?: string }> {
  if (!filePath) {
    throw new Error("No file path was provided for ansible-navigator.");
  }

  // Resolve the file path to absolute path
  const absolutePath = resolve(filePath);

  // Check if file exists
  try {
    await access(absolutePath);
  } catch {
    throw new Error(`File not found: ${absolutePath}`);
  }

  return new Promise((resolve, reject) => {
    const args = ["run", absolutePath];
    // Add mode if specified (default is stdout for non-interactive execution)
    if (mode) {
      args.push("--mode", mode);
    } else {
      // Default to stdout mode for MCP tool usage (non-interactive)
      args.push("--mode", "stdout");
    }
    const navProcess = spawn("ansible-navigator", args);

    let stdoutData = "";
    let stderrData = "";

    // Capture standard output
    navProcess.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    // Capture standard error (for debug output)
    navProcess.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    // Handle errors during process spawning (e.g., 'ansible-navigator' not found)
    navProcess.on("error", (err) => {
      reject(
        new Error(
          `Failed to start ansible-navigator process. Is it installed and in your PATH? Details: ${err.message}`,
        ),
      );
    });

    // Handle process exit
    navProcess.on("close", (code) => {
      // If process exits with non-zero code, include debug output
      if (code !== 0) {
        const debugInfo = stderrData || stdoutData;
        const errorMessage = `ansible-navigator exited with code ${code}`;
        
        // Include debug output in the error message for triage
        const fullError = debugInfo
          ? `${errorMessage}\n\nDebug output:\n${debugInfo}`
          : errorMessage;

        reject(new Error(fullError));
        return;
      }

      // Success case - return output
      resolve({
        output: stdoutData || "ansible-navigator completed successfully",
        debugOutput: stderrData || undefined,
      });
    });
  });
}

/**
 * Formats the ansible-navigator output into a user-friendly message
 */
export function formatNavigatorResult(
  output: string,
  debugOutput?: string,
  filePath?: string,
): string {
  const fileInfo = filePath ? ` for file: ${filePath}` : "";
  let formattedOutput = `ansible-navigator run completed${fileInfo}:\n\n`;

  if (output) {
    formattedOutput += `Output:\n${output}\n`;
  }

  if (debugOutput) {
    formattedOutput += `\nDebug information:\n${debugOutput}\n`;
  }

  return formattedOutput;
}

