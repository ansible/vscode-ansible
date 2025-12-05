import { spawn } from "node:child_process";

export interface Dependency {
  name: string;
  command: string; // Command to check if installed
  installCommand: string; // How to install it
  description?: string;
  minVersion?: string; // Minimum version required (e.g., "2.9.0")
  versionCommand?: string; // Command to get version (e.g., "ansible --version")
  versionParser?: (output: string) => string | null; // Extract version from output
}

export interface DependencyCheckResult {
  satisfied: boolean;
  missingDependencies: Dependency[];
  versionMismatches: Array<{
    dependency: Dependency;
    currentVersion: string;
    requiredVersion: string;
  }>;
}

/**
 * Check if a command exists in the system
 */
async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("which", [command], {
      shell: true,
    });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Get version of a command
 */
async function getCommandVersion(
  versionCommand: string,
  parser?: (output: string) => string | null,
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(versionCommand, [], { shell: true });
    let output = "";

    child.stdout?.on("data", (d) => (output += d.toString()));
    child.stderr?.on("data", (d) => (output += d.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      if (parser) {
        resolve(parser(output));
      } else {
        // Default: try to extract version like "1.2.3"
        const match = output.match(/\d+\.\d+\.\d+/);
        resolve(match ? match[0] : null);
      }
    });

    child.on("error", () => resolve(null));
  });
}

/**
 * Compare version strings (simple semantic versioning)
 */
function compareVersions(current: string, required: string): boolean {
  const parseCurrent = current.split(".").map((n) => parseInt(n, 10));
  const parseRequired = required.split(".").map((n) => parseInt(n, 10));

  for (
    let i = 0;
    i < Math.max(parseCurrent.length, parseRequired.length);
    i++
  ) {
    const c = parseCurrent[i] || 0;
    const r = parseRequired[i] || 0;

    if (c > r) return true;
    if (c < r) return false;
  }

  return true; // Equal versions are acceptable
}

/**
 * Check if all dependencies are satisfied (including versions)
 */
export async function checkDependencies(
  dependencies: Dependency[],
): Promise<DependencyCheckResult> {
  if (!dependencies || dependencies.length === 0) {
    return {
      satisfied: true,
      missingDependencies: [],
      versionMismatches: [],
    };
  }

  const missing: Dependency[] = [];
  const versionMismatches: Array<{
    dependency: Dependency;
    currentVersion: string;
    requiredVersion: string;
  }> = [];

  for (const dep of dependencies) {
    const exists = await commandExists(dep.command);
    if (!exists) {
      missing.push(dep);
      continue;
    }

    // Check version if required
    if (dep.minVersion && dep.versionCommand) {
      const currentVersion = await getCommandVersion(
        dep.versionCommand,
        dep.versionParser,
      );

      if (currentVersion) {
        if (!compareVersions(currentVersion, dep.minVersion)) {
          versionMismatches.push({
            dependency: dep,
            currentVersion,
            requiredVersion: dep.minVersion,
          });
        }
      } else {
        // If we can't get the version, treat it as a mismatch
        // This handles broken installations or version command failures
        versionMismatches.push({
          dependency: dep,
          currentVersion: "unknown (command failed)",
          requiredVersion: dep.minVersion,
        });
      }
    }
  }

  return {
    satisfied: missing.length === 0 && versionMismatches.length === 0,
    missingDependencies: missing,
    versionMismatches,
  };
}

/**
 * Format a helpful error message for missing dependencies and version mismatches
 */
export function formatDependencyError(
  toolName: string,
  missingDeps: Dependency[],
  versionMismatches?: Array<{
    dependency: Dependency;
    currentVersion: string;
    requiredVersion: string;
  }>,
): string {
  let errorMessage = `Cannot use tool '${toolName}'`;

  if (missingDeps.length > 0) {
    errorMessage += " because required dependencies are missing:\n\n";
    const depList = missingDeps
      .map((dep) => {
        const desc = dep.description ? ` (${dep.description})` : "";
        return `  - ${dep.name}${desc}\n    Install: ${dep.installCommand}`;
      })
      .join("\n\n");
    errorMessage += depList;
  }

  if (versionMismatches && versionMismatches.length > 0) {
    if (missingDeps.length > 0) {
      errorMessage += "\n\n";
    } else {
      errorMessage += " because version requirements are not met:\n\n";
    }

    const versionList = versionMismatches
      .map((vm) => {
        const desc = vm.dependency.description
          ? ` (${vm.dependency.description})`
          : "";
        return `  - ${vm.dependency.name}${desc}\n    Current version: ${vm.currentVersion}\n    Required version: ${vm.requiredVersion} or higher\n    Update: ${vm.dependency.installCommand}`;
      })
      .join("\n\n");

    if (missingDeps.length > 0) {
      errorMessage += "Additionally, version requirements are not met:\n\n";
    }
    errorMessage += versionList;
  }

  errorMessage +=
    "\n\nPlease install or update the dependencies and try again.";

  return errorMessage;
}

/**
 * Common dependencies for Ansible tools
 */
export const COMMON_DEPENDENCIES = {
  ansible: {
    name: "ansible",
    command: "ansible",
    installCommand: "pip install ansible",
    description: "Ansible automation platform",
    minVersion: "2.9.0",
    versionCommand: "ansible --version",
    versionParser: (output: string) => {
      // Extract version from "ansible [core 2.15.0]" or "ansible 2.9.10"
      const match = output.match(/ansible.*?(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
  },
  ansibleLint: {
    name: "ansible-lint",
    command: "ansible-lint",
    installCommand: "pip install ansible-lint",
    description: "Ansible playbook linter",
    minVersion: "6.0.0",
    versionCommand: "ansible-lint --version --offline",
    versionParser: (output: string) => {
      // Extract version from "ansible-lint 6.14.3"
      const match = output.match(/ansible-lint.*?(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
  },
  ansibleNavigator: {
    name: "ansible-navigator",
    command: "ansible-navigator",
    installCommand: "pip install ansible-navigator",
    description: "Ansible Navigator CLI tool",
    minVersion: "1.0.0",
    versionCommand: "ansible-navigator --version",
    versionParser: (output: string) => {
      // Extract version from "ansible-navigator 4.0.0" or similar
      // Fixed regex to avoid ReDoS: removed .*? backtracking, use \s+ instead
      const match = output.match(/ansible-navigator\s+(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
  },
  ansibleCreator: {
    name: "ansible-creator",
    command: "ansible-creator",
    installCommand: "pip install ansible-creator",
    description: "Ansible project scaffolding tool",
    minVersion: "25.9.1",
    versionCommand: "ansible-creator --version",
    versionParser: (output: string) => {
      // Extract version from "ansible-creator 0.1.0" or similar
      const match = output.match(/ansible-creator.*?(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
  },
  python: {
    name: "python3",
    command: "python3",
    installCommand: "Install from https://www.python.org/downloads/",
    description: "Python 3 runtime",
    minVersion: "3.8.0",
    versionCommand: "python3 --version",
    versionParser: (output: string) => {
      const match = output.match(/Python (\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
  },
};
