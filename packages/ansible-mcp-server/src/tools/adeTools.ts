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
 * @returns A promise that resolves to true if ansible-dev-tools is installed, false otherwise.
 */
export async function checkADTInstalled(): Promise<boolean> {
  // Check if ansible-dev-tools package is installed
  const result = await executeCommand("pip", ["list", "--format=json"]);
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
    checkADTInstalled(),
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
 * Create a virtual environment using Python's venv module.
 *
 * @param workspaceRoot - The root directory where the virtual environment will be created.
 * @param envName - Optional custom name for the virtual environment directory. Defaults to "venv".
 * @param pythonVersion - Optional Python version (e.g., "3.11"). Defaults to "python3".
 * @returns A promise that resolves with an ADECommandResult containing the creation status and output.
 * @throws No direct throws, but returns error information in the result if the virtual environment creation fails.
 */
export async function createVirtualEnvironment(
  workspaceRoot: string,
  envName?: string,
  pythonVersion?: string,
): Promise<ADECommandResult> {
  const venvPath = envName
    ? path.join(workspaceRoot, envName)
    : path.join(workspaceRoot, "venv");
  const pythonCmd = pythonVersion ? `python${pythonVersion}` : "python3";

  const args = ["-m", "venv", venvPath];

  return await executeCommand(pythonCmd, args, workspaceRoot);
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
          `⚠️ Found conflicting ansible package (${oldAnsible.version})`,
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
        results.push("✅ No conflicting packages detected");
      }
    } catch {
      results.push("⚠️ Could not parse pip list output");
      results.push("Unable to check for conflicting packages");
    }
  } else {
    results.push("⚠️ Could not check for conflicting packages");
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
      output: `✅ ansible-lint is working properly\nVersion: ${result.output.trim()}`,
    };
  } else {
    // Diagnose the issue and provide suggestions
    const results: string[] = [];
    results.push("❌ ansible-lint is not working properly");
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
        "⚠️ Note: ansible-core also appears to be missing or not working",
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
  } = {},
): Promise<ADECommandResult> {
  const results: string[] = [];
  let success = true;

  // Check if ADT is installed, if not, try to install it
  if (!(await checkADTInstalled())) {
    results.push("ADT (ansible-dev-tools) not found, attempting to install...");
    const adtInstallResult = await checkAndInstallADT();
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
      "⚠️ Please resolve package conflicts before proceeding with setup",
    );
  }

  // Check ansible-lint status
  results.push("Checking ansible-lint status...");
  const lintCheckResult = await checkAnsibleLint();
  if (!lintCheckResult.success) {
    /* v8 ignore next */
    success = false;
    results.push(lintCheckResult.output);
    results.push("");
    results.push(
      "⚠️ ansible-lint issues detected. See suggestions above to resolve.",
    );
  } else {
    /* v8 ignore next */
    results.push(lintCheckResult.output);
  }

  // Create virtual environment
  const venvPath = options.envName
    ? path.join(workspaceRoot, options.envName)
    : path.join(workspaceRoot, "venv");
  const venvResult = await createVirtualEnvironment(
    workspaceRoot,
    options.envName,
    options.pythonVersion,
  );

  if (!venvResult.success) {
    return venvResult;
  }
  results.push("✅ Virtual environment created successfully");

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
      "✅ ansible-lint and ansible-core installed in virtual environment",
    );
  } else {
    success = false;
    results.push(
      `❌ Failed to install Ansible tools: ${installAnsibleLint.error}`,
    );
  }

  // Install collections if specified
  if (options.collections && options.collections.length > 0) {
    const collectionsResult = await installCollections(
      workspaceRoot,
      options.collections,
    );

    if (!collectionsResult.success) {
      success = false;
      results.push(
        `❌ Failed to install collections: ${collectionsResult.error}`,
      );
    } else {
      /* v8 ignore next */
      results.push("✅ Collections installed successfully");
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
        `❌ Failed to install requirements: ${requirementsResult.error}`,
      );
    } else {
      /* v8 ignore next */
      results.push("✅ Requirements installed successfully");
    }
  }

  // Add activation instructions
  results.push("");
  results.push("🔧 To activate the virtual environment, run:");
  results.push(`   source ${venvPath}/bin/activate`);
  results.push("");
  results.push("🔧 To deactivate the virtual environment, run:");
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
      `❌ Final verification failed: ansible-lint not working in virtual environment`,
    );
  } else {
    /* v8 ignore next 2 */
    results.push(
      "✅ Final verification passed - ansible-lint is working in virtual environment",
    );
  }

  return {
    success,
    output: results.join("\n"),
    error: success ? undefined : "Some operations failed",
  };
}

/**
 * Check if ADT (ansible-dev-tools) is installed and attempt to install it if missing.
 * Tries pip first, then falls back to pipx if pip installation fails.
 *
 * @returns A promise that resolves with an ADECommandResult containing installation status and output. Returns success: true if already installed or successfully installed.
 */
export async function checkAndInstallADT(): Promise<ADECommandResult> {
  const adtInstalled = await checkADTInstalled();

  if (adtInstalled) {
    return {
      success: true,
      output: "✅ ADT (ansible-dev-tools) is already installed",
    };
  }

  // Try to install ADT
  const installResult = await executeCommand("pip", [
    "install",
    "ansible-dev-tools",
  ]);

  if (installResult.success) {
    return {
      success: true,
      output: "✅ ADT (ansible-dev-tools) installed successfully",
    };
  }

  // Try with pipx as fallback
  const pipxResult = await executeCommand("pipx", [
    "install",
    "ansible-dev-tools",
  ]);

  if (pipxResult.success) {
    return {
      success: true,
      output: "✅ ADT (ansible-dev-tools) installed successfully via pipx",
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
    "🔍 Environment Information",
    "=".repeat(50),
    "",
    `📁 Workspace: ${info.workspacePath}`,
    `🐍 Python: ${info.pythonVersion}`,
    `🔧 Virtual Environment: ${info.virtualEnv || "Not set"}`,
    "",
    "📦 Ansible Tools:",
    `  • Ansible: ${info.ansibleVersion || "Not installed"}`,
    `  • Ansible Lint: ${info.ansibleLintVersion || "Not installed"}`,
    "",
    "🛠️ Development Tools:",
    `  • ADE: ${info.adeInstalled ? "✅ Installed" : "❌ Not installed"}`,
    `  • ADT: ${info.adtInstalled ? "✅ Installed" : "❌ Not installed"}`,
    "",
    "📚 Installed Collections:",
    ...(info.installedCollections.length > 0
      ? info.installedCollections.map((col) => `  • ${col}`)
      : ["  • None"]),
  ];

  return sections.join("\n");
}
