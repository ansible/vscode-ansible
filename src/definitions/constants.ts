/* eslint-disable @typescript-eslint/no-namespace */

import { IAnsibleFileTypes } from "../interfaces/lightspeed";

export namespace AnsibleCommands {
  export const ANSIBLE_VAULT = "extension.ansible.vault";
  export const ANSIBLE_INVENTORY_RESYNC = "extension.resync-ansible-inventory";
  export const ANSIBLE_PLAYBOOK_RUN = "extension.ansible-playbook.run";
  export const ANSIBLE_NAVIGATOR_RUN = "extension.ansible-navigator.run";
  export const ANSIBLE_LIGHTSPEED_STATIC_SCAN =
    "extension.ansible.lightspeed.scan";
  export const ANSIBLE_LIGHTSPEED_POLICY_VALIDATE_PRE_RUN =
    "extension.ansible.lightspeed.policy-check.pre-run";
  export const ANSIBLE_LIGHTSPEED_POLICY_VALIDATE_POST_RUN =
    "extension.ansible.lightspeed.policy-check.post-run";
  export const ANSIBLE_PYTHON_SET_INTERPRETER =
    "ansible.python.set.interpreter";
}

export const AnsibleFileTypes: IAnsibleFileTypes = {
  "**/playbooks/*.{yml,yaml}": "playbook",
  "**/*playbook*.{yml,yaml}": "playbook",
  "**/roles/**/tasks/**/*.{yml,yaml}": "tasks_in_role",
  "**/tasks/**/*.{yaml,yml}": "tasks",
};

export const PlaybookKeywords = [
  "hosts",
  "tasks",
  "vars_files",
  "roles",
  "pre_tasks",
  "post_tasks",
];

export const StandardRolePaths = [
  "~/.ansible/roles",
  "/usr/share/ansible/roles",
  "/etc/ansible/roles",
];

export const IncludeVarValidTaskName = [
  "include_vars",
  "ansible.builtin.include_vars",
  "ansible.legacy.include_vars",
];

export const ANSIBLE_LIGHTSPEED_API_TIMEOUT = 50000;
