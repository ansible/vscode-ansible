import { assert } from "chai";
import {
  AnsibleContextProcessor,
  AnsibleContext,
} from "../../../src/features/lightspeed/ansibleContext";

describe("AnsibleContextProcessor", () => {
  describe("enhancePromptForAnsible", () => {
    it("should enhance prompt with playbook context", () => {
      const prompt = "- name: Install nginx";
      const context = "---\n- hosts: all";
      const ansibleContext: AnsibleContext = {
        fileType: "playbook",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        context,
        ansibleContext,
      );

      assert.include(result, prompt);
      assert.include(result, "playbook");
    });

    it("should enhance prompt with role context", () => {
      const prompt = "- name: Configure service";
      const context = "---\n- name: Setup";
      const ansibleContext: AnsibleContext = {
        fileType: "role",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        context,
        ansibleContext,
      );

      assert.include(result, prompt);
      assert.include(result, "role");
    });

    it("should handle tasks file context", () => {
      const prompt = "- name: Copy file";
      const context = "";
      const ansibleContext: AnsibleContext = {
        fileType: "tasks",
      };

      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        prompt,
        context,
        ansibleContext,
      );

      assert.include(result, prompt);
    });
  });

  describe("extractTaskNames", () => {
    it("should extract task names from multi-task prompt", () => {
      const prompt =
        "- name: Install nginx\n- name: Configure firewall\n- name: Start service";

      const tasks = AnsibleContextProcessor.extractTaskNames(prompt);

      assert.equal(tasks.length, 3);
      assert.include(tasks[0], "Install nginx");
      assert.include(tasks[1], "Configure firewall");
      assert.include(tasks[2], "Start service");
    });

    it("should return empty array for non-task prompt", () => {
      const prompt = "Just some text without task names";

      const tasks = AnsibleContextProcessor.extractTaskNames(prompt);

      assert.equal(tasks.length, 0);
    });
  });

  describe("cleanAnsibleOutput", () => {
    it("should remove YAML frontmatter", () => {
      const output = "```yaml\n- name: Task\n```";

      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      assert.notInclude(cleaned, "```yaml");
      assert.notInclude(cleaned, "```");
      assert.include(cleaned, "- name: Task");
    });

    it("should trim whitespace", () => {
      const output = "\n\n  - name: Task  \n\n";

      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      assert.equal(cleaned, "- name: Task");
    });
  });

  describe("validateAnsibleContent", () => {
    it("should validate valid YAML", () => {
      const content = "---\n- name: Task\n  debug:\n    msg: Hello";

      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      assert.isTrue(result.valid);
      assert.isEmpty(result.errors);
    });

    it("should reject invalid YAML", () => {
      const content = "---\n- name: Task\n  debug\n    msg: Hello";

      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      assert.isFalse(result.valid);
      assert.isNotEmpty(result.errors);
    });

    it("should reject empty content", () => {
      const content = "";

      const result = AnsibleContextProcessor.validateAnsibleContent(content);

      assert.isFalse(result.valid);
      assert.isNotEmpty(result.errors);
    });
  });

  describe("getAnsibleStopSequences", () => {
    it("should return stop sequences", () => {
      const sequences = AnsibleContextProcessor.getAnsibleStopSequences();

      assert.isArray(sequences);
      assert.isNotEmpty(sequences);
    });
  });

  describe("getTemperatureForFileType", () => {
    it("should return temperature for playbook", () => {
      const temp =
        AnsibleContextProcessor.getTemperatureForFileType("playbook");

      assert.isNumber(temp);
      assert.isAtLeast(temp, 0);
      assert.isAtMost(temp, 1);
    });

    it("should return temperature for role", () => {
      const temp = AnsibleContextProcessor.getTemperatureForFileType("role");

      assert.isNumber(temp);
      assert.isAtLeast(temp, 0);
      assert.isAtMost(temp, 1);
    });
  });

  describe("getMaxTokensForFileType", () => {
    it("should return max tokens for playbook", () => {
      const tokens =
        AnsibleContextProcessor.getMaxTokensForFileType("playbook");

      assert.isNumber(tokens);
      assert.isAtLeast(tokens, 100);
    });

    it("should return max tokens for role", () => {
      const tokens = AnsibleContextProcessor.getMaxTokensForFileType("role");

      assert.isNumber(tokens);
      assert.isAtLeast(tokens, 100);
    });

    it("should return max tokens for tasks", () => {
      const tokens = AnsibleContextProcessor.getMaxTokensForFileType("tasks");

      assert.isNumber(tokens);
      assert.isAtLeast(tokens, 100);
    });

    it("should return max tokens for handlers", () => {
      const tokens =
        AnsibleContextProcessor.getMaxTokensForFileType("handlers");

      assert.isNumber(tokens);
      assert.isAtLeast(tokens, 100);
    });

    it("should return default max tokens for unknown type", () => {
      const tokens = AnsibleContextProcessor.getMaxTokensForFileType("unknown");

      assert.isNumber(tokens);
      assert.isAtLeast(tokens, 100);
    });
  });

  describe("cleanAnsibleOutput with various inputs", () => {
    it("should handle output with explanation text", () => {
      const output = "Here's the YAML:\n- name: Task\n  debug:\n    msg: Hello";

      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      assert.include(cleaned, "- name: Task");
    });

    it("should handle output with triple backticks", () => {
      const output = "```\n- name: Task\n```";

      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      assert.include(cleaned, "name:");
    });

    it("should handle output with yaml code fence", () => {
      const output = "```yaml\n- name: Deploy app\n  hosts: all\n```";

      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      assert.include(cleaned, "Deploy app");
      assert.notInclude(cleaned, "```");
    });

    it("should handle already clean output", () => {
      const output = "- name: Clean task\n  debug:\n    msg: Test";

      const cleaned = AnsibleContextProcessor.cleanAnsibleOutput(output);

      assert.include(cleaned, "Clean task");
    });
  });

  describe("edge cases", () => {
    it("should handle empty prompt gracefully", () => {
      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        "",
        "",
        undefined,
      );

      assert.isDefined(result);
      assert.isString(result);
    });

    it("should handle playbook-specific contexts", () => {
      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        "- name: test",
        "---\n- hosts: all",
        { fileType: "playbook" },
      );

      assert.include(result, "playbook");
    });

    it("should handle tasks file contexts", () => {
      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        "- name: test task",
        "",
        { fileType: "tasks" },
      );

      assert.include(result, "task");
    });

    it("should handle handlers file contexts", () => {
      const result = AnsibleContextProcessor.enhancePromptForAnsible(
        "- name: restart service",
        "",
        { fileType: "handlers" },
      );

      assert.include(result, "handler");
    });
  });
});
