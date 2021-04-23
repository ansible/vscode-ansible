# Ansible extension for vscode and vscodium

Ansible extension aims to ease life of Ansible content creators by making
easier to write Ansible playbooks, roles, collections, modules and plugins.

![ansible-lint](https://github.com/ansible-community/vscode-ansible/raw/master/images/gh-social-preview.png)

## Features

* Display violations identified by [ansible-lint](https://github.com/ansible-community/ansible-lint), ansible own syntax check and
[yamllint](https://github.com/adrienverge/yamllint) inside problems tab.
* Validate Ansible YAML files and provide auto-complete by using [Ansible schemas](https://github.com/ansible-community/schemas/tree/main/f). Report schema issue directly to the project producing them as they are not embedded inside this extension.
* Support vaults editing via `ansible-vault` command. Specify your vault passwords in `vault_identity_list` in ansible.cfg or in `ANSIBLE_VAULT_IDENTITY_LIST` environment variable and choose the one you want to use when prompted :
  * `[Ctrl+Alt+0]` for Linux and Windows
  * `[Cmd+Alt+0]` for Mac

## Requirements

This extension also installs YAML extension in order to enable schema verification and code-completion.
You need to have Ansible installed locally to have vaults support feature fully working.

## Known Issues

* For the moment you need to install `ansible-lint` yourself
  * If you would not like to install `ansible-lint` system-wide, check out [How to integrate ansible-lint in venv with Ansible Language Extension](doc/topics/integrate_ansible-lint_in_venv/README.md).
* You may want to add few additional tags entries to your `settings.json`:

```json
    "yaml.customTags": [
        "!encrypted/pkcs1-oaep sequence"
    ]
```

## Release Notes

Please check [changelog](https://marketplace.visualstudio.com/items/zbr.vscode-ansible/changelog) page for details regarding each new version.
