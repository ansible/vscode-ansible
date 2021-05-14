# Ansible extension for vscode and vscodium

Ansible extension aims to ease life of Ansible content creators by making
easier to write Ansible playbooks, roles, collections, modules and plugins.

![ansible-lint](https://github.com/ansible-community/vscode-ansible/raw/master/images/gh-social-preview.png)

## Features

* Display violations identified by [ansible-lint](https://github.com/ansible-community/ansible-lint), ansible own syntax check and
[yamllint](https://github.com/adrienverge/yamllint) inside problems tab.
* Validate Ansible YAML files and provide auto-complete by using [Ansible schemas](https://github.com/ansible-community/schemas/tree/main/f). Report schema issue directly to the project producing them as they are not embedded inside this extension.
* Support inline or full file vaults editing via `ansible-vault` command. Check out [How to edit vaults](doc/topics/vault_editing/README.md)

## Requirements

This extension also installs YAML extension in order to enable schema verification and code-completion.
You need to have Ansible installed locally to have vaults support feature fully working.

## Known Issues

* For the moment you need to install `ansible-lint` yourself
  * If you would not like to install `ansible-lint` system-wide, check out [How to integrate ansible-lint in venv with Ansible Language Extension](doc/topics/integrate_ansible-lint_in_venv/README.md).
* Validation schemas used are from the [schemas](https://github.com/ansible-community/schemas) project, so if the schema name is correct, please file bugs directly there.
* Schema type assignation is done purely on the filepath, without looking at file content. This means that playbooks are identified only when they are inside a folder named playbooks. The same applies to vars and tasks. If you do not follow the [official Ansible code layout guidelines](https://docs.ansible.com/ansible/latest/dev_guide/developing_collections.html#collection-structure) you will not be able to benefit from all of the features. In some cases, unfortunate file or directory naming could confuse the tool to make it attempt to use a different schema. You can override the [default file patterns](https://github.com/ansible-community/vscode-ansible/blob/master/package.json#L136) used to determine which schema is used in your vscode [settings.json](https://github.com/redhat-developer/vscode-yaml#associating-a-schema-to-a-glob-pattern-via-yamlschemas).

## Release Notes

Please check [changelog](https://marketplace.visualstudio.com/items/zbr.vscode-ansible/changelog) page for details regarding each new version.
