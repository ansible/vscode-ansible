import assert from "assert";
import * as yaml from "yaml";
import { parsePlays } from "../../../src/features/lightspeed/utils/parsePlays";

function parseYaml(yamlString: string) {
  return yaml.parse(yamlString, {
    keepSourceTokens: true,
  });
}

describe("Test parsePlays", () => {
  it("Test a playbook with tasks", () => {
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
    assert.equal(out[0].name, "Task 1");
    assert.equal(out[1].name, "Task 2");
  });

  it("Test a playbook without tasks", () => {
    const PLAYBOOK = `---
- name: Test 2
  hosts: all
  roles:
    - my_role
`;
    const out = parsePlays(parseYaml(PLAYBOOK));
    assert.ok(out);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, "Test 2");
  });

  it("Test a playbook with multiple plays", () => {
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
    assert.equal(out[0].name, "Test 3-1");
    assert.equal(out[1].name, "Task 1");
    assert.equal(out[2].name, undefined);
    assert.equal(out[3].name, undefined);
  });
});
