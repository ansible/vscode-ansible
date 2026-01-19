import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface ADEEnvironmentInfo {
  virtualEnv: string | null;
  pythonVersion: string;
  ansibleVersion: string | null;
  ansibleLintVersion: string | null;
  installedCollections: string[];
  workspacePath: string;
  adeInstalled: boolean;
  adtInstalled: boolean;
}

export interface ADECommandResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  pythonPath?: string;
}

/**
 * System information provided by the LLM for OS-specific package management.
 * The LLM MUST provide osType and osDistro - no auto-detection fallback.
 */
export interface SystemInfo {
  /** Operating system type (e.g., 'linux', 'darwin', 'windows') - REQUIRED */
  osType: string;
  /** OS distribution name (e.g., 'ubuntu', 'fedora', 'rhel', 'debian', 'macos') - REQUIRED for Linux */
  osDistro?: string;
  /** OS version (e.g., '22.04', '39', '14') */
  osVersion?: string;
  /** Override package manager (e.g., 'apt', 'dnf', 'yum', 'brew', 'pacman') */
  packageManager?: string;
}

/**
 * Follow-up task for the agent to perform.
 */
export interface FollowUpTask {
  /** Type of task */
  taskType:
    | "install_system_packages"
    | "install_python_packages"
    | "run_command"
    | "verify_installation";
  /** Human-readable description of the task */
  description: string;
  /** The command to execute for this task */
  command: string;
  /** Packages to install (if applicable) */
  packages?: string[];
  /** Priority of the task (1 = highest) */
  priority: number;
  /** Whether this task is required for the environment to work */
  required: boolean;
}

/**
 * Result of setup development environment with follow-up tasks.
 */
export interface SetupEnvironmentResult extends ADECommandResult {
  /** Follow-up tasks for system dependencies */
  followUpTasks?: FollowUpTask[];
  /** Detected package manager */
  detectedPackageManager?: string;
}

/**
 * Package manager mapping for different OS distributions.
 */
const PACKAGE_MANAGER_MAP: Record<string, string> = {
  // Linux distributions
  ubuntu: "apt",
  debian: "apt",
  "linux mint": "apt",
  fedora: "dnf",
  rhel: "dnf",
  "red hat": "dnf",
  centos: "dnf",
  rocky: "dnf",
  alma: "dnf",
  arch: "pacman",
  manjaro: "pacman",
  opensuse: "zypper",
  suse: "zypper",
  alpine: "apk",
  gentoo: "emerge",
  // macOS
  darwin: "brew",
  macos: "brew",
  mac: "brew",
};

/**
 * Install command templates for different package managers.
 */
const INSTALL_COMMAND_MAP: Record<string, string> = {
  apt: "sudo apt-get install -y",
  dnf: "sudo dnf install -y",
  yum: "sudo yum install -y",
  pacman: "sudo pacman -S --noconfirm",
  zypper: "sudo zypper install -y",
  apk: "sudo apk add",
  emerge: "sudo emerge",
  brew: "brew install",
};

/**
 * Determine the package manager based on system information.
 * NO auto-detection fallback - LLM must provide OS info.
 *
 * @param systemInfo - System information provided by the LLM.
 * @returns The package manager to use.
 */
export function getPackageManagerForOS(systemInfo: SystemInfo): string {
  // If package manager is explicitly provided, use it
  if (systemInfo.packageManager) {
    return systemInfo.packageManager.toLowerCase();
  }

  // Try to detect from OS distro
  if (systemInfo.osDistro) {
    const distroLower = systemInfo.osDistro.toLowerCase();
    for (const [key, manager] of Object.entries(PACKAGE_MANAGER_MAP)) {
      if (distroLower.includes(key)) {
        return manager;
      }
    }
  }

  // Fall back to OS type
  const osTypeLower = systemInfo.osType.toLowerCase();
  if (osTypeLower === "darwin" || osTypeLower === "macos") {
    return "brew";
  }

  // For Linux without specific distro, default to dnf (enterprise common)
  if (osTypeLower === "linux") {
    return "dnf";
  }

  // Last resort default
  return "apt";
}

/**
 * Get the install command for a package manager.
 *
 * @param packageManager - The package manager name.
 * @returns The full install command prefix.
 */
export function getInstallCommand(packageManager: string): string {
  return (
    INSTALL_COMMAND_MAP[packageManager] || `sudo ${packageManager} install`
  );
}

/**
 * Execute a command using child_process.spawn and return the result.
 *
 * @param command - The command to execute.
 * @param args - Optional array of command arguments.
 * @param cwd - Optional working directory for the command.
 * @param env - Optional environment variables to merge with process.env.
 * @returns A promise that resolves with an object containing command execution results including success status, output, error, and exit code.
 * @throws No direct throws, but returns error information in the result object if the process fails.
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  cwd?: string,
  env?: NodeJS.ProcessEnv,
): Promise<ADECommandResult> {
  try {
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    return await new Promise((resolve) => {
      child.on("close", (code) => {
        /* v8 ignore start */
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr,
          exitCode: code || 0,
        });
        /* v8 ignore end */
      });

      child.on("error", (error) => {
        resolve({
          success: false,
          output: stdout,
          error: error.message,
          exitCode: 1,
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

/**
 * Check if ADE (Ansible Development Environment) tool is available in the system.
 *
 * @returns A promise that resolves to true if ADE is installed and accessible, false otherwise.
 */
export async function checkADEInstalled(): Promise<boolean> {
  const result = await executeCommand("ade", ["--version"]);
  return result.success;
}

/**
 * Check if ADT (ansible-dev-tools) package is installed using pip.
 *
 * @param workspaceRoot - Workspace root directory where the command should be executed.
 * @returns A promise that resolves to true if ansible-dev-tools is installed, false otherwise.
 */
export async function checkADTInstalled(
  workspaceRoot?: string,
): Promise<boolean> {
  // Check if ansible-dev-tools package is installed
  const result = await executeCommand(
    "pip",
    ["list", "--format=json"],
    workspaceRoot,
  );
  if (result.success) {
    try {
      const packages = JSON.parse(result.output);
      return packages.some(
        (pkg: { name: string }) => pkg.name === "ansible-dev-tools",
      );
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Get comprehensive environment information including Python version, Ansible tools, virtual environments, and installed collections.
 *
 * @param workspaceRoot - The root directory of the workspace to scan for virtual environments and configurations.
 * @returns A promise that resolves with an ADEEnvironmentInfo object containing environment details.
 */
export async function getEnvironmentInfo(
  workspaceRoot: string,
): Promise<ADEEnvironmentInfo> {
  const [adeInstalled, adtInstalled] = await Promise.all([
    checkADEInstalled(),
    checkADTInstalled(workspaceRoot),
  ]);

  // Check for virtual environments in the workspace
  let virtualEnvInfo = process.env.VIRTUAL_ENV || null;
  if (!virtualEnvInfo) {
    // Look for common virtual environment directories
    const commonVenvDirs = ["venv", ".venv", "env", ".env", "ansible-dev"];
    for (const dir of commonVenvDirs) {
      try {
        const venvPath = path.join(workspaceRoot, dir);
        await fs.access(path.join(venvPath, "bin", "activate"));
        virtualEnvInfo = `Found: ${venvPath} (not active)`;
        break;
      } catch {
        // Directory doesn't exist or is not a valid venv
      }
    }
  }

  // Get Python version
  const pythonResult = await executeCommand("python3", ["--version"]);
  const pythonVersion = pythonResult.success
    ? pythonResult.output.trim()
    : "Unknown";

  // Get Ansible version
  const ansibleResult = await executeCommand("ansible", ["--version"]);
  const ansibleVersion = ansibleResult.success
    ? ansibleResult.output.split("\n")[0]
    : null;

  // Get ansible-lint version
  const ansibleLintResult = await executeCommand("ansible-lint", ["--version"]);
  const ansibleLintVersion = ansibleLintResult.success
    ? ansibleLintResult.output.trim()
    : null;

  // Get installed collections
  const collectionsResult = await executeCommand("ansible-galaxy", [
    "collection",
    "list",
  ]);
  const installedCollections = collectionsResult.success
    ? collectionsResult.output
        .split("\n")
        .filter((line) => line.trim() && !line.includes("#"))
        .map((line) => line.trim())
    : [];

  return {
    virtualEnv: virtualEnvInfo,
    pythonVersion,
    ansibleVersion,
    ansibleLintVersion,
    installedCollections,
    workspacePath: workspaceRoot,
    adeInstalled,
    adtInstalled,
  };
}

/**
 * Check if a specific Python version is available on the system.
 *
 * @param pythonVersion - The Python version to check (e.g., "3.11").
 * @returns A promise that resolves to true if the version is available, false otherwise.
 */
export async function checkPythonVersionAvailable(
  pythonVersion?: string,
): Promise<boolean> {
  const pythonCmd = pythonVersion ? `python${pythonVersion}` : "python3";
  const result = await executeCommand(pythonCmd, ["--version"]);
  return result.success;
}

/**
 * Report missing Python version to user without attempting installation.
 * Following Microsoft Python extension pattern: detect and inform, don't try to fix.
 *
 * @param pythonVersion - The Python version that was requested but not found.
 * @returns An ADECommandResult with success: false and information about the missing Python.
 */
export function reportMissingPython(pythonVersion: string): ADECommandResult {
  const results: string[] = [];
  results.push(`Python ${pythonVersion} is not available on this system.`);
  results.push("");
  results.push("Requirements:");
  results.push(
    `  - Python ${pythonVersion} must be installed and available in PATH`,
  );
  results.push("");
  results.push(
    "Please install the required Python version and run this tool again.",
  );

  return {
    success: false,
    output: results.join("\n"),
    error: `Python ${pythonVersion} is not available`,
  };
}

/**
 * Create a virtual environment using Python's venv module.
 *
 * @param workspaceRoot - The root directory where the virtual environment will be created.
 * @param envName - Optional custom name for the virtual environment directory. Defaults to "venv".
 * @param pythonVersion - Optional Python version (e.g., "3.11"). Defaults to "python3".
 * @returns A promise that resolves with an ADECommandResult containing the creation status and output.
 * @throws No direct throws, but returns error information in the result if the virtual environment creation fails.
 */
export interface VenvCreationResult extends ADECommandResult {
  venvPath?: string;
}

export async function createVirtualEnvironment(
  workspaceRoot: string,
  envName?: string,
  pythonVersion?: string,
  pythonCommand?: string,
): Promise<VenvCreationResult> {
  // Use provided pythonCommand, or construct from version, or default to python3
  const pythonCmd =
    pythonCommand || (pythonVersion ? `python${pythonVersion}` : "python3");

  // Determine venv name - use provided name or generate based on Python version
  const venvName = envName || "venv";
  const venvPath = path.join(workspaceRoot, venvName);

  // Try creating the venv
  let result = await executeCommand(
    pythonCmd,
    ["-m", "venv", venvPath],
    workspaceRoot,
  );

  if (result.success) {
    return { ...result, venvPath };
  }

  // If failed and no custom name was provided, try with versioned name
  if (!envName) {
    const versionedName = pythonVersion ? `venv-${pythonVersion}` : "venv-new";
    const versionedPath = path.join(workspaceRoot, versionedName);

    result = await executeCommand(
      pythonCmd,
      ["-m", "venv", versionedPath],
      workspaceRoot,
    );

    if (result.success) {
      return {
        ...result,
        venvPath: versionedPath,
        output:
          `Note: Existing venv found, created new environment at '${versionedName}' instead.\n` +
          result.output,
      };
    }
  }

  return { ...result, venvPath: undefined };
}

/**
 * Execute a command within a virtual environment by sourcing the activation script.
 *
 * @param venvPath - The path to the virtual environment directory.
 * @param command - The command to execute within the virtual environment.
 * @param args - Optional array of command arguments.
 * @param cwd - Optional working directory for the command.
 * @returns A promise that resolves with an ADECommandResult containing the execution status and output.
 * @throws No direct throws, but returns error information in the result if the command execution fails.
 */
export async function executeInVirtualEnvironment(
  venvPath: string,
  command: string,
  args: string[] = [],
  cwd?: string,
): Promise<ADECommandResult> {
  const activationScript = path.join(venvPath, "bin", "activate");
  const fullCommand = `source ${activationScript} && ${command} ${args.join(" ")}`;

  return await executeCommand("bash", ["-c", fullCommand], cwd);
}

/**
 * Install Ansible collections using ansible-galaxy collection install command.
 *
 * @param workspaceRoot - The root directory of the workspace where collections will be installed.
 * @param collections - Array of collection names or namespace.collection identifiers to install.
 * @returns A promise that resolves with an ADECommandResult containing the installation status and output.
 * @throws No direct throws, but returns error information in the result if the collection installation fails.
 */
export async function installCollections(
  workspaceRoot: string,
  collections: string[],
): Promise<ADECommandResult> {
  const args = ["collection", "install"];

  // Note: ansible-galaxy doesn't support --editable flag
  // For editable installs, we would need to use pip install -e
  // For now, just install normally
  args.push(...collections);

  return await executeCommand("ansible-galaxy", args, workspaceRoot);
}

/**
 * Install Python packages from a requirements file using pip.
 *
 * @param workspaceRoot - The root directory to search for requirements files if not specified.
 * @param requirementsFile - Optional path to a specific requirements file. If not provided, searches for common files (requirements.txt, requirements.yml, test-requirements.txt).
 * @returns A promise that resolves with an ADECommandResult containing the installation status and output.
 * @throws No direct throws, but returns error information in the result if no requirements file is found or installation fails.
 */
export async function installRequirements(
  workspaceRoot: string,
  requirementsFile?: string,
): Promise<ADECommandResult> {
  const args = ["install", "-r"];

  if (requirementsFile) {
    args.push(requirementsFile);
  } else {
    // Look for common requirements files
    const commonFiles = [
      "requirements.txt",
      "requirements.yml",
      "test-requirements.txt",
    ];
    let foundFile = null;

    for (const file of commonFiles) {
      try {
        await fs.access(path.join(workspaceRoot, file));
        foundFile = file;
        break;
      } catch {
        // File doesn't exist, continue
      }
    }

    if (foundFile) {
      /* v8 ignore next */
      args.push(foundFile);
    } else {
      return {
        success: false,
        output: "",
        error:
          "No requirements file found. Please specify a requirements file or ensure requirements.txt exists.",
      };
    }
  }

  return await executeCommand("pip", args, workspaceRoot);
}

/**
 * Check for conflicting Ansible packages and provide diagnostic suggestions.
 * Detects old ansible v2.x packages that conflict with ansible-core.
 *
 * @returns A promise that resolves with an ADECommandResult containing diagnostic information and suggestions. Returns success: false if conflicts are detected.
 */
export async function checkConflictingPackages(): Promise<ADECommandResult> {
  const results: string[] = [];
  let hasConflict = false;

  // Check for old ansible package that conflicts with ansible-core
  const checkResult = await executeCommand("pip", ["list", "--format=json"]);
  if (checkResult.success) {
    try {
      const packages = JSON.parse(checkResult.output);
      const oldAnsible = packages.find(
        (pkg: { name: string; version: string }) =>
          pkg.name === "ansible" && pkg.version.startsWith("2."),
      );

      if (oldAnsible) {
        hasConflict = true;
        results.push(
          `Found conflicting ansible package (${oldAnsible.version})`,
        );
        results.push("");
        results.push(
          "The 'ansible' package (v2.x) conflicts with 'ansible-core'.",
        );
        results.push("To resolve this issue, you can:");
        results.push("");
        results.push("  Option 1 (pip):");
        results.push("    pip uninstall ansible");
        results.push("");
        results.push("  Option 2 (if using a virtual environment):");
        results.push(
          "    Create a fresh virtual environment and install only ansible-core",
        );
        results.push("");
        results.push("  Option 3 (if managing packages via requirements.txt):");
        results.push("    Remove 'ansible' from your requirements file");
      } else {
        results.push("No conflicting packages detected");
      }
    } catch {
      results.push("Could not parse pip list output");
      results.push("Unable to check for conflicting packages");
    }
  } else {
    results.push("Could not check for conflicting packages");
    results.push("Please ensure 'pip' is available and try again");
  }

  return {
    success: !hasConflict,
    output: results.join("\n"),
    error: hasConflict
      ? "Conflicting packages detected - see suggestions above"
      : undefined,
  };
}

/**
 * Check if ansible-lint is working properly and diagnose issues.
 * Provides diagnostic information and suggestions when ansible-lint is not functioning correctly.
 *
 * @returns A promise that resolves with an ADECommandResult containing the status check results and diagnostic suggestions if issues are found.
 */
export async function checkAnsibleLint(): Promise<ADECommandResult> {
  const result = await executeCommand("ansible-lint", ["--version"]);
  if (result.success) {
    return {
      success: true,
      output: `ansible-lint is working properly\nVersion: ${result.output.trim()}`,
    };
  } else {
    // Diagnose the issue and provide suggestions
    const results: string[] = [];
    results.push("ansible-lint is not working properly");
    results.push("");
    results.push(`Error: ${result.error || "ansible-lint command failed"}`);
    results.push("");
    results.push("Possible causes and solutions:");
    results.push("");
    results.push("1. ansible-lint is not installed:");
    results.push("   Solution: pip install ansible-lint");
    results.push("   Or use pipx: pipx install ansible-lint");
    results.push("");
    results.push("2. Version compatibility issues with ansible-core:");
    results.push("   Check your ansible-core version:");
    results.push("     ansible --version");
    results.push("   Solution options:");
    results.push(
      "     - Upgrade ansible-core: pip install --upgrade ansible-core",
    );
    results.push(
      "     - Reinstall ansible-lint: pip install --force-reinstall ansible-lint",
    );
    results.push("");
    results.push("3. PATH issues:");
    results.push(
      "   Ensure ansible-lint is in your PATH or activate your virtual environment",
    );
    results.push("");
    results.push("4. Virtual environment issues:");
    results.push("   If using a virtual environment, ensure it's activated");
    results.push("   and ansible-lint is installed within it");

    // Check if ansible-core is available to provide more specific guidance
    const ansibleCheck = await executeCommand("ansible", ["--version"]);
    if (!ansibleCheck.success) {
      results.push("");
      results.push(
        "Note: ansible-core also appears to be missing or not working",
      );
      results.push("   Consider installing: pip install ansible-core");
    }

    return {
      success: false,
      output: results.join("\n"),
      error: "ansible-lint is not working - see diagnostic information above",
    };
  }
}

/**
 * Setup a complete Ansible development environment including ADT installation, package conflict checks, virtual environment creation, and tool installation.
 *
 * @param workspaceRoot - The root directory of the workspace where the development environment will be set up.
 * @param options - Configuration options for environment setup. Properties: envName (optional, defaults to "venv"), pythonVersion (optional, e.g., "3.11"), collections (optional array), installRequirements (boolean), requirementsFile (optional path).
 * @returns A promise that resolves with an ADECommandResult containing setup status and detailed output of all operations performed.
 * @throws No direct throws, but returns error information in the result if setup operations fail.
 */
export async function setupDevelopmentEnvironment(
  workspaceRoot: string,
  options: {
    envName?: string;
    pythonVersion?: string;
    collections?: string[];
    installRequirements?: boolean;
    requirementsFile?: string;
    /** System info for correct package manager - MUST be provided by LLM */
    systemInfo?: SystemInfo;
  } = {},
): Promise<SetupEnvironmentResult> {
  const results: string[] = [];
  let success = true;
  const followUpTasks: FollowUpTask[] = [];

  // Get package manager from provided system info (no auto-detection)
  let packageManager = "apt"; // default if no system info
  let installCmd = getInstallCommand(packageManager);

  if (options.systemInfo) {
    packageManager = getPackageManagerForOS(options.systemInfo);
    installCmd = getInstallCommand(packageManager);
  }

  results.push("Starting Ansible development environment setup...");
  results.push(`   Workspace: ${workspaceRoot}`);
  if (options.systemInfo) {
    results.push(
      `   System: ${options.systemInfo.osType}${options.systemInfo.osDistro ? ` (${options.systemInfo.osDistro})` : ""}`,
    );
    results.push(`   Package Manager: ${packageManager}`);
  }
  if (options.pythonVersion) {
    results.push(`   Python version: ${options.pythonVersion}`);
  }
  if (options.collections && options.collections.length > 0) {
    results.push(`   Collections: ${options.collections.join(", ")}`);
  }
  results.push("");

  // Check if ADT is installed, if not, try to install it
  if (!(await checkADTInstalled(workspaceRoot))) {
    results.push("ADT (ansible-dev-tools) not found, attempting to install...");
    const adtInstallResult = await checkAndInstallADT(workspaceRoot);
    if (!adtInstallResult.success) {
      return {
        success: false,
        output: results.join("\n"),
        error: `Failed to install ADT: ${adtInstallResult.error}`,
      };
    }
    results.push(adtInstallResult.output);
  }

  // Check for conflicting packages
  results.push("Checking for conflicting packages...");
  const conflictCheckResult = await checkConflictingPackages();
  results.push(conflictCheckResult.output);
  if (!conflictCheckResult.success) {
    results.push("");
    results.push(
      "Please resolve package conflicts before proceeding with setup",
    );
  }

  // Check Python version availability (detect and inform, don't try to fix)
  let pythonCommand: string | undefined;
  if (options.pythonVersion) {
    results.push(`Checking if Python ${options.pythonVersion} is available...`);
    const pythonAvailable = await checkPythonVersionAvailable(
      options.pythonVersion,
    );

    if (!pythonAvailable) {
      // Report the issue and let user resolve it
      const missingPythonReport = reportMissingPython(options.pythonVersion);
      results.push(missingPythonReport.output);
      return {
        success: false,
        output: results.join("\n"),
        error: missingPythonReport.error,
      };
    } else {
      results.push(`Python ${options.pythonVersion} is available`);
    }
  }

  // Create virtual environment
  const expectedVenvName = options.envName || "venv";
  results.push(
    `Creating virtual environment '${expectedVenvName}'${options.pythonVersion ? ` with Python ${options.pythonVersion}` : ""}...`,
  );

  const venvResult = await createVirtualEnvironment(
    workspaceRoot,
    options.envName,
    options.pythonVersion,
    pythonCommand,
  );

  if (!venvResult.success || !venvResult.venvPath) {
    results.push(`Failed to create virtual environment`);
    if (venvResult.error) {
      results.push(`   Error: ${venvResult.error}`);
    }
    results.push("");
    results.push("Requirements:");
    results.push(
      "   - Python must be properly installed and available in PATH",
    );
    results.push("   - The 'venv' module must be available");
    results.push("");
    results.push("Please resolve the issue and run this tool again.");
    return {
      success: false,
      output: results.join("\n"),
      error: venvResult.error || "Failed to create virtual environment",
    };
  }

  // Use the actual venv path (might be different if fallback was used)
  const venvPath = venvResult.venvPath;
  if (venvResult.output) {
    results.push(venvResult.output);
  }
  results.push(`Virtual environment created at ${venvPath}`);

  // Install ansible-lint and ansible-core in the virtual environment
  results.push("Installing Ansible tools in virtual environment...");
  const installAnsibleLint = await executeInVirtualEnvironment(
    venvPath,
    "pip",
    ["install", "ansible-lint", "ansible-core"],
  );
  if (installAnsibleLint.success) {
    /* v8 ignore next 2 */
    results.push(
      "ansible-lint and ansible-core installed in virtual environment",
    );
  } else {
    success = false;
    results.push(
      `Failed to install Ansible tools: ${installAnsibleLint.error}`,
    );
  }

  if (options.collections && options.collections.length > 0) {
    results.push(
      "Installing collections using virtual environment's ansible-galaxy...",
    );
    const collectionsResult = await executeInVirtualEnvironment(
      venvPath,
      "ansible-galaxy",
      ["collection", "install", ...options.collections],
      workspaceRoot,
    );

    if (!collectionsResult.success) {
      success = false;
      results.push(`Failed to install collections: ${collectionsResult.error}`);
    } else {
      /* v8 ignore next */
      results.push("Collections installed successfully");
    }
  }

  // Install requirements if requested
  if (options.installRequirements) {
    const requirementsResult = await installRequirements(
      workspaceRoot,
      options.requirementsFile,
    );

    if (!requirementsResult.success) {
      success = false;
      results.push(
        `Failed to install requirements: ${requirementsResult.error}`,
      );
    } else {
      /* v8 ignore next */
      results.push("Requirements installed successfully");
    }
  }

  // Add activation instructions
  results.push("");
  results.push("To activate the virtual environment, run:");
  results.push(`   source ${venvPath}/bin/activate`);
  results.push("");
  results.push("To deactivate the virtual environment, run:");
  results.push("   deactivate");

  // Final verification - check ansible-lint in the virtual environment
  results.push("Performing final verification...");
  const finalLintCheck = await executeInVirtualEnvironment(
    venvPath,
    "ansible-lint",
    ["--version"],
  );
  if (!finalLintCheck.success) {
    success = false;
    results.push(
      `Final verification failed: ansible-lint not working in virtual environment`,
    );
  } else {
    /* v8 ignore next 2 */
    results.push(
      "Final verification passed - ansible-lint is working in virtual environment",
    );
  }

  // Generate follow-up tasks for system dependencies if system info is provided
  if (options.systemInfo && options.collections && options.collections.length > 0) {
    results.push("");
    results.push("--- System Dependencies Info ---");
    results.push(`Package Manager: ${packageManager}`);
    results.push(`Install Command: ${installCmd} <package>`);
    results.push("");
    results.push("If you encounter missing system dependencies, use:");
    results.push(`   ${installCmd} <package-name>`);

    // Add a verification follow-up task
    followUpTasks.push({
      taskType: "verify_installation",
      description: "Verify all dependencies are installed",
      command: "ade check",
      priority: 1,
      required: true,
    });
  }

  return {
    success,
    output: results.join("\n"),
    error: success ? undefined : "Some operations failed",
    followUpTasks: followUpTasks.length > 0 ? followUpTasks : undefined,
    detectedPackageManager: options.systemInfo ? packageManager : undefined,
  };
}

/**
 * Check if ADT (ansible-dev-tools) is installed and attempt to install it if missing.
 * Tries pip first, then falls back to pipx if pip installation fails.
 *
 * @param workspaceRoot - Workspace root directory where the command should be executed.
 * @returns A promise that resolves with an ADECommandResult containing installation status and output. Returns success: true if already installed or successfully installed.
 */
export async function checkAndInstallADT(
  workspaceRoot?: string,
): Promise<ADECommandResult> {
  const adtInstalled = await checkADTInstalled(workspaceRoot);

  if (adtInstalled) {
    return {
      success: true,
      output: "ADT (ansible-dev-tools) is already installed",
    };
  }

  // Try to install ADT
  const installResult = await executeCommand(
    "pip",
    ["install", "ansible-dev-tools"],
    workspaceRoot,
  );

  if (installResult.success) {
    return {
      success: true,
      output: "ADT (ansible-dev-tools) installed successfully",
    };
  }

  // Try with pipx as fallback
  const pipxResult = await executeCommand(
    "pipx",
    ["install", "ansible-dev-tools"],
    workspaceRoot,
  );

  if (pipxResult.success) {
    return {
      success: true,
      output: "ADT (ansible-dev-tools) installed successfully via pipx",
    };
  }

  return {
    success: false,
    output: "",
    error: `Failed to install ADT. pip error: ${installResult.error}, pipx error: ${pipxResult.error}`,
  };
}

/**
 * Format environment information into a human-readable string for console output.
 *
 * @param info - The ADEEnvironmentInfo object containing all environment details to format.
 * @returns A formatted string with sections for workspace, Python version, virtual environment, Ansible tools, development tools, and installed collections.
 */
export function formatEnvironmentInfo(info: ADEEnvironmentInfo): string {
  const sections = [
    "Environment Information",
    "=".repeat(50),
    "",
    `Workspace: ${info.workspacePath}`,
    `Python: ${info.pythonVersion}`,
    `Virtual Environment: ${info.virtualEnv || "Not set"}`,
    "",
    "Ansible Tools:",
    `  - Ansible: ${info.ansibleVersion || "Not installed"}`,
    `  - Ansible Lint: ${info.ansibleLintVersion || "Not installed"}`,
    "",
    "Development Tools:",
    `  - ADE: ${info.adeInstalled ? "Installed" : "Not installed"}`,
    `  - ADT: ${info.adtInstalled ? "Installed" : "Not installed"}`,
    "",
    "Installed Collections:",
    ...(info.installedCollections.length > 0
      ? info.installedCollections.map((col) => `  - ${col}`)
      : ["  - None"]),
  ];

  return sections.join("\n");
}
