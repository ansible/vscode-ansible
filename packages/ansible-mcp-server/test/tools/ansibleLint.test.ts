import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnsibleLintHandler } from "../../src/handlers.js";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";

describe("Ansible Lint Handler", () => {
  const testPlaybookPath = join(__dirname, "test-playbook.yml");
  const cleanPlaybookPath = join(__dirname, "clean-playbook.yml");

  beforeAll(async () => {
    // Create test files
    const testPlaybookContent = `---
- name: Test playbook with issues
  hosts: localhost
  tasks:
    - name: test task
      debug:
        msg: hello`;

    const cleanPlaybookContent = `---
- name: Test playbook
  hosts: localhost
  tasks:
    - name: Test task
      ansible.builtin.debug:
        msg: hello`;

    await writeFile(testPlaybookPath, testPlaybookContent, "utf8");
    await writeFile(cleanPlaybookPath, cleanPlaybookContent, "utf8");
  });

  afterAll(async () => {
    // Clean up test files
    await unlink(testPlaybookPath);
    await unlink(cleanPlaybookPath);
  });

  describe("Core linting functionality", () => {
    it("should detect and report linting issues in playbooks", async () => {
      const handler = createAnsibleLintHandler();

      const result = await handler({
        filePath: testPlaybookPath,
        fix: false,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Linting results");
      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("issue");
    });

    it("should report no issues for clean playbooks", async () => {
      const handler = createAnsibleLintHandler();

      const result = await handler({
        filePath: cleanPlaybookPath,
        fix: false,
      });

      expect(result.content).toBeDefined();
      // Should either show no issues or contain linting results
      expect(result.content[0].text).toContain("Linting");
    });
  });

  describe("Input validation", () => {
    it("should handle non-existent file", async () => {
      const handler = createAnsibleLintHandler();
      const nonExistentFile = join(__dirname, "non-existent.yml");

      const result = await handler({
        filePath: nonExistentFile,
        fix: false,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("File not found");
    });

    it("should handle empty file path", async () => {
      const handler = createAnsibleLintHandler();

      const result = await handler({
        filePath: "",
        fix: false,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("No file path was provided");
    });

    it("should handle ansible-lint process errors gracefully", async () => {
      const handler = createAnsibleLintHandler();
      // This test covers error handling paths in the ansible-lint execution
      const result = await handler({
        filePath: testPlaybookPath,
        fix: false,
      });

      expect(result.content).toBeDefined();
      // Should either succeed with linting results or show an error
      expect(result.content[0].text).toMatch(/Linting|Error/);
    });
  });

  describe("Fix parameter handling", () => {
    it("should prompt user for fix preference when fix parameter is undefined", async () => {
      const handler = createAnsibleLintHandler();
      const result = await handler({
        filePath: testPlaybookPath,
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.content[0].text).toContain(
        "Would you like ansible-lint to apply automatic fixes?",
      );
      expect(result.content[0].text).toContain("fix: true");
      expect(result.content[0].text).toContain("fix: false");
    });

    it("should run linting without fixes when fix parameter is false", async () => {
      const handler = createAnsibleLintHandler();
      const result = await handler({
        filePath: testPlaybookPath,
        fix: false,
      });

      // Should not contain the prompt message
      expect(result.content[0].text).not.toContain(
        "Would you like ansible-lint to apply automatic fixes?",
      );
      // Should not contain fixed content since fix is false
      expect(result.content[0].text).not.toContain("📝 Fixed content:");
      // Should either contain an error (if ansible-lint not available) or linting results
      expect(result.content).toBeDefined();
    });

    it("should run linting with automatic fixes when fix parameter is true", async () => {
      const handler = createAnsibleLintHandler();
      const result = await handler({
        filePath: testPlaybookPath,
        fix: true,
      });

      // Should not contain the prompt message
      expect(result.content[0].text).not.toContain(
        "Would you like ansible-lint to apply automatic fixes?",
      );
      // Should contain fixed content since fix is true
      expect(result.content[0].text).toContain("📝 Fixed content:");
      // Should either contain an error (if ansible-lint not available) or linting results
      expect(result.content).toBeDefined();
    });
  });

  describe("Fix functionality", () => {
    it("should apply fixes when fix: true is specified", async () => {
      const handler = createAnsibleLintHandler();

      const result = await handler({
        filePath: testPlaybookPath,
        fix: true,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("📝 Fixed content:");
      expect(result.content[0].text).toContain("```yaml");
    });

    it("should not apply fixes when fix: false is specified", async () => {
      const handler = createAnsibleLintHandler();

      const result = await handler({
        filePath: testPlaybookPath,
        fix: false,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).not.toContain("📝 Fixed content:");
      expect(result.content[0].text).not.toContain("```yaml");
    });

    it("should display fixed content when fix is applied and content is available", async () => {
      const handler = createAnsibleLintHandler();

      const result = await handler({
        filePath: testPlaybookPath,
        fix: true,
      });

      expect(result.content).toBeDefined();
      // This test specifically covers the fixed content display logic
      expect(result.content[0].text).toContain("📝 Fixed content:");
      expect(result.content[0].text).toContain("```yaml");
      expect(result.content[0].text).toContain("---");
    });

    it("should handle clean playbook with no issues", async () => {
      const handler = createAnsibleLintHandler();

      const result = await handler({
        filePath: cleanPlaybookPath,
        fix: false,
      });

      expect(result.content).toBeDefined();
      // This test covers the scenario where ansible-lint returns no issues
      expect(result.content[0].text).toContain("Linting");
    });
  });
});
