import { describe, it, expect } from "vitest";
import {
  checkDependencies,
  formatDependencyError,
  COMMON_DEPENDENCIES,
  _testing,
  type Dependency,
} from "@src/dependencyChecker.js";

const { checkDependencyVersion } = _testing;

describe("Dependency Checker", () => {
  describe("checkDependencies", () => {
    it("should pass when no dependencies are required", async () => {
      const result = await checkDependencies([]);
      expect(result.satisfied).toBe(true);
      expect(result.missingDependencies).toHaveLength(0);
    });

    it("should detect missing dependencies", async () => {
      const fakeDep: Dependency = {
        name: "nonexistent-tool-xyz",
        command: "nonexistent-tool-xyz",
        installCommand: "npm install nonexistent-tool-xyz",
      };

      const result = await checkDependencies([fakeDep]);
      expect(result.satisfied).toBe(false);
      expect(result.missingDependencies).toHaveLength(1);
      expect(result.missingDependencies[0].name).toBe("nonexistent-tool-xyz");
    });

    it("should detect which command exists (node should exist)", async () => {
      const nodeDep: Dependency = {
        name: "node",
        command: "node",
        installCommand: "Install from nodejs.org",
      };

      const result = await checkDependencies([nodeDep]);
      expect(result.satisfied).toBe(true);
      expect(result.missingDependencies).toHaveLength(0);
    });

    it("should check multiple dependencies", async () => {
      const deps: Dependency[] = [
        {
          name: "node",
          command: "node",
          installCommand: "Install from nodejs.org",
        },
        {
          name: "fake-tool",
          command: "fake-tool-12345",
          installCommand: "pip install fake-tool",
        },
      ];

      const result = await checkDependencies(deps);
      expect(result.satisfied).toBe(false);
      expect(result.missingDependencies).toHaveLength(1);
      expect(result.missingDependencies[0].name).toBe("fake-tool");
    });
  });

  describe("formatDependencyError", () => {
    it("should format error message with single missing dependency", () => {
      const missing: Dependency[] = [
        {
          name: "ansible",
          command: "ansible",
          installCommand: "pip install ansible",
          description: "Ansible automation platform",
        },
      ];

      const error = formatDependencyError("ansible_lint", missing);

      expect(error).toContain("Cannot use tool 'ansible_lint'");
      expect(error).toContain("ansible");
      expect(error).toContain("pip install ansible");
      expect(error).toContain("Ansible automation platform");
    });

    it("should format error message with multiple missing dependencies", () => {
      const missing: Dependency[] = [
        {
          name: "ansible",
          command: "ansible",
          installCommand: "pip install ansible",
        },
        {
          name: "ansible-lint",
          command: "ansible-lint",
          installCommand: "pip install ansible-lint",
        },
      ];

      const error = formatDependencyError("lint_tool", missing);

      expect(error).toContain("Cannot use tool 'lint_tool'");
      expect(error).toContain("ansible");
      expect(error).toContain("ansible-lint");
      expect(error).toContain("pip install ansible");
      expect(error).toContain("pip install ansible-lint");
    });

    it("should format error with version mismatches only", () => {
      const versionMismatches = [
        {
          dependency: {
            name: "ansible",
            command: "ansible",
            installCommand: "pip install ansible",
            description: "Ansible automation platform",
          },
          currentVersion: "2.8.0",
          requiredVersion: "2.9.0",
        },
      ];

      const error = formatDependencyError("lint_tool", [], versionMismatches);

      expect(error).toContain("Cannot use tool 'lint_tool'");
      expect(error).toContain("because version requirements are not met");
      expect(error).toContain("ansible (Ansible automation platform)");
      expect(error).toContain("Current version: 2.8.0");
      expect(error).toContain("Required version: 2.9.0 or higher");
      expect(error).toContain("Update: pip install ansible");
    });

    it("should format error with both missing deps and version mismatches", () => {
      const missing: Dependency[] = [
        {
          name: "ansible-lint",
          command: "ansible-lint",
          installCommand: "pip install ansible-lint",
        },
      ];
      const versionMismatches = [
        {
          dependency: {
            name: "ansible",
            command: "ansible",
            installCommand: "pip install ansible",
          },
          currentVersion: "2.8.0",
          requiredVersion: "2.9.0",
        },
      ];

      const error = formatDependencyError(
        "lint_tool",
        missing,
        versionMismatches,
      );

      expect(error).toContain("required dependencies are missing");
      expect(error).toContain("ansible-lint");
      expect(error).toContain("Additionally, version requirements are not met");
      expect(error).toContain("Current version: 2.8.0");
    });

    it("should format version mismatches without description", () => {
      const versionMismatches = [
        {
          dependency: {
            name: "tool",
            command: "tool",
            installCommand: "pip install tool",
          },
          currentVersion: "1.0.0",
          requiredVersion: "2.0.0",
        },
      ];

      const error = formatDependencyError("my_tool", [], versionMismatches);
      expect(error).toContain("  - tool\n");
      expect(error).not.toContain("(");
    });

    it("should handle empty version mismatches array", () => {
      const missing: Dependency[] = [
        {
          name: "tool",
          command: "tool",
          installCommand: "pip install tool",
        },
      ];

      const error = formatDependencyError("my_tool", missing, []);
      expect(error).toContain("required dependencies are missing");
      expect(error).not.toContain("version requirements");
    });

    it("should format deps without description", () => {
      const missing: Dependency[] = [
        {
          name: "tool",
          command: "tool",
          installCommand: "pip install tool",
        },
      ];

      const error = formatDependencyError("my_tool", missing);
      expect(error).toContain("  - tool\n    Install: pip install tool");
    });
  });

  describe("checkDependencyVersion", () => {
    it("should return null when dep has no minVersion", async () => {
      const dep: Dependency = {
        name: "test-tool",
        command: "test-tool",
        installCommand: "pip install test-tool",
      };
      expect(await checkDependencyVersion(dep)).toBeNull();
    });

    it("should return null when dep has no versionCommand", async () => {
      const dep: Dependency = {
        name: "test-tool",
        command: "test-tool",
        installCommand: "pip install test-tool",
        minVersion: "1.0.0",
      };
      expect(await checkDependencyVersion(dep)).toBeNull();
    });

    it("should return version mismatch when command fails", async () => {
      const dep: Dependency = {
        name: "nonexistent-tool",
        command: "nonexistent-tool-xyz-does-not-exist",
        installCommand: "pip install nonexistent-tool",
        description: "Missing tool",
        minVersion: "1.0.0",
        versionCommand: "nonexistent-tool-xyz-does-not-exist --version",
      };
      const result = await checkDependencyVersion(dep);
      expect(result).not.toBeNull();
      expect(result?.currentVersion).toBe("unknown (command failed)");
      expect(result?.requiredVersion).toBe("1.0.0");
    });

    it("should return null when version meets requirement", async () => {
      const versionRegex = /v?(\d+\.\d+\.\d+)/;
      const dep: Dependency = {
        name: "node",
        command: "node",
        installCommand: "Install from nodejs.org",
        description: "Node.js",
        minVersion: "1.0.0",
        versionCommand: "node --version",
        versionParser: (output: string) => {
          const match = versionRegex.exec(output);
          return match ? match[1] : null;
        },
      };
      const result = await checkDependencyVersion(dep);
      expect(result).toBeNull();
    });

    it("should return mismatch when version is too low", async () => {
      const versionRegex = /v?(\d+\.\d+\.\d+)/;
      const dep: Dependency = {
        name: "node",
        command: "node",
        installCommand: "Install from nodejs.org",
        description: "Node.js",
        minVersion: "999.0.0",
        versionCommand: "node --version",
        versionParser: (output: string) => {
          const match = versionRegex.exec(output);
          return match ? match[1] : null;
        },
      };
      const result = await checkDependencyVersion(dep);
      expect(result).not.toBeNull();
      expect(result?.requiredVersion).toBe("999.0.0");
      expect(result?.dependency.name).toBe("node");
    });
  });

  describe("checkDependencies with version mismatches", () => {
    it("should report version mismatch for existing command with low version", async () => {
      const versionRegex = /v?(\d+\.\d+\.\d+)/;
      const dep: Dependency = {
        name: "node",
        command: "node",
        installCommand: "Install from nodejs.org",
        minVersion: "999.0.0",
        versionCommand: "node --version",
        versionParser: (output: string) => {
          const match = versionRegex.exec(output);
          return match ? match[1] : null;
        },
      };
      const result = await checkDependencies([dep]);
      expect(result.satisfied).toBe(false);
      expect(result.versionMismatches).toHaveLength(1);
      expect(result.versionMismatches[0].requiredVersion).toBe("999.0.0");
    });
  });

  describe("COMMON_DEPENDENCIES", () => {
    it("should have ansible dependency defined", () => {
      expect(COMMON_DEPENDENCIES.ansible).toBeDefined();
      expect(COMMON_DEPENDENCIES.ansible.name).toBe("ansible");
      expect(COMMON_DEPENDENCIES.ansible.command).toBe("ansible");
      expect(COMMON_DEPENDENCIES.ansible.installCommand).toContain(
        "pip install",
      );
    });

    it("should have ansible-lint dependency defined", () => {
      expect(COMMON_DEPENDENCIES.ansibleLint).toBeDefined();
      expect(COMMON_DEPENDENCIES.ansibleLint.name).toBe("ansible-lint");
      expect(COMMON_DEPENDENCIES.ansibleLint.command).toBe("ansible-lint");
    });

    it("should have python dependency defined", () => {
      expect(COMMON_DEPENDENCIES.python).toBeDefined();
      expect(COMMON_DEPENDENCIES.python.name).toBe("python3");
      expect(COMMON_DEPENDENCIES.python.command).toBe("python3");
    });
  });
});
