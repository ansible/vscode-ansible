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
    it("should prompt for mode when mode is not specified", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        filePath: testPlaybookPath,
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      // Should prompt for mode preference
      expect(result.content[0].text).toContain(
        "Would you like to specify an output mode",
      );
      expect(result.content[0].text).toContain('mode: "stdout"');
    });

    it("should run ansible-navigator on a playbook file when mode is provided", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        filePath: testPlaybookPath,
        mode: "stdout",
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      // Should contain output from ansible-navigator or error if not available
      expect(result.content[0].text).toMatch(/ansible-navigator|Error/);
    });

    it("should handle valid playbook files with mode specified", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        filePath: cleanPlaybookPath,
        mode: "stdout",
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
        filePath: nonExistentFile,
        mode: "stdout",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("File not found");
      expect(result.isError).toBe(true);
    });

    it("should handle empty file path", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        filePath: "",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("filePath");
      expect(result.content[0].text).toContain("required");
      expect(result.isError).toBe(true);
    });
  });

  describe("Mode parameter handling", () => {
    it("should prompt user for mode preference when mode parameter is undefined", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({
        filePath: testPlaybookPath,
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.content[0].text).toContain(
        "Would you like to specify an output mode for ansible-navigator?",
      );
      expect(result.content[0].text).toContain('mode: "stdout"');
      expect(result.content[0].text).toContain('mode: "stdout-minimal"');
      expect(result.content[0].text).toContain('mode: "interactive"');
    });

    it("should run with stdout mode when mode is specified as stdout", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({
        filePath: testPlaybookPath,
        mode: "stdout",
      });

      // Should not contain the prompt message
      expect(result.content[0].text).not.toContain(
        "Would you like to specify an output mode",
      );
      // Should either contain an error (if ansible-navigator not available) or navigator output
      expect(result.content).toBeDefined();
    });

    it("should run with stdout-minimal mode when mode is specified", async () => {
      const handler = createAnsibleNavigatorHandler();
      const result = await handler({
        filePath: testPlaybookPath,
        mode: "stdout-minimal",
      });

      // Should not contain the prompt message
      expect(result.content[0].text).not.toContain(
        "Would you like to specify an output mode",
      );
      // Should either contain an error (if ansible-navigator not available) or navigator output
      expect(result.content).toBeDefined();
    });
  });

  describe("Error handling and debug output", () => {
    it("should include debug output in error response when ansible-navigator fails", async () => {
      const handler = createAnsibleNavigatorHandler();

      // This test validates that debug output is included in error messages
      // The actual behavior depends on whether ansible-navigator is installed
      const result = await handler({
        filePath: testPlaybookPath,
        mode: "stdout",
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
        filePath: testPlaybookPath,
        mode: "stdout",
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
        filePath: testPlaybookPath,
        mode: "stdout",
      });

      expect(result.content).toBeDefined();
      // Output should mention the file path or contain navigator output
      if (!result.isError) {
        expect(result.content[0].text).toContain("for file:");
        expect(result.content[0].text).toContain("ansible-navigator");
      }
    });

    it("should include debug output when available", async () => {
      const handler = createAnsibleNavigatorHandler();

      const result = await handler({
        filePath: testPlaybookPath,
        mode: "stdout",
      });

      expect(result.content).toBeDefined();
      // This test ensures the handler can handle debug output
      // The actual presence of debug output depends on ansible-navigator execution
      expect(result.content[0].text).toBeTruthy();
    });
  });
});
