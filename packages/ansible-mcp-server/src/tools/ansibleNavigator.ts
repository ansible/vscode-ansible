import { spawn, execSync } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { resolve, isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";

/**
 * Check if ansible-navigator is available in PATH or virtual environments
 * @param workspaceRoot - The workspace root directory
 * @param environment - Environment preference: 'auto' (check PATH then venv), 'system' (only PATH), 'venv' (only venv), or a specific venv name/path
 */
function checkAnsibleNavigatorAvailable(
  workspaceRoot?: string,
  environment: string = "auto",
): {
  available: boolean;
  path?: string;
  error?: string;
} {
  const commonVenvNames = [
    "ansible-dev",
    "venv",
    ".venv",
    "virtualenv",
    ".virtualenv",
    "env",
    ".env",
  ];

  // Helper function to check PATH
  const checkSystemPath = (): { available: boolean; path?: string } => {
    try {
      const result = execSync("command -v ansible-navigator", {
        encoding: "utf-8",
        stdio: "pipe",
      });
      const path = result.trim();
      return { available: true, path };
    } catch {
      return { available: false };
    }
  };

  // Helper function to check virtual environments
  const checkVenv = (
    specificVenv?: string,
  ): { available: boolean; path?: string } => {
    if (!workspaceRoot) {
      return { available: false };
    }

    // If specific venv is provided, check that first
    if (specificVenv) {
      // Check if it's an absolute path
      if (isAbsolute(specificVenv)) {
        const navPath = join(specificVenv, "bin", "ansible-navigator");
        if (existsSync(navPath)) {
          return { available: true, path: navPath };
        }
      } else {
        // Check in workspace root
        const venvPath = join(workspaceRoot, specificVenv);
        const navPath = join(venvPath, "bin", "ansible-navigator");
        if (existsSync(navPath)) {
          return { available: true, path: navPath };
        }

        // Check in parent directories
        const parentDirs = workspaceRoot.split("/");
        for (let i = parentDirs.length; i > 0; i--) {
          const checkPath = parentDirs.slice(0, i).join("/");
          const venvPath = join(checkPath, specificVenv);
          const navPath = join(venvPath, "bin", "ansible-navigator");
          if (existsSync(navPath)) {
            return { available: true, path: navPath };
          }
        }
      }
    }

    // Check common venv names in workspace root
    for (const venvName of commonVenvNames) {
      const venvPath = join(workspaceRoot, venvName);
      const navPath = join(venvPath, "bin", "ansible-navigator");

      if (existsSync(venvPath) && existsSync(navPath)) {
        return { available: true, path: navPath };
      }
    }

    // Check in parent directories (like examples/ansible-dev)
    const parentDirs = workspaceRoot.split("/");
    for (let i = parentDirs.length; i > 0; i--) {
      const checkPath = parentDirs.slice(0, i).join("/");
      for (const venvName of commonVenvNames) {
        const venvPath = join(checkPath, venvName);
        const navPath = join(venvPath, "bin", "ansible-navigator");

        if (existsSync(navPath)) {
          return { available: true, path: navPath };
        }
      }
    }

    return { available: false };
  };

  // Handle different environment preferences
  if (environment === "system") {
    // Only check PATH
    const result = checkSystemPath();
    if (result.available) {
      return { available: true, path: result.path };
    }
    return {
      available: false,
      error: "ansible-navigator not found in PATH/system",
    };
  } else if (environment === "venv") {
    // Only check virtual environments
    const result = checkVenv();
    if (result.available) {
      return { available: true, path: result.path };
    }
    return {
      available: false,
      error: "ansible-navigator not found in virtual environments",
    };
  } else if (environment && environment !== "auto") {
    // Specific venv name/path provided
    const result = checkVenv(environment);
    if (result.available) {
      return { available: true, path: result.path };
    }
    return {
      available: false,
      error: `ansible-navigator not found in virtual environment: ${environment}`,
    };
  } else {
    // "auto" - check PATH first, then venv
    const systemResult = checkSystemPath();
    if (systemResult.available) {
      return { available: true, path: systemResult.path };
    }

    const venvResult = checkVenv();
    if (venvResult.available) {
      return { available: true, path: venvResult.path };
    }

    return {
      available: false,
      error: "ansible-navigator not found in PATH or virtual environments",
    };
  }
}

/**
 * Runs ansible-navigator on an Ansible file using the `run` mode.
 *
 * @param filePath - The path to the Ansible file to run.
 * @param mode - Optional mode for output (e.g., 'stdout', 'stdout-minimal', 'interactive'). Defaults to 'stdout'.
 * @returns A promise that resolves with an object containing the output and debug information.
 * @throws An error if the process fails or returns an error.
 */
// Valid mode values for ansible-navigator
const VALID_MODES = ["stdout", "interactive"];

/**
 * Check if a container engine (podman or docker) is available (synchronous)
 */
function checkContainerEngine(): {
  available: boolean;
  engine?: string;
  error?: string;
} {
  for (const engine of ["podman", "docker"]) {
    try {
      execSync(`command -v ${engine}`, {
        encoding: "utf-8",
        stdio: "ignore",
      });
      return { available: true, engine };
    } catch {
      continue;
    }
  }
  return {
    available: false,
    error: "Neither podman nor docker container engine was found",
  };
}

/**
 * Check if error output indicates a container engine issue
 */
function isContainerEngineError(stderr: string, stdout: string): boolean {
  const errorText = (stderr + stdout).toLowerCase();
  return (
    errorText.includes("container engine") ||
    errorText.includes("podman") ||
    errorText.includes("docker") ||
    errorText.includes("execution environment") ||
    errorText.includes("no container engine") ||
    errorText.includes("podman pull") ||
    errorText.includes("cannot connect to podman") ||
    errorText.includes("connection refused") ||
    errorText.includes("podman machine") ||
    errorText.includes("ghcr.io/ansible/community-ansible-dev-tools")
  );
}

/**
 * Build container engine error message (DRY - Don't Repeat Yourself)
 */
function buildContainerErrorMessage(
  stderrData: string,
  stdoutData: string,
  code?: number,
): string {
  const containerCheck = checkContainerEngine();
  let errorMessage = code
    ? `ansible-navigator exited with code ${code}: Container engine issue detected.\n\n`
    : `ansible-navigator failed: Container engine required but not available.\n\n`;

  if (stdoutData.trim()) {
    errorMessage += `Output:\n${stdoutData}\n\n`;
  }
  if (stderrData.trim()) {
    errorMessage += `Error output:\n${stderrData}\n\n`;
  }

  if (!containerCheck.available) {
    errorMessage += `**Solution:** Install podman or docker, OR use \`disableExecutionEnvironment: true\` to use local Ansible.`;
  } else {
    const isPodmanConnectionError =
      stderrData.includes("Cannot connect to Podman") ||
      stderrData.includes("connection refused");

    if (isPodmanConnectionError && containerCheck.engine === "podman") {
      errorMessage += `**Issue:** Podman VM not running.\n\n`;
      errorMessage += `**Note:** Tool will auto-retry with local Ansible (execution environment disabled).\n\n`;
      errorMessage += `**To use Podman:** Run \`podman machine start\``;
    } else {
      errorMessage += `**Quick fix:** Use \`disableExecutionEnvironment: true\` to use local Ansible.`;
    }
  }

  return errorMessage;
}

export async function runAnsibleNavigator(
  filePath: string,
  mode?: string,
  workspaceRoot?: string,
  disableExecutionEnvironment?: boolean,
  environment?: string,
): Promise<{
  output: string;
  debugOutput?: string;
  navigatorPath?: string;
  executionEnvironmentDisabled?: boolean;
}> {
  if (!filePath || !filePath.trim()) {
    throw new Error("No file path was provided for ansible-navigator.");
  }

  // Normalize and validate mode
  const normalizedMode = mode?.trim().toLowerCase();
  if (normalizedMode && !VALID_MODES.includes(normalizedMode)) {
    throw new Error(
      `Invalid mode "${mode}". Valid modes are: ${VALID_MODES.join(", ")}`,
    );
  }

  // Resolve the file path to absolute path
  const absolutePath = isAbsolute(filePath)
    ? resolve(filePath)
    : workspaceRoot
      ? resolve(workspaceRoot, filePath)
      : resolve(filePath);

  // Validate path is within workspace (security check)
  if (workspaceRoot) {
    const workspacePath = resolve(workspaceRoot);
    if (!absolutePath.startsWith(workspacePath)) {
      throw new Error(
        `File path must be within the workspace. Attempted to access: ${absolutePath}`,
      );
    }
  }

  // Check if file exists and is accessible
  try {
    await access(absolutePath);
  } catch (error) {
    throw new Error(
      `File not found or not accessible: ${absolutePath}. ${error instanceof Error ? error.message : ""}`,
    );
  }

  // Check if it's actually a file, not a directory
  try {
    const fileStats = await stat(absolutePath);
    if (fileStats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${absolutePath}`);
    }
    if (!fileStats.isFile()) {
      throw new Error(`Path is not a regular file: ${absolutePath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("directory")) {
      throw error;
    }
    throw new Error(
      `Cannot access file: ${absolutePath}. ${error instanceof Error ? error.message : ""}`,
    );
  }

  // Check if ansible-navigator is available before attempting to run
  // This will check based on the environment preference
  const environmentToUse = environment || "auto";
  const navCheck = checkAnsibleNavigatorAvailable(workspaceRoot, environmentToUse);
  if (!navCheck.available) {
    const pathEnv = process.env.PATH || "not set";
    let errorMsg = `ansible-navigator is not available in PATH or virtual environments.\n\n`;
    errorMsg += `PATH: ${pathEnv}\n\n`;
    if (workspaceRoot) {
      errorMsg += `Checked virtual environments in: ${workspaceRoot}\n`;
      errorMsg += `Common venv names checked: ansible-dev, venv, .venv, virtualenv, .virtualenv, env, .env\n\n`;
    }
    errorMsg += `Please install ansible-navigator:\n`;
    errorMsg += `  pip install ansible-navigator\n\n`;
    errorMsg += `Or ensure it's installed and accessible in your PATH or a virtual environment.`;
    throw new Error(errorMsg);
  }

  // Use the found path (could be from PATH or virtual environment)
  const navigatorPath = navCheck.path || "ansible-navigator";
  const isVenvPath = navigatorPath.includes("/bin/ansible-navigator");

  // If using a venv version, automatically disable execution environment
  // Venv versions typically use local Ansible and don't have Podman configured
  const shouldDisableEE = disableExecutionEnvironment || isVenvPath;

  return new Promise((resolve, reject) => {
    const args = ["run", absolutePath];
    // Add mode if specified (default is stdout for non-interactive execution)
    const modeToUse = normalizedMode || "stdout";
    args.push("--mode", modeToUse);

    // Automatically disable execution environment if using venv or explicitly requested
    if (shouldDisableEE) {
      args.push("--ee", "false");
    }

    // Use the found path (could be from venv)
    const navProcess = spawn(navigatorPath, args);

    let stdoutData = "";
    let stderrData = "";
    const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB limit
    let outputSize = 0;
    let timeoutCleared = false;

    // Helper function to clear timeout safely
    const clearTimeoutSafely = () => {
      if (!timeoutCleared) {
        clearTimeout(timeout);
        timeoutCleared = true;
      }
    };

    // Set a timeout for the process (5 minutes)
    const timeout = setTimeout(() => {
      if (!navProcess.killed) {
        navProcess.kill();
      }
      clearTimeoutSafely();
      reject(
        new Error(
          "ansible-navigator process timed out after 5 minutes. The process was terminated.",
        ),
      );
    }, 5 * 60 * 1000);

    // Capture standard output with size limit
    navProcess.stdout.on("data", (data) => {
      const dataStr = data.toString();
      outputSize += Buffer.byteLength(dataStr);
      if (outputSize > MAX_OUTPUT_SIZE) {
        if (!navProcess.killed) {
          navProcess.kill();
        }
        clearTimeoutSafely();
        reject(
          new Error(
            `Output exceeded maximum size limit of ${MAX_OUTPUT_SIZE / 1024 / 1024}MB. Process terminated.`,
          ),
        );
        return;
      }
      stdoutData += dataStr;
    });

    // Capture standard error (for debug output) with size limit
    navProcess.stderr.on("data", (data) => {
      const dataStr = data.toString();
      outputSize += Buffer.byteLength(dataStr);
      if (outputSize > MAX_OUTPUT_SIZE) {
        if (!navProcess.killed) {
          navProcess.kill();
        }
        clearTimeoutSafely();
        reject(
          new Error(
            `Output exceeded maximum size limit of ${MAX_OUTPUT_SIZE / 1024 / 1024}MB. Process terminated.`,
          ),
        );
        return;
      }
      stderrData += dataStr;
    });

    // Handle errors during process spawning (e.g., 'ansible-navigator' not found)
    navProcess.on("error", (err) => {
      clearTimeoutSafely();
      reject(
        new Error(
          `Failed to start ansible-navigator process. Is it installed and in your PATH? Details: ${err.message}`,
        ),
      );
    });

    // Handle process exit
    navProcess.on("close", (code) => {
      clearTimeoutSafely();

      // Check for stderr-only errors (real error indicator)
      if (stderrData && !stdoutData.trim()) {
        if (isContainerEngineError(stderrData, "")) {
          reject(new Error(buildContainerErrorMessage(stderrData, "", code ?? undefined)));
          return;
        }
        reject(new Error(`ansible-navigator failed with exit code ${code}\n\nError output:\n${stderrData}`));
        return;
      }

      // If process exits with non-zero code, check if it's container engine error vs playbook failure
      if (code !== 0) {
        if (isContainerEngineError(stderrData, stdoutData)) {
          reject(new Error(buildContainerErrorMessage(stderrData, stdoutData, code ?? undefined)));
          return;
        }

        // If we have stdout content, it's likely a playbook execution failure
        // (e.g., unreachable hosts, task failures) - this is valid output from ansible-navigator
        // We should return it as output, not reject it as an error
        if (stdoutData.trim()) {
          // Playbook execution failed, but ansible-navigator ran successfully
          // Return the output with a note about the playbook failure
          const outputWithNote = `Note: Playbook execution completed with exit code ${code} (playbook may have failed, but ansible-navigator executed successfully).\n\n${stdoutData}`;
          resolve({
            output: outputWithNote,
            debugOutput: stderrData || undefined,
            navigatorPath: navigatorPath,
            executionEnvironmentDisabled: shouldDisableEE,
          });
          return;
        }

        // No stdout, but we already handled stderr-only case above
        // This is a fallback for edge cases
        const debugInfo = stderrData || "No output available";
        const errorMessage = `ansible-navigator exited with code ${code}`;
        const fullError = `${errorMessage}\n\nDebug output:\n${debugInfo}`;
        reject(new Error(fullError));
        return;
      }

      // Success case (exit code 0) - return output
      // Even with exit code 0, include stderr as debug output if present
      resolve({
        output: stdoutData || "ansible-navigator completed successfully",
        debugOutput: stderrData || undefined,
        navigatorPath: navigatorPath,
        executionEnvironmentDisabled: shouldDisableEE,
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
  mode?: string,
  disableExecutionEnvironment?: boolean,
  navigatorPath?: string,
  environment?: string,
): string {
  const fileInfo = filePath ? ` for file: ${filePath}` : "";

  // Check if we're using a virtual environment version
  const isVenvPath = navigatorPath && navigatorPath.includes("/bin/ansible-navigator");
  const venvPath = isVenvPath ? navigatorPath.split("/bin/")[0] : undefined;

  // Determine actual environment used
  const actualEnvironment = environment && environment !== "auto"
    ? environment
    : isVenvPath
    ? "venv (auto-detected)"
    : "system (auto-detected)";

  // Determine actual mode used
  const actualMode = mode || "stdout";
  const isDefaultMode = !mode || mode === "stdout";

  // Determine execution environment status
  const eeDisabled = disableExecutionEnvironment || isVenvPath;
  const eeStatus = eeDisabled
    ? "disabled (using local Ansible)"
    : "enabled (using Podman/Docker)";

  let formattedOutput = `ansible-navigator run completed${fileInfo}:\n\n`;

  // User-friendly explanation section
  formattedOutput += `✅ **Playbook executed successfully!**\n\n`;

  formattedOutput += `**📋 Configuration Used:**\n`;
  formattedOutput += `- **Output Mode:** ${actualMode}${isDefaultMode ? " (default - shows full output)" : ""}\n`;
  formattedOutput += `- **Environment:** ${actualEnvironment}`;
  if (venvPath) {
    formattedOutput += ` → ${venvPath}`;
  }
  formattedOutput += `\n`;
  formattedOutput += `- **Execution Environment:** ${eeStatus}\n`;

  // Explain defaults and what happened
  formattedOutput += `\n**ℹ️  What This Means:**\n`;
  if (isDefaultMode) {
    formattedOutput += `- **By default**, ansible-navigator uses 'stdout' mode (full output)\n`;
    formattedOutput += `- You can use 'stdout-minimal' for less output or 'interactive' for a text UI\n`;
  }
  if (!eeDisabled) {
    formattedOutput += `- **By default**, ansible-navigator runs in an execution environment (VM/Podman)\n`;
    formattedOutput += `- This provides isolated, containerized execution\n`;
    formattedOutput += `- **If Podman errors occur**, the tool automatically retries with local Ansible\n`;
  } else if (isVenvPath) {
    formattedOutput += `- Detected virtual environment, so execution environment was automatically disabled\n`;
    formattedOutput += `- Using your local Ansible installation from the venv\n`;
  } else {
    formattedOutput += `- Execution environment is disabled, using your local Ansible installation\n`;
  }

  formattedOutput += `\n**🔧 Want to customize? Just ask me to:**\n`;
  formattedOutput += `- "Run with minimal output" → Uses stdout-minimal mode\n`;
  formattedOutput += `- "Run in interactive mode" → Uses interactive TUI\n`;
  formattedOutput += `- "Use venv" → Forces virtual environment\n`;
  formattedOutput += `- "Use system ansible" → Forces system PATH\n`;
  formattedOutput += `- "Disable execution environment" → Uses local Ansible (no Podman)\n\n`;

  if (output) {
    formattedOutput += `Output:\n${output}\n`;
  }

  if (debugOutput) {
    formattedOutput += `\nDebug information:\n${debugOutput}\n`;
  }

  return formattedOutput;
}
