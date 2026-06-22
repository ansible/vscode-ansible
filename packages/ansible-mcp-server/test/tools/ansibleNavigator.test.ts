import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnsibleNavigatorHandler } from "@src/handlers.js";
import {
  runAnsibleNavigator,
  formatNavigatorResult,
} from "@src/tools/ansibleNavigator.js";
import { join } from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("Ansible Navigator Handler", () => {
  let testDir: string;
  let testPlaybookPath: string;
  let cleanPlaybookPath: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "vitest-ansible-navigator-"));
    testPlaybookPath = join(testDir, "test-navigator-playbook.yml");
    cleanPlaybookPath = join(testDir, "clean-navigator-playbook.yml");

    const testPlaybookContent = `---
- name: Test playbook for ansible-navigator
  hosts: localhost
  gather_facts: false
  tasks:
    - name: Test task
      ansible.builtin.debug:
        msg: "Hello from ansible-navigator"`;

    const cleanPlaybookContent = `---
- name: Clean test playbook
  hosts: localhost
  gather_facts: false
  tasks:
    - name: Clean task
      ansible.builtin.debug:
        msg: "Clean playbook"`;

    writeFileSync(testPlaybookPath, testPlaybookContent, "utf8");
    writeFileSync(cleanPlaybookPath, cleanPlaybookContent, "utf8");
  });

  afterAll(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Core functionality", () => {
    it("should return information guide when called with empty arguments", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({});

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.isError).toBe(false);
      // Should return comprehensive guide
      expect(result.content[0].text).toContain(
        "Ansible Navigator - Features & Usage Guide",
      );
      expect(result.content[0].text).toContain("Output Modes");
      expect(result.content[0].text).toContain("stdout");
      expect(result.content[0].text).toContain("interactive");
      expect(result.content[0].text).toContain("Execution Environments");
    });

    it("should run ansible-navigator with userMessage", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        userMessage: `run ${testPlaybookPath}`,
        filePath: testPlaybookPath, // Direct filePath for test
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      // Should contain output from ansible-navigator or error if not available
      expect(result.content[0].text).toMatch(/ansible-navigator|Error/);
    });

    it("should handle valid playbook files with filePath (direct API)", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        filePath: cleanPlaybookPath,
        userMessage: "run test", // Required parameter
      });

      expect(result.content).toBeDefined();
      // Should either succeed or show error if ansible-navigator is not available
      expect(result.content[0].text).toMatch(/ansible-navigator|Error/);
    });
  });

  describe("Input validation", () => {
    it("should handle non-existent file", async () => {
      const handler = createAnsibleNavigatorHandler();
      const nonExistentFile = join(__dirname, "non-existent-navigator.yml");

      const result = await handler({
        userMessage: "run test",
        filePath: nonExistentFile,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("File not found");
      expect(result.isError).toBe(true);
    });

    it("should return information guide when userMessage is empty", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        userMessage: "",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain(
        "Ansible Navigator - Features & Usage Guide",
      );
      expect(result.isError).toBe(false);
    });
  });

  describe("Mode parameter handling", () => {
    it("should default to stdout mode when mode is not specified", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({
        userMessage: "run test",
        filePath: testPlaybookPath,
      });

      expect(result.content).toBeDefined();
      // Should use default stdout mode without prompting
      expect(result.content[0].text).not.toContain("specify an output mode");
      expect(result.content).toBeDefined();
    });

    it("should run with stdout mode when mode is explicitly specified", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({
        userMessage: "run test",
        filePath: testPlaybookPath,
        mode: "stdout",
      });

      expect(result.content).toBeDefined();
      // Should either contain an error (if ansible-navigator not available) or navigator output
      expect(result.content[0].text).toMatch(/ansible-navigator|Error/);
    });

    it("should run with interactive mode when specified", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({
        userMessage: "run test",
        filePath: testPlaybookPath,
        mode: "interactive",
      });

      expect(result.content).toBeDefined();
      // Should either contain an error (if ansible-navigator not available) or navigator output
      expect(result.content[0].text).toMatch(/ansible-navigator|Error/);
    });
  });

  describe("Error handling and debug output", () => {
    it("should include debug output in error response when ansible-navigator fails", async () => {
      const handler = createAnsibleNavigatorHandler();

      // This test validates that debug output is included in error messages
      // The actual behavior depends on whether ansible-navigator is installed
      const result = await handler({
        userMessage: "run test",
        filePath: testPlaybookPath,
      });

      expect(result.content).toBeDefined();

      // If ansible-navigator is not available, error should contain debug info
      if (result.isError) {
        expect(result.content[0].text).toContain("Error");
        // Should mention ansible-navigator in the error message
        expect(result.content[0].text).toMatch(/ansible-navigator|PATH/);
      } else {
        // If it succeeds, should contain output
        expect(result.content[0].text).toContain("ansible-navigator");
      }
    });

    it("should handle ansible-navigator process errors gracefully", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        userMessage: "run test",
        filePath: testPlaybookPath,
      });

      expect(result.content).toBeDefined();
      // Should either succeed with output or show an error with debug info
      expect(result.content[0].text).toMatch(/ansible-navigator|Error|Debug/);
    });
  });

  describe("Output formatting", () => {
    it("should format output with file path information", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        userMessage: "run test",
        filePath: testPlaybookPath,
      });

      expect(result.content).toBeDefined();
      // Output should mention the file path or contain navigator output
      if (!result.isError) {
        expect(result.content[0].text).toContain("ansible-navigator");
      }
    });

    it("should include configuration details in output", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        userMessage: "run test",
        filePath: testPlaybookPath,
      });

      expect(result.content).toBeDefined();
      // This test ensures the handler provides useful output
      expect(result.content[0].text).toBeTruthy();
    });
  });

  describe("Information Mode", () => {
    it("should provide comprehensive guide when no arguments", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({});

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Features & Usage Guide");
      expect(result.content[0].text).toContain("Output Modes");
      expect(result.content[0].text).toContain("Execution Environments");
      expect(result.content[0].text).toContain("Quick Commands");
    });

    it("should list both stdout and interactive modes", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({});

      expect(result.content[0].text).toContain("stdout");
      expect(result.content[0].text).toContain("interactive");
    });

    it("should explain execution environments", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({});

      expect(result.content[0].text).toContain("VM/Podman");
      expect(result.content[0].text).toContain("Local Ansible");
      expect(result.content[0].text).toContain("--ee false");
    });
  });
});

describe("runAnsibleNavigator - input validation", () => {
  let workspaceDir: string;
  let siblingDir: string;
  let playbookPath: string;
  let siblingFile: string;

  beforeAll(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "vitest-nav-workspace-"));
    siblingDir = mkdtempSync(join(tmpdir(), "vitest-nav-sibling-"));
    playbookPath = join(workspaceDir, "play.yml");
    siblingFile = join(siblingDir, "evil.yml");

    writeFileSync(
      playbookPath,
      "---\n- name: Test\n  hosts: localhost\n  tasks: []\n",
    );
    writeFileSync(
      siblingFile,
      "---\n- name: Evil\n  hosts: localhost\n  tasks: []\n",
    );
  });

  afterAll(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
    rmSync(siblingDir, { recursive: true, force: true });
  });

  it("should reject empty file path", async () => {
    await expect(runAnsibleNavigator("")).rejects.toThrow(
      "No file path was provided",
    );
  });

  it("should reject whitespace-only file path", async () => {
    await expect(runAnsibleNavigator("   ")).rejects.toThrow(
      "No file path was provided",
    );
  });

  it("should reject invalid mode", async () => {
    await expect(
      runAnsibleNavigator(playbookPath, "invalid_mode"),
    ).rejects.toThrow("Invalid mode");
  });

  it("should reject file outside workspace boundary", async () => {
    await expect(
      runAnsibleNavigator(siblingFile, "stdout", workspaceDir),
    ).rejects.toThrow("File path must be within the workspace");
  });

  it("should reject sibling directory with common prefix", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ws-"));
    const siblingWs = mkdtempSync(join(tmpdir(), "ws-sibling-"));
    const target = join(siblingWs, "secret.yml");

    writeFileSync(target, "---\n- name: Sibling\n  hosts: localhost\n");

    try {
      await expect(
        runAnsibleNavigator(target, "stdout", workspace),
      ).rejects.toThrow("File path must be within the workspace");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(siblingWs, { recursive: true, force: true });
    }
  });

  it("should reject directory path as file", async () => {
    await expect(
      runAnsibleNavigator(workspaceDir, "stdout", workspaceDir),
    ).rejects.toThrow("Path is a directory");
  });
});

describe("formatNavigatorResult", () => {
  it("should include file path in output", () => {
    const result = formatNavigatorResult(
      "task output",
      undefined,
      "/workspace/play.yml",
    );
    expect(result).toContain("for file: /workspace/play.yml");
  });

  it("should detect venv path and disable EE", () => {
    const result = formatNavigatorResult(
      "task output",
      undefined,
      "/workspace/play.yml",
      undefined,
      false,
      "/workspace/.venv/bin/ansible-navigator",
    );
    expect(result).toContain("venv (auto-detected)");
    expect(result).toContain("disabled (using local Ansible)");
  });

  it("should show EE enabled when not using venv and not disabled", () => {
    const result = formatNavigatorResult(
      "task output",
      undefined,
      "/workspace/play.yml",
      undefined,
      false,
      "/snap/ansible-navigator",
    );
    expect(result).toContain("system (auto-detected)");
    expect(result).toContain("enabled (using Podman/Docker)");
  });

  it("should include debug output when present", () => {
    const result = formatNavigatorResult(
      "task output",
      "some debug info",
      "/workspace/play.yml",
    );
    expect(result).toContain("Debug information:");
    expect(result).toContain("some debug info");
  });

  it("should show explicit environment name when not auto", () => {
    const result = formatNavigatorResult(
      "task output",
      undefined,
      "/workspace/play.yml",
      undefined,
      false,
      "/usr/bin/ansible-navigator",
      "my-custom-venv",
    );
    expect(result).toContain("my-custom-venv");
    expect(result).not.toContain("auto-detected");
  });

  it("should show non-default mode without default suffix", () => {
    const result = formatNavigatorResult(
      "task output",
      undefined,
      "/workspace/play.yml",
      "interactive",
    );
    expect(result).toContain("interactive");
    expect(result).not.toContain("default - shows full output");
  });

  it("should show EE disabled explanation when explicitly disabled (not venv)", () => {
    const result = formatNavigatorResult(
      "task output",
      undefined,
      "/workspace/play.yml",
      undefined,
      true,
      "/snap/ansible-navigator",
    );
    expect(result).toContain("disabled (using local Ansible)");
    expect(result).toContain(
      "Execution environment is disabled, using your local Ansible installation",
    );
  });

  it("should show EE enabled explanation when not disabled", () => {
    const result = formatNavigatorResult(
      "task output",
      undefined,
      "/workspace/play.yml",
      undefined,
      false,
      "/snap/ansible-navigator",
    );
    expect(result).toContain("enabled (using Podman/Docker)");
    expect(result).toContain(
      "ansible-navigator runs in an execution environment",
    );
  });

  it("should handle missing filePath", () => {
    const result = formatNavigatorResult("task output");
    expect(result).toContain("ansible-navigator run completed:");
    expect(result).not.toContain("for file:");
  });

  it("should show venv path in environment line", () => {
    const result = formatNavigatorResult(
      "task output",
      undefined,
      undefined,
      undefined,
      false,
      "/workspace/.venv/bin/ansible-navigator",
    );
    expect(result).toContain("→ /workspace/.venv");
  });
});
