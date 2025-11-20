/* eslint-disable @typescript-eslint/no-namespace */

import { IAnsibleFileTypes } from "../interfaces/lightspeed";

export namespace AnsibleCommands {
  export const ANSIBLE_VAULT = "extension.ansible.vault";
  export const ANSIBLE_INVENTORY_RESYNC = "extension.resync-ansible-inventory";
  export const ANSIBLE_PLAYBOOK_RUN = "extension.ansible-playbook.run";
  export const ANSIBLE_NAVIGATOR_RUN = "extension.ansible-navigator.run";
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

export const ADE_ISOLATION_MODE_MIN = "25.4.0";

/* Slightly lower than CloudFront's timeout which is 30s. */
export const ANSIBLE_LIGHTSPEED_API_TIMEOUT = 28000;

export const ANSIBLE_CREATOR_VERSION_MIN = "24.10.1";

export const ANSIBLE_CREATOR_COLLECTION_VERSION_MIN = "24.7.1";

export const ANSIBLE_CREATOR_EE_VERSION_MIN = "24.12.1";

export const DevfileImages = {
  Upstream: "ghcr.io/ansible/ansible-devspaces:latest",
};

export const DevcontainerImages = {
  Upstream: "ghcr.io/ansible/community-ansible-dev-tools:latest",
  Downstream:
    "registry.redhat.io/ansible-automation-platform-25/ansible-dev-tools-rhel8:latest",
};

export const DevcontainerRecommendedExtensions = {
  RECOMMENDED_EXTENSIONS: ["redhat.ansible", "redhat.vscode-redhat-account"],
};

// Ansible-specific prompts and system instructions for LLM providers
export const ANSIBLE_SYSTEM_PROMPT_PLAYBOOK = `You are an Ansible expert.
Your role is to help Ansible developers write playbooks.
You answer with just an Ansible playbook.`;

// For role generation (from backend: langchain/pipelines.py)
export const ANSIBLE_SYSTEM_PROMPT_ROLE = `You are an ansible expert optimized to generate Ansible roles.
First line the role name in a way: role_name.
After that the answer is a plain tasks/main.yml file for the user's request.
Prefix your comments with the hash character.`;

// For chat/explanations
export const ANSIBLE_SYSTEM_PROMPT_CHAT = `You are Ansible Lightspeed Intelligent Assistant - an intelligent virtual assistant for question-answering tasks related to the Ansible Automation Platform (AAP).
You are an expert on all things Ansible. Provide helpful, accurate answers about Ansible.
If the context of the question is not clear, consider it to be Ansible.
Refuse to answer questions not about Ansible.`;

// For task completion (inline suggestions)
export const ANSIBLE_SYSTEM_PROMPT_COMPLETION =
  "You are an Ansible expert. Return a single task that best completes the partial playbook. Return only the task as YAML. Do not return multiple tasks. Do not explain your response. Do not include the prompt in your response.";

// For playbook explanation
export const ANSIBLE_SYSTEM_PROMPT_EXPLANATION = `You're an Ansible expert.
You format your output with Markdown.
You only answer with text paragraphs.
Write one paragraph per Ansible task.
Markdown title starts with the '#' character.
Write a title before every paragraph.
Do not return any YAML or Ansible in the output.
Give a lot of details regarding the parameters of each Ansible plugin.`;

// Template for playbook generation
export const ANSIBLE_PLAYBOOK_GENERATION_TEMPLATE = `This is what the playbook should do: {PROMPT}`;

// Template for role generation
export const ANSIBLE_ROLE_GENERATION_TEMPLATE = `This is what the role should do: {PROMPT}`;

// Template for playbook explanation
export const ANSIBLE_PLAYBOOK_EXPLANATION_TEMPLATE = `Please explain the following Ansible playbook:

{PLAYBOOK}`;
