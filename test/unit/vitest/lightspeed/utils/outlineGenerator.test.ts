import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateOutlineFromPlaybook,
  generateOutlineFromRole,
  parseOutlineToTaskList,
} from "../../../../../src/features/lightspeed/utils/outlineGenerator.js";
import { ANSIBLE_CONTENT } from "../testConstants.js";

describe("outlineGenerator", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("generateOutlineFromPlaybook", () => {
    it("should generate outline from playbook with tasks", () => {
      const playbook = `---
- hosts: all
  tasks:
    - name: Install nginx
    - name: Start nginx
    - name: Configure nginx`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("1. Install nginx\n2. Start nginx\n3. Configure nginx");
    });

    it("should generate outline from playbook with pre_tasks and post_tasks", () => {
      const playbook = `---
- hosts: all
  pre_tasks:
    - name: Pre-task one
    - name: Pre-task two
  tasks:
    - name: Main task
  post_tasks:
    - name: Post-task one`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe(
        "1. Main task\n2. Pre-task one\n3. Pre-task two\n4. Post-task one",
      );
    });

    it("should handle multiple plays in playbook", () => {
      const playbook = `---
- hosts: web
  tasks:
    - name: Task in first play
- hosts: db
  tasks:
    - name: Task in second play`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("1. Task in first play\n2. Task in second play");
    });

    it("should skip tasks without name field", () => {
      const playbook = `---
- hosts: all
  tasks:
    - name: Task with name
    - debug:
        msg: "Task without name"
    - name: Another task with name`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("1. Task with name\n2. Another task with name");
    });

    it("should return empty string for empty playbook", () => {
      const playbook = "";

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("");
    });

    it("should return empty string for invalid YAML", () => {
      const playbook = ANSIBLE_CONTENT.INVALID_YAML;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("");
    });

    it("should return empty string for non-array playbook", () => {
      const playbook = `---
hosts: all
tasks:
  - name: Task`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("");
    });

    it("should return empty string for playbook with no tasks", () => {
      const playbook = `---
- hosts: all
  vars:
    var1: value1`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("");
    });

    it("should handle playbook with only pre_tasks", () => {
      const playbook = `---
- hosts: all
  pre_tasks:
    - name: Pre-task one
    - name: Pre-task two`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("1. Pre-task one\n2. Pre-task two");
    });

    it("should handle playbook with only post_tasks", () => {
      const playbook = `---
- hosts: all
  post_tasks:
    - name: Post-task one
    - name: Post-task two`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("1. Post-task one\n2. Post-task two");
    });

    it("should skip pre_tasks when not an array", () => {
      const playbook = `---
- hosts: all
  pre_tasks: not-an-array
  tasks:
    - name: Main task`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("1. Main task");
    });

    it("should skip post_tasks when not an array", () => {
      const playbook = `---
- hosts: all
  tasks:
    - name: Main task
  post_tasks: not-an-array`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("1. Main task");
    });

    it("should skip tasks when not an array", () => {
      const playbook = `---
- hosts: all
  tasks: not-an-array
  pre_tasks:
    - name: Pre-task`;

      const result = generateOutlineFromPlaybook(playbook);

      expect(result).toBe("1. Pre-task");
    });
  });

  describe("generateOutlineFromRole", () => {
    it("should generate outline from role tasks", () => {
      const roleYaml = `---
- name: Install package
- name: Configure service
- name: Start service`;

      const result = generateOutlineFromRole(roleYaml);

      expect(result).toBe(
        "1. Install package\n2. Configure service\n3. Start service",
      );
    });

    it("should return empty string for invalid YAML", () => {
      const roleYaml = ANSIBLE_CONTENT.INVALID_YAML;

      const result = generateOutlineFromRole(roleYaml);

      expect(result).toBe("");
    });

    it("should return empty string for non-array role YAML", () => {
      const roleYaml = `---
name: Task
action: debug`;

      const result = generateOutlineFromRole(roleYaml);

      expect(result).toBe("");
    });

    it("should return empty string for role with no tasks", () => {
      const roleYaml = `--- []`;

      const result = generateOutlineFromRole(roleYaml);

      expect(result).toBe("");
    });

    it("should handle role with single task", () => {
      const roleYaml = `---
- name: Single task`;

      const result = generateOutlineFromRole(roleYaml);

      expect(result).toBe("1. Single task");
    });

    it("should skip tasks without name field", () => {
      const roleYaml = `---
- name: Task with name
- debug:
    msg: "Task without name"
- name: Another task with name`;

      const result = generateOutlineFromRole(roleYaml);

      expect(result).toBe("1. Task with name\n2. Another task with name");
    });

    it("should return empty string for empty role YAML", () => {
      const roleYaml = "";

      const result = generateOutlineFromRole(roleYaml);

      expect(result).toBe("");
    });
  });

  describe("parseOutlineToTaskList", () => {
    it("should parse numbered outline to task list", () => {
      const outline = "1. First task\n2. Second task\n3. Third task";

      const result = parseOutlineToTaskList(outline);

      expect(result).toEqual(["First task", "Second task", "Third task"]);
    });

    it("should handle outline with single task", () => {
      const outline = "1. Single task";

      const result = parseOutlineToTaskList(outline);

      expect(result).toEqual(["Single task"]);
    });

    it("should handle outline with multi-digit numbers", () => {
      const outline = "1. Task one\n10. Task ten\n100. Task hundred";

      const result = parseOutlineToTaskList(outline);

      expect(result).toEqual(["Task one", "Task ten", "Task hundred"]);
    });

    it("should handle outline with extra whitespace", () => {
      const outline = "  1.  Task one  \n  2.  Task two  ";

      const result = parseOutlineToTaskList(outline);

      expect(result).toEqual(["Task one", "Task two"]);
    });

    it("should filter out empty lines", () => {
      const outline = "1. Task one\n\n2. Task two\n\n3. Task three";

      const result = parseOutlineToTaskList(outline);

      expect(result).toEqual(["Task one", "Task two", "Task three"]);
    });


    it("should return empty array for empty outline", () => {
      const outline = "";

      const result = parseOutlineToTaskList(outline);

      expect(result).toEqual([]);
    });

    it("should handle outline with tasks containing numbers", () => {
      const outline = "1. Install version 2.0\n2. Configure port 8080";

      const result = parseOutlineToTaskList(outline);

      expect(result).toEqual(["Install version 2.0", "Configure port 8080"]);
    });
  });
});

