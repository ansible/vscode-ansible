# Ansible extension for vscode and vscodium

Ansible extension aims to ease life of Ansible content creators by making
easier to write Ansible playbooks, roles, collections, modules and plugins.

![ansible-lint](https://github.com/ansible-community/vscode-ansible/raw/master/images/gh-social-preview.png)

## Features

* Display violations identified by [ansible-lint](https://github.com/ansible-community/ansible-lint), ansible own syntax check and
[yamllint](https://github.com/adrienverge/yamllint) inside problems tab.
* Validate Ansible YAML files and provide auto-complete by using [Ansible schemas](https://github.com/ansible-community/schemas/tree/main/f). Report schema issue directly to the project producing them as they are not embedded inside this extension.

## Requirements

This extension also installs YAML extension in order to enable schema verification and code-completion.

## Known Issues

* For the  moment you need to install `ansible-lint` yourself
* You may want to add few additional tags entries to your `settings.json`:

```json
    "yaml.customTags": [
        "!encrypted/pkcs1-oaep sequence"
    ]
```

## Release Notes

Please check [changelog](https://marketplace.visualstudio.com/items/zbr.vscode-ansible/changelog) page for details regarding each new version.
