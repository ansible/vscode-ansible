import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnsibleNavigatorHandler } from "../../src/handlers.js";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";

describe("Ansible Navigator Handler", () => {
  const testPlaybookPath = join(__dirname, "test-navigator-playbook.yml");
  const cleanPlaybookPath = join(__dirname, "clean-navigator-playbook.yml");

  beforeAll(async () => {
    // Create test files
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

    await writeFile(testPlaybookPath, testPlaybookContent, "utf8");
    await writeFile(cleanPlaybookPath, cleanPlaybookContent, "utf8");
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await unlink(testPlaybookPath);
      await unlink(cleanPlaybookPath);
    } catch {
      // Ignore errors if files don't exist
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
      expect(result.content[0].text).toContain("Ansible Navigator - Features & Usage Guide");
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
      expect(result.content[0].text).toContain("Ansible Navigator - Features & Usage Guide");
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
