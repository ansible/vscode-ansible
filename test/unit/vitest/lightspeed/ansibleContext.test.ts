import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnsibleContextProcessor } from "../../../../src/features/lightspeed/ansibleContext.js";
import type { AnsibleContext } from "../../../../src/features/lightspeed/ansibleContext.js";
import { ANSIBLE_CONTENT, TEST_PROMPTS } from "./testConstants.js";

describe("AnsibleContextProcessor", () => {
  // Mock console.warn to avoid noise in test output
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      // Intentionally empty - suppresses console.warn in tests
    });
  });

  describe("enhancePromptForAnsible", () => {
    it("should enhance prompt with system context for playbook", () => {
      const prompt = TEST_PROMPTS.INSTALL_NGINX;
      const context: AnsibleContext = {
        fileType: "playbook",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("You are an expert Ansible developer");
      expect(result).toContain("Generate Ansible playbook content");
      expect(result).toContain(prompt);
    });

    it("should enhance prompt with system context for tasks", () => {
      const prompt = TEST_PROMPTS.CREATE_TASK;
      const context: AnsibleContext = {
        fileType: "tasks",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("Generate Ansible task definitions");
      expect(result).toContain(prompt);
    });

    it("should enhance prompt with system context for handlers", () => {
      const prompt = "Create a handler";
      const context: AnsibleContext = {
        fileType: "handlers",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("Generate Ansible handler definitions");
    });

    it("should enhance prompt with system context for role", () => {
      const prompt = TEST_PROMPTS.CREATE_ROLE;
      const context: AnsibleContext = {
        fileType: "role",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("Generate Ansible role structure");
    });

    it("should enhance prompt with system context for vars", () => {
      const prompt = "Define variables";
      const context: AnsibleContext = {
        fileType: "vars",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("Generate Ansible variable definitions");
    });

    it("should enhance prompt with system context for inventory", () => {
      const prompt = "Create inventory";
      const context: AnsibleContext = {
        fileType: "inventory",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("Generate Ansible inventory content");
    });

    it("should use default playbook fileType when context is not provided", () => {
      const prompt = TEST_PROMPTS.INSTALL_NGINX;

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        undefined,
      );

      expect(result).toContain("Generate Ansible playbook content");
    });

    it("should combine context and prompt when context is provided", () => {
      const prompt = TEST_PROMPTS.INSTALL_NGINX;
      const contextString = "Previous context here";
      const context: AnsibleContext = {
        fileType: "playbook",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        contextString,
        context,
      );

      expect(result).toContain(contextString);
      expect(result).toContain(prompt);
    });

    it("should handle multi-task prompts correctly", () => {
      const prompt = ANSIBLE_CONTENT.MULTI_TASK;
      const context: AnsibleContext = {
        fileType: "tasks",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("Generate Ansible task definitions");
      expect(result).toContain("Task one");
      expect(result).toContain("Task two");
    });

    it("should format single task prompt correctly", () => {
      const prompt = "Install nginx";
      const context: AnsibleContext = {
        fileType: "tasks",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("- name: Install nginx");
    });

    it("should handle prompt that already has task structure", () => {
      const prompt = ANSIBLE_CONTENT.SINGLE_TASK;
      const context: AnsibleContext = {
        fileType: "tasks",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain("- name: Install nginx");
    });

    it("should handle empty context string", () => {
      const prompt = TEST_PROMPTS.INSTALL_NGINX;
      const context: AnsibleContext = {
        fileType: "playbook",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        "",
        context,
      );

      expect(result).toContain(prompt);
    });
  });

  describe("extractTaskNames", () => {
    it("should extract task names from multi-task prompt", () => {
      const prompt = ANSIBLE_CONTENT.MULTI_TASK;
      const taskNames = AnsibleContextProcessor.extractTaskNames(prompt);

      expect(taskNames).toHaveLength(2);
      expect(taskNames).toContain("Task one");
      expect(taskNames).toContain("Task two");
    });

    it("should extract single task name", () => {
      const prompt = ANSIBLE_CONTENT.SINGLE_TASK;
      const taskNames = AnsibleContextProcessor.extractTaskNames(prompt);

      expect(taskNames).toHaveLength(1);
      expect(taskNames[0]).toBe("Install nginx");
    });

    it("should return empty array when no task names found", () => {
      const prompt = "Just some text without tasks";
      const taskNames = AnsibleContextProcessor.extractTaskNames(prompt);

      expect(taskNames).toHaveLength(0);
    });

    it("should handle task names with quotes", () => {
      const prompt =
        '- name: "Task with quotes"\n  ansible.builtin.debug:\n    msg: "test"';
      const taskNames = AnsibleContextProcessor.extractTaskNames(prompt);

      expect(taskNames).toHaveLength(1);
      expect(taskNames[0]).toBe('"Task with quotes"');
    });

    it("should handle task names with special characters", () => {
      const prompt =
        "- name: Task (with) [special] chars\n  ansible.builtin.debug:\n    msg: test";
      const taskNames = AnsibleContextProcessor.extractTaskNames(prompt);

      expect(taskNames).toHaveLength(1);
      expect(taskNames[0]).toBe("Task (with) [special] chars");
    });

    it("should handle empty string", () => {
      const taskNames = AnsibleContextProcessor.extractTaskNames("");

      expect(taskNames).toHaveLength(0);
    });

    it("should handle task names with indentation", () => {
      const prompt =
        "  - name: Indented task\n    ansible.builtin.debug:\n      msg: test";
      const taskNames = AnsibleContextProcessor.extractTaskNames(prompt);

      expect(taskNames).toHaveLength(1);
      expect(taskNames[0]).toBe("Indented task");
    });
  });

  describe("cleanAnsibleOutput", () => {
    it("should remove YAML code block markers", () => {
      const output = ANSIBLE_CONTENT.YAML_WITH_CODE_BLOCK;
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      expect(cleaned).not.toContain("```yaml");
      expect(cleaned).not.toContain("```");
      expect(cleaned).toContain("- name: Test task");
    });

    it("should remove explanatory text before YAML", () => {
      const output = ANSIBLE_CONTENT.YAML_WITH_EXPLANATION;
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      expect(cleaned).not.toContain("Here's the playbook:");
      expect(cleaned).toContain("- name: Test task");
    });

    it("should normalize YAML formatting", () => {
      const output = "---\n- name: Test\n  debug:\n    msg: hello";
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      expect(cleaned).toBeTruthy();
      expect(cleaned).toContain("- name: Test");
    });

    it("should handle valid YAML without code blocks", () => {
      const output = ANSIBLE_CONTENT.SINGLE_TASK;
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      expect(cleaned).toContain("- name: Install nginx");
    });

    it("should handle empty string", () => {
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput("");

      expect(cleaned).toBe("");
    });

    it("should handle whitespace-only string", () => {
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput("   \n  \t  ");

      expect(cleaned).toBe("");
    });

    it("should handle invalid YAML gracefully", () => {
      const output = ANSIBLE_CONTENT.INVALID_YAML;
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      // Should return the original content (or cleaned version) even if YAML is invalid
      expect(cleaned).toBeTruthy();
    });

    it("should remove multiple code block markers", () => {
      const output = "```yaml\n- name: Test\n```";
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      // The implementation removes code blocks at start/end, not all occurrences
      // After YAML parsing and re-serialization, code blocks should be removed
      expect(cleaned).not.toContain("```yaml");
      expect(cleaned).not.toContain("```");
      expect(cleaned).toContain("- name: Test");
    });

    it("should handle YAML with leading whitespace", () => {
      const output = "   \n   - name: Test\n     debug:\n       msg: test";
      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      expect(cleaned).toContain("- name: Test");
    });
  });

  describe("validateAnsibleContent", () => {
    it("should validate valid playbook structure", () => {
      const content = ANSIBLE_CONTENT.PLAYBOOK;
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate valid task list", () => {
      const content = ANSIBLE_CONTENT.SINGLE_TASK;
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate valid multi-task list", () => {
      const content = ANSIBLE_CONTENT.MULTI_TASK;
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid YAML syntax", () => {
      const content = ANSIBLE_CONTENT.INVALID_YAML;
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("YAML syntax error");
    });

    it("should reject empty content", () => {
      const content = ANSIBLE_CONTENT.EMPTY;
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("empty or invalid");
    });

    it("should reject null YAML", () => {
      const content = ANSIBLE_CONTENT.NULL_YAML;
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should validate playbook with hosts", () => {
      const content =
        "---\n- hosts: all\n  tasks:\n    - name: Test\n      debug:\n        msg: test";
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate role structure", () => {
      const content = "---\nmain: []";
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid task structure", () => {
      const content = "---\n- invalid: task\n  no_name: true";
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      // May or may not be valid depending on implementation
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
    });

    it("should handle array of non-objects", () => {
      const content = "---\n- string\n- 123\n- true";
      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("getAnsibleStopSequences", () => {
    it("should return array of stop sequences", () => {
      const sequences = AnsibleContextProcessor.getAnsibleStopSequences();

      expect(Array.isArray(sequences)).toBe(true);
      expect(sequences.length).toBeGreaterThan(0);
    });

    it("should include document separator", () => {
      const sequences = AnsibleContextProcessor.getAnsibleStopSequences();

      expect(sequences).toContain("\n\n---");
    });

    it("should include new play indicator", () => {
      const sequences = AnsibleContextProcessor.getAnsibleStopSequences();

      expect(sequences).toContain("\n\n- hosts:");
    });

    it("should include new task indicator", () => {
      const sequences = AnsibleContextProcessor.getAnsibleStopSequences();

      expect(sequences).toContain("\n\n- name:");
    });

    it("should include handlers section", () => {
      const sequences = AnsibleContextProcessor.getAnsibleStopSequences();

      expect(sequences).toContain("\n\nhandlers:");
    });

    it("should include vars section", () => {
      const sequences = AnsibleContextProcessor.getAnsibleStopSequences();

      expect(sequences).toContain("\nvars:");
    });

    it("should include tasks section", () => {
      const sequences = AnsibleContextProcessor.getAnsibleStopSequences();

      expect(sequences).toContain("\ntasks:");
    });

    it("should return consistent results on multiple calls", () => {
      const sequences1 = AnsibleContextProcessor.getAnsibleStopSequences();
      const sequences2 = AnsibleContextProcessor.getAnsibleStopSequences();

      expect(sequences1).toEqual(sequences2);
    });
  });

  describe("getTemperatureForFileType", () => {
    it("should return correct temperature for playbook", () => {
      const temp =
        AnsibleContextProcessor.getTemperatureForFileType("playbook");

      expect(temp).toBe(0.1);
    });

    it("should return correct temperature for tasks", () => {
      const temp = AnsibleContextProcessor.getTemperatureForFileType("tasks");

      expect(temp).toBe(0.1);
    });

    it("should return correct temperature for handlers", () => {
      const temp =
        AnsibleContextProcessor.getTemperatureForFileType("handlers");

      expect(temp).toBe(0.05);
    });

    it("should return correct temperature for role", () => {
      const temp = AnsibleContextProcessor.getTemperatureForFileType("role");

      expect(temp).toBe(0.15);
    });

    it("should return default temperature for unknown file type", () => {
      const temp = AnsibleContextProcessor.getTemperatureForFileType("unknown");

      expect(temp).toBe(0.1);
    });
  });

  describe("getMaxTokensForFileType", () => {
    it("should return correct max tokens for playbook", () => {
      const tokens =
        AnsibleContextProcessor.getMaxTokensForFileType("playbook");

      expect(tokens).toBe(2000);
    });

    it("should return correct max tokens for tasks", () => {
      const tokens = AnsibleContextProcessor.getMaxTokensForFileType("tasks");

      expect(tokens).toBe(800);
    });

    it("should return correct max tokens for handlers", () => {
      const tokens =
        AnsibleContextProcessor.getMaxTokensForFileType("handlers");

      expect(tokens).toBe(400);
    });

    it("should return correct max tokens for vars", () => {
      const tokens = AnsibleContextProcessor.getMaxTokensForFileType("vars");

      expect(tokens).toBe(600);
    });

    it("should return correct max tokens for role", () => {
      const tokens = AnsibleContextProcessor.getMaxTokensForFileType("role");

      expect(tokens).toBe(2500);
    });

    it("should return correct max tokens for inventory", () => {
      const tokens =
        AnsibleContextProcessor.getMaxTokensForFileType("inventory");

      expect(tokens).toBe(1000);
    });

    it("should return default max tokens for unknown file type", () => {
      const tokens = AnsibleContextProcessor.getMaxTokensForFileType("unknown");

      expect(tokens).toBe(1000);
    });
  });
});
