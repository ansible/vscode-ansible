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
 * Execute a command and return the result
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
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr,
          exitCode: code || 0,
        });
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
 * Check if ADE tool is available
 */
export async function checkADEInstalled(): Promise<boolean> {
  const result = await executeCommand("ade", ["--version"]);
  return result.success;
}

/**
 * Check if ADT (ansible-dev-tools) is available
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
 * Get comprehensive environment information
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
 * Create a virtual environment using Python venv
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
 * Execute command within a virtual environment
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
 * Install collections using ansible-galaxy
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
 * Install requirements using pip
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
 * Clean up conflicting Ansible packages
 */
export async function cleanupConflictingPackages(): Promise<ADECommandResult> {
  const results: string[] = [];

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
        results.push(
          `Found conflicting ansible package (${oldAnsible.version}), removing...`,
        );
        const removeResult = await executeCommand("pip", [
          "uninstall",
          "ansible",
          "-y",
        ]);
        if (removeResult.success) {
          results.push("✅ Removed conflicting ansible package");
        } else {
          results.push(
            `⚠️ Failed to remove ansible package: ${removeResult.error}`,
          );
        }
      }
    } catch {
      results.push("⚠️ Could not parse pip list output");
    }
  }

  return {
    success: true,
    output: results.join("\n"),
  };
}

/**
 * Verify that ansible-lint is working properly
 */
export async function verifyAnsibleLint(): Promise<ADECommandResult> {
  const result = await executeCommand("ansible-lint", ["--version"]);
  if (result.success) {
    return {
      success: true,
      output: "✅ ansible-lint is working properly",
    };
  } else {
    // Try to fix by upgrading ansible-core and reinstalling ansible-lint
    const results: string[] = [];

    // First, upgrade ansible-core
    results.push("Upgrading ansible-core...");
    const upgradeResult = await executeCommand("pip", [
      "install",
      "--upgrade",
      "ansible-core",
    ]);
    if (upgradeResult.success) {
      results.push("✅ ansible-core upgraded");
    } else {
      results.push(`⚠️ Failed to upgrade ansible-core: ${upgradeResult.error}`);
    }

    // Reinstall ansible-lint to ensure compatibility
    results.push("Reinstalling ansible-lint...");
    const reinstallResult = await executeCommand("pip", [
      "install",
      "--force-reinstall",
      "ansible-lint",
    ]);
    if (reinstallResult.success) {
      results.push("✅ ansible-lint reinstalled");
    } else {
      results.push(
        `⚠️ Failed to reinstall ansible-lint: ${reinstallResult.error}`,
      );
    }

    // Test again
    const testResult = await executeCommand("ansible-lint", ["--version"]);
    if (testResult.success) {
      return {
        success: true,
        output: `✅ ansible-lint fixed: ${results.join(", ")}`,
      };
    }

    return {
      success: false,
      output: results.join("\n"),
      error: `ansible-lint is still not working: ${result.error}`,
    };
  }
}

/**
 * Setup complete development environment
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

  // Clean up conflicting packages
  results.push("Checking for conflicting packages...");
  const cleanupResult = await cleanupConflictingPackages();
  results.push(cleanupResult.output);

  // Verify ansible-lint is working
  results.push("Verifying ansible-lint functionality...");
  const lintVerifyResult = await verifyAnsibleLint();
  if (!lintVerifyResult.success) {
    success = false;
    results.push(`❌ ${lintVerifyResult.error}`);
  } else {
    results.push(lintVerifyResult.output);
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
 * Check and install missing ADT packages
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
 * Format environment information for console output
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
