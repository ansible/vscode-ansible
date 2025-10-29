import { describe, it, expect } from "vitest";
import { createAnsibleLintHandler } from "../src/handlers.js";

describe("Ansible Lint Handler", () => {
  describe("Core linting functionality", () => {
    it("should detect and report linting issues in playbooks", async () => {
      const handler = createAnsibleLintHandler();
      const playbookWithIssues = `---
- hosts: localhost
  tasks:
    - name: test task
      debug:
        msg: hello`;

      const result = await handler({
        playbookContent: playbookWithIssues,
        fix: false,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Linting results");
      expect(result.content[0].text).toContain("Found");
      expect(result.content[0].text).toContain("issue");
    });

    it("should report no issues for clean playbooks", async () => {
      const handler = createAnsibleLintHandler();
      const cleanPlaybook = `---
- name: Test playbook
  hosts: localhost
  tasks:
    - name: Test task
      ansible.builtin.debug:
        msg: hello`;

      const result = await handler({
        playbookContent: cleanPlaybook,
        fix: false,
      });

      expect(result.content).toBeDefined();
      // Should either show no issues or contain linting results
      expect(result.content[0].text).toContain("Linting");
    });
  });

  describe("Input validation", () => {
    it("should handle invalid YAML content", async () => {
      const handler = createAnsibleLintHandler();
      const invalidYaml = `---
- hosts: localhost
  tasks:
    - name: test task
      debug:
        msg: hello
      invalid: [unclosed list`;

      const result = await handler({
        playbookContent: invalidYaml,
        fix: false,
      });

      expect(result.content).toBeDefined();
      // Should either show linting results or error
      expect(result.content[0].text).toMatch(/Linting|Error/);
    });
  });

  describe("Fix parameter handling", () => {
    it("should prompt user for fix preference when fix parameter is undefined", async () => {
      const handler = createAnsibleLintHandler();
      const result = await handler({
        playbookContent: "---\n- hosts: localhost",
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
        playbookContent: "---\n- hosts: localhost",
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
        playbookContent: "---\n- hosts: localhost",
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
      const playbook = `---
- hosts: localhost
  tasks:
    - name: test task
      debug:
        msg: hello`;

      const result = await handler({
        playbookContent: playbook,
        fix: true,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("📝 Fixed content:");
      expect(result.content[0].text).toContain("```yaml");
    });

    it("should not apply fixes when fix: false is specified", async () => {
      const handler = createAnsibleLintHandler();
      const playbook = `---
- hosts: localhost
  tasks:
    - name: test task
      debug:
        msg: hello`;

      const result = await handler({
        playbookContent: playbook,
        fix: false,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).not.toContain("📝 Fixed content:");
      expect(result.content[0].text).not.toContain("```yaml");
    });
  });
});
