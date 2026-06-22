import { spawn, execSync } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";
import { quote } from "shell-quote";

const COMMON_VENV_NAMES = [
  "ansible-dev",
  "venv",
  ".venv",
  "virtualenv",
  ".virtualenv",
  "env",
  ".env",
];

/**
 * Check if ansible-navigator is in the system PATH.
 */
function checkSystemPath(): { available: boolean; path?: string } {
  try {
    // SECURITY: Safe - hardcoded command name with no user input
    const result = execSync("command -v ansible-navigator", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    return { available: true, path: result.trim() };
  } catch {
    return { available: false };
  }
}

/**
 * Search for ansible-navigator in a specific venv (absolute or relative).
 */
export function findNavigatorInSpecificVenv(
  specificVenv: string,
  workspaceRoot: string,
): string | undefined {
  if (isAbsolute(specificVenv)) {
    const navPath = join(specificVenv, "bin", "ansible-navigator");
    return existsSync(navPath) ? navPath : undefined;
  }

  const workspaceNavPath = join(
    workspaceRoot,
    specificVenv,
    "bin",
    "ansible-navigator",
  );
  if (existsSync(workspaceNavPath)) {
    return workspaceNavPath;
  }

  const parentDirs = workspaceRoot.split("/");
  for (let i = parentDirs.length; i > 0; i--) {
    const navPath = join(
      parentDirs.slice(0, i).join("/"),
      specificVenv,
      "bin",
      "ansible-navigator",
    );
    if (existsSync(navPath)) {
      return navPath;
    }
  }

  return undefined;
}

/**
 * Search common venv locations for ansible-navigator.
 */
export function findNavigatorInCommonVenvs(
  workspaceRoot: string,
): string | undefined {
  for (const venvName of COMMON_VENV_NAMES) {
    const venvPath = join(workspaceRoot, venvName);
    const navPath = join(venvPath, "bin", "ansible-navigator");
    if (existsSync(venvPath) && existsSync(navPath)) {
      return navPath;
    }
  }

  const parentDirs = workspaceRoot.split("/");
  for (let i = parentDirs.length; i > 0; i--) {
    const checkPath = parentDirs.slice(0, i).join("/");
    for (const venvName of COMMON_VENV_NAMES) {
      const navPath = join(checkPath, venvName, "bin", "ansible-navigator");
      if (existsSync(navPath)) {
        return navPath;
      }
    }
  }

  return undefined;
}

/**
 * Search virtual environments for ansible-navigator.
 */
export function checkVenv(
  workspaceRoot?: string,
  specificVenv?: string,
): { available: boolean; path?: string } {
  if (!workspaceRoot) {
    return { available: false };
  }

  if (specificVenv) {
    const found = findNavigatorInSpecificVenv(specificVenv, workspaceRoot);
    if (found) {
      return { available: true, path: found };
    }
  }

  const found = findNavigatorInCommonVenvs(workspaceRoot);
  return found ? { available: true, path: found } : { available: false };
}

/**
 * Check if ansible-navigator is available in PATH or virtual environments
 * @param workspaceRoot - The workspace root directory
 * @param environment - Environment preference: 'auto' (check PATH then venv), 'system' (only PATH), 'venv' (only venv), or a specific venv name/path
 */
export function checkAnsibleNavigatorAvailable(
  workspaceRoot?: string,
  environment: string = "auto",
): {
  available: boolean;
  path?: string;
  error?: string;
} {
  if (environment === "system") {
    const result = checkSystemPath();
    return result.available
      ? { available: true, path: result.path }
      : {
          available: false,
          error: "ansible-navigator not found in PATH/system",
        };
  }

  if (environment === "venv") {
    const result = checkVenv(workspaceRoot);
    return result.available
      ? { available: true, path: result.path }
      : {
          available: false,
          error: "ansible-navigator not found in virtual environments",
        };
  }

  if (environment !== "auto") {
    const result = checkVenv(workspaceRoot, environment);
    return result.available
      ? { available: true, path: result.path }
      : {
          available: false,
          error: `ansible-navigator not found in virtual environment: ${environment}`,
        };
  }

  // "auto" - check PATH first, then venv
  const systemResult = checkSystemPath();
  if (systemResult.available) {
    return { available: true, path: systemResult.path };
  }

  const venvResult = checkVenv(workspaceRoot);
  return venvResult.available
    ? { available: true, path: venvResult.path }
    : {
        available: false,
        error: "ansible-navigator not found in PATH or virtual environments",
      };
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
  // SECURITY: Hardcoded whitelist to prevent command injection
  // Only "podman" and "docker" are allowed - no user input possible
  const ALLOWED_ENGINES = ["podman", "docker"] as const;

  for (const engine of ALLOWED_ENGINES) {
    try {
      // SECURITY: Safe - engine comes from compile-time constant array above
      // TypeScript 'as const' ensures ALLOWED_ENGINES cannot be modified
      // No user input, no dynamic values - only ["podman", "docker"] possible
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

interface NavigatorResult {
  output: string;
  debugOutput?: string;
  navigatorPath?: string;
  executionEnvironmentDisabled?: boolean;
}

/**
 * Validate the mode string and return the normalized value.
 * Throws on invalid modes.
 */
function validateMode(mode?: string): string | undefined {
  const normalizedMode = mode?.trim().toLowerCase();
  if (normalizedMode && !VALID_MODES.includes(normalizedMode)) {
    throw new Error(
      `Invalid mode "${mode}". Valid modes are: ${VALID_MODES.join(", ")}`,
    );
  }
  return normalizedMode;
}

/**
 * Resolve and validate the target file path.
 * Ensures the path exists, is a regular file, and is inside the workspace.
 */
async function resolveAndValidateFilePath(
  filePath: string,
  workspaceRoot?: string,
): Promise<string> {
  if (!filePath?.trim()) {
    throw new Error("No file path was provided for ansible-navigator.");
  }

  let absolutePath: string;
  if (isAbsolute(filePath)) {
    absolutePath = resolve(filePath);
  } else if (workspaceRoot) {
    absolutePath = resolve(workspaceRoot, filePath);
  } else {
    absolutePath = resolve(filePath);
  }

  if (workspaceRoot) {
    const rel = relative(resolve(workspaceRoot), absolutePath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(
        `File path must be within the workspace. Attempted to access: ${absolutePath}`,
      );
    }
  }

  try {
    await access(absolutePath);
  } catch (error) {
    throw new Error(
      `File not found or not accessible: ${absolutePath}. ${error instanceof Error ? error.message : ""}`,
      { cause: error },
    );
  }

  await validateFileType(absolutePath);
  return absolutePath;
}

/**
 * Ensure the path points to a regular file (not a directory or other type).
 */
async function validateFileType(absolutePath: string): Promise<void> {
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
      { cause: error },
    );
  }
}

/**
 * Locate ansible-navigator (PATH / venv) and return its resolved path.
 * Throws when not found.
 */
export function resolveNavigatorPath(
  workspaceRoot?: string,
  environment: string = "auto",
): { navigatorPath: string; shouldDisableEE: boolean } {
  const navCheck = checkAnsibleNavigatorAvailable(workspaceRoot, environment);
  if (!navCheck.available) {
    const pathEnv = process.env.PATH || "not set";
    let errorMsg = `ansible-navigator is not available in PATH or virtual environments.\n\n`;
    errorMsg += `PATH: ${pathEnv}\n\n`;
    if (workspaceRoot) {
      errorMsg += `Checked virtual environments in: ${workspaceRoot}\n`;
      errorMsg += `Common venv names checked: ${COMMON_VENV_NAMES.join(", ")}\n\n`;
    }
    errorMsg += `Please install ansible-navigator:\n`;
    errorMsg += `  pip install ansible-navigator\n\n`;
    errorMsg += `Or ensure it's installed and accessible in your PATH or a virtual environment.`;
    throw new Error(errorMsg);
  }

  const navigatorPath = navCheck.path || "ansible-navigator";
  const isVenvPath = navigatorPath.includes("/bin/ansible-navigator");
  return { navigatorPath, shouldDisableEE: isVenvPath };
}

/**
 * Interpret the exit result of an ansible-navigator process.
 * Returns a NavigatorResult on success / playbook failure, or throws on
 * infrastructure errors.
 */
function interpretProcessExit(
  code: number | null,
  stdoutData: string,
  stderrData: string,
  navigatorPath: string,
  shouldDisableEE: boolean,
): NavigatorResult {
  // stderr-only output is a real infrastructure error
  if (stderrData && !stdoutData.trim()) {
    if (isContainerEngineError(stderrData, "")) {
      throw new Error(
        buildContainerErrorMessage(stderrData, "", code ?? undefined),
      );
    }
    throw new Error(
      `ansible-navigator failed with exit code ${code}\n\nError output:\n${stderrData}`,
    );
  }

  if (code !== 0) {
    if (isContainerEngineError(stderrData, stdoutData)) {
      throw new Error(
        buildContainerErrorMessage(stderrData, stdoutData, code ?? undefined),
      );
    }

    // stdout present → playbook execution failure (not a navigator error)
    if (stdoutData.trim()) {
      return {
        output: `Note: Playbook execution completed with exit code ${code} (playbook may have failed, but ansible-navigator executed successfully).\n\n${stdoutData}`,
        debugOutput: stderrData || undefined,
        navigatorPath,
        executionEnvironmentDisabled: shouldDisableEE,
      };
    }

    const debugInfo = stderrData || "No output available";
    throw new Error(
      `ansible-navigator exited with code ${code}\n\nDebug output:\n${debugInfo}`,
    );
  }

  return {
    output: stdoutData || "ansible-navigator completed successfully",
    debugOutput: stderrData || undefined,
    navigatorPath,
    executionEnvironmentDisabled: shouldDisableEE,
  };
}

export async function runAnsibleNavigator(
  filePath: string,
  mode?: string,
  workspaceRoot?: string,
  disableExecutionEnvironment?: boolean,
  environment?: string,
): Promise<NavigatorResult> {
  const normalizedMode = validateMode(mode);
  const absolutePath = await resolveAndValidateFilePath(
    filePath,
    workspaceRoot,
  );

  const environmentToUse = environment || "auto";
  const { navigatorPath, shouldDisableEE: venvDisableEE } =
    resolveNavigatorPath(workspaceRoot, environmentToUse);
  const shouldDisableEE = disableExecutionEnvironment || venvDisableEE;

  return new Promise((resolve, reject) => {
    const args = ["run", absolutePath];
    const modeToUse = normalizedMode || "stdout";
    args.push("--mode", modeToUse);

    if (shouldDisableEE) {
      args.push("--ee", "false");
    }

    args.push("--log-file", "/dev/null");

    const navProcess = spawn(quote([navigatorPath, ...args]), {
      shell: true,
      env: process.env,
    });

    let stdoutData = "";
    let stderrData = "";
    const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB limit
    let outputSize = 0;
    let timeoutCleared = false;

    const clearTimeoutSafely = () => {
      if (!timeoutCleared) {
        clearTimeout(timeout);
        timeoutCleared = true;
      }
    };

    const killAndReject = (error: Error) => {
      if (!navProcess.killed) {
        navProcess.kill();
      }
      clearTimeoutSafely();
      reject(error);
    };

    const handleData = (chunk: Buffer | string, target: "out" | "err") => {
      const dataStr = chunk.toString();
      outputSize += Buffer.byteLength(dataStr);
      if (outputSize > MAX_OUTPUT_SIZE) {
        killAndReject(
          new Error(
            `Output exceeded maximum size limit of ${MAX_OUTPUT_SIZE / 1024 / 1024}MB. Process terminated.`,
          ),
        );
        return;
      }
      if (target === "out") {
        stdoutData += dataStr;
      } else {
        stderrData += dataStr;
      }
    };

    const timeout = setTimeout(
      () => {
        killAndReject(
          new Error(
            "ansible-navigator process timed out after 5 minutes. The process was terminated.",
          ),
        );
      },
      5 * 60 * 1000,
    );

    navProcess.stdout.on("data", (data: Buffer | string) =>
      handleData(data, "out"),
    );
    navProcess.stderr.on("data", (data: Buffer | string) =>
      handleData(data, "err"),
    );

    navProcess.on("error", (err) => {
      clearTimeoutSafely();
      reject(
        new Error(
          `Failed to start ansible-navigator process. Is it installed and in your PATH? Details: ${err.message}`,
        ),
      );
    });

    navProcess.on("close", (code) => {
      clearTimeoutSafely();
      try {
        resolve(
          interpretProcessExit(
            code,
            stdoutData,
            stderrData,
            navigatorPath,
            shouldDisableEE,
          ),
        );
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Formats the ansible-navigator output into a user-friendly message
 */
interface NavigatorDisplayMeta {
  fileInfo: string;
  isVenvPath: boolean;
  venvPath: string | undefined;
  actualEnvironment: string;
  actualMode: string;
  isDefaultMode: boolean;
  eeDisabled: boolean;
  eeStatus: string;
}

/**
 * Derive display metadata from raw navigator parameters.
 */
function buildNavigatorDisplayMeta(
  filePath?: string,
  mode?: string,
  disableExecutionEnvironment?: boolean,
  navigatorPath?: string,
  environment?: string,
): NavigatorDisplayMeta {
  const fileInfo = filePath ? ` for file: ${filePath}` : "";
  const isVenvPath = Boolean(navigatorPath?.includes("/bin/ansible-navigator"));
  const venvPath =
    isVenvPath && navigatorPath ? navigatorPath.split("/bin/")[0] : undefined;

  let actualEnvironment: string;
  if (environment && environment !== "auto") {
    actualEnvironment = environment;
  } else {
    actualEnvironment = isVenvPath
      ? "venv (auto-detected)"
      : "system (auto-detected)";
  }

  const actualMode = mode || "stdout";
  const isDefaultMode = !mode || mode === "stdout";
  const eeDisabled = Boolean(disableExecutionEnvironment || isVenvPath);
  const eeStatus = eeDisabled
    ? "disabled (using local Ansible)"
    : "enabled (using Podman/Docker)";

  return {
    fileInfo,
    isVenvPath,
    venvPath,
    actualEnvironment,
    actualMode,
    isDefaultMode,
    eeDisabled,
    eeStatus,
  };
}

/**
 * Build the "What This Means" explanation section.
 */
function buildExplanationSection(meta: NavigatorDisplayMeta): string {
  let section = `\n**ℹ️  What This Means:**\n`;
  if (meta.isDefaultMode) {
    section += `- **By default**, ansible-navigator uses 'stdout' mode (full output)\n`;
    section += `- You can use 'stdout-minimal' for less output or 'interactive' for a text UI\n`;
  }
  if (!meta.eeDisabled) {
    section += `- **By default**, ansible-navigator runs in an execution environment (VM/Podman)\n`;
    section += `- This provides isolated, containerized execution\n`;
    section += `- **If Podman errors occur**, the tool automatically retries with local Ansible\n`;
  } else if (meta.isVenvPath) {
    section += `- Detected virtual environment, so execution environment was automatically disabled\n`;
    section += `- Using your local Ansible installation from the venv\n`;
  } else {
    section += `- Execution environment is disabled, using your local Ansible installation\n`;
  }
  return section;
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
  const meta = buildNavigatorDisplayMeta(
    filePath,
    mode,
    disableExecutionEnvironment,
    navigatorPath,
    environment,
  );

  const envSuffix = meta.venvPath ? ` → ${meta.venvPath}` : "";
  const modeSuffix = meta.isDefaultMode ? " (default - shows full output)" : "";

  let formattedOutput = `ansible-navigator run completed${meta.fileInfo}:\n\n`;
  formattedOutput += `✅ **Playbook executed successfully!**\n\n`;
  formattedOutput += `**📋 Configuration Used:**\n`;
  formattedOutput += `- **Output Mode:** ${meta.actualMode}${modeSuffix}\n`;
  formattedOutput += `- **Environment:** ${meta.actualEnvironment}${envSuffix}\n`;
  formattedOutput += `- **Execution Environment:** ${meta.eeStatus}\n`;

  formattedOutput += buildExplanationSection(meta);

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
