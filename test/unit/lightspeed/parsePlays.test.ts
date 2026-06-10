import assert from "assert";
import * as yaml from "yaml";
import { parsePlays } from "@src/features/lightspeed/utils/parsePlays";

function parseYaml(yamlString: string): unknown[] {
  const parsed: unknown = yaml.parse(yamlString, {
    keepSourceTokens: true,
  });
  if (!Array.isArray(parsed)) {
    throw new Error("Expected YAML array");
  }
  return parsed;
}

function getName(item: unknown): string | undefined {
  if (typeof item !== "object" || item === null || !("name" in item)) {
    return undefined;
  }
  const name = (item as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

describe("parsePlays", function () {
  it("Test a playbook with tasks", function () {
    const PLAYBOOK = `---
- name: Test 1
  hosts: all
  tasks:
    - name: Task 1
      ansible.builtin.debug:
        msg: Task 1
    - name: Task 2
      ansible.builtin.debug:
        msg: Task 2
`;
    const out = parsePlays(parseYaml(PLAYBOOK));
    assert.ok(out);
    assert.equal(out.length, 2);
    assert.equal(getName(out[0]), "Task 1");
    assert.equal(getName(out[1]), "Task 2");
  });

  it("Test a playbook without tasks", function () {
    const PLAYBOOK = `---
- name: Test 2
  hosts: all
  roles:
    - my_role
`;
    const out = parsePlays(parseYaml(PLAYBOOK));
    assert.ok(out);
    assert.equal(out.length, 1);
    assert.equal(getName(out[0]), "Test 2");
  });

  it("Test a playbook with multiple plays", function () {
    const PLAYBOOK = `---
- name: Test 3-1
  hosts: all
  roles:
    - my_role
- name: Test 3-2
  hosts: all
  tasks:
    - name: Task 1
      ansible.builtin.debug:
        msg: Task 1
    - ansible.builtin.debug: # task w/o name
        msg: Task 2b
- hosts: localhost # play w/o name
  roles:
    - my_role_2
`;
    const out = parsePlays(parseYaml(PLAYBOOK));
    assert.ok(out);
    assert.equal(out.length, 4);
    assert.equal(getName(out[0]), "Test 3-1");
    assert.equal(getName(out[1]), "Task 1");
    assert.equal(getName(out[2]), undefined);
    assert.equal(getName(out[3]), undefined);
  });
});
