import { describe, it, expect } from "vitest";
import {
  checkDependencies,
  formatDependencyError,
  COMMON_DEPENDENCIES,
  type Dependency,
} from "../src/dependencyChecker.js";

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
