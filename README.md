<!-- This *Overview* page for extension should only advertise main features
and not include any documentation about how to use them. Its purpose is to
display what it can do and display well inside:

- https://github.com/ansible/vscode-ansible
- https://marketplace.visualstudio.com/items?itemName=redhat.ansible
- https://open-vsx.org/extension/redhat/ansible
- vscode internal extension browser

Full size of the page should not be more than two screens long. Use only
one video on this page. -->

# Ansible VS Code Extension

[![GitHub Release](https://img.shields.io/github/v/release/ansible/vscode-ansible?sort=semver&style=flat)](https://github.com/ansible/vscode-ansible/releases)
[![GitHub Repo stars](https://img.shields.io/github/stars/ansible/vscode-ansible?style=flat)](https://github.com/ansible/vscode-ansible)
![Codecov](https://img.shields.io/codecov/c/github/ansible/vscode-ansible?token=TmpTe2lSNW&style=flat&color=007ec6)

The Ansible extension for Visual Studio Code streamlines Ansible development by
providing an integrated, feature-rich environment tailored for automation
workflows. It offers features such as syntax highlighting, linting, intelligent
code completion, and AI-assisted suggestions via Ansible Lightspeed.

With support for multi-root workspaces, containerized execution environments,
and extensive configuration options, the extension enhances productivity and
ensures consistent code quality for both individual and team-based projects.
This extension adds language support for Ansible in
[Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=redhat.ansible)
and [OpenVSX](https://open-vsx.org/extension/redhat/ansible) by using the
[ansible-language-server](packages/ansible-language-server).

Please visit
[vscode-ansible documentation website](https://ansible.readthedocs.io/projects/vscode-ansible/)
for any instructions about installation, configuration and usage, including on
how to contribute to it.

![Linter support](https://raw.githubusercontent.com/wiki/ansible/vscode-ansible/images/activate-extension.gif)

## Features

- Ansible language server support with: [syntax highlighting], [validation],
  [linting], [auto-completion], [documentation reference], [go to definition].
- Interactive [walkthroughs] for most common actions
- [Content Creation Tools]
- [LightSpeed] support for AI-assisted code completion

[auto-completion]:
  https://ansible.readthedocs.io/projects/vscode-ansible/#smart-autocompletion
[syntax highlighting]:
  https://ansible.readthedocs.io/projects/vscode-ansible/#syntax-highlighting
[linting]:
  https://ansible.readthedocs.io/projects/vscode-ansible/#integration-with-ansible-lint
[validation]: https://ansible.readthedocs.io/projects/vscode-ansible/#validation
[documentation reference]:
  https://ansible.readthedocs.io/projects/vscode-ansible/#documentation-reference
[go to definition]:
  https://ansible.readthedocs.io/projects/vscode-ansible/#jump-to-module-code
[walkthroughs]:
  https://ansible.readthedocs.io/projects/vscode-ansible/#interactive-walkthroughs
[Content Creation Tools]:
  https://ansible.readthedocs.io/projects/vscode-ansible/#content-creation-tools
[LightSpeed]:
  https://ansible.readthedocs.io/projects/vscode-ansible/#ansible-lightspeed
