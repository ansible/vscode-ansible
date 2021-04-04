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
### Depends on ansible-lint
For the  moment you need to install `ansible-lint` yourself.  
If you don't want to mess up the system-wide python packages list, we have a hint for you.

First, make your own Python virtual environment to install `ansible-lint`.  
For example, execute the following command to make a virtual environment called "system".

```sh
$ python3 -m venv ~/venv/system
```

Get into the "system" virtual environment, and install `ansible-lint`.

```sh
$ source ~/venv/system
(system)$ pip install ansible-lint
```

Open VS code, and select `File > Preferences > Settings`.  
Search for "ansible.validate.executablePath" in the search bar on top.  
Click on "Edit in settings.json" to open `settings.json` for users.

Then add the following line to register the `ansible-lint` execution path in VS Code (\*).  
This setting is necessary because `ansible-lint` is not in regular PATH environment variable.  
(\*) The path to `ansible-lint` must be changed depending on your environment.

```json
"ansible.validate.executablePath": "/home/user-name/venv/system/bin/ansible-lint"
```

## Release Notes

Please check [changelog](https://marketplace.visualstudio.com/items/zbr.vscode-ansible/changelog) page for details regarding each new version.
