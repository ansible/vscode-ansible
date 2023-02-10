#!/bin/bash
set -euo pipefail

if [[ -d ../ansible-language-server ]]; then
    echo "Ansible Language Server already cloned"
else
    echo "Cloning Ansible Language Server"
    git clone https://github.com/ansible/ansible-language-server ../ansible-language-server
fi

# install dependencies of ansible-language-server before linking it to vscode-ansible
echo "Installing deps and compiling Ansible Language Server"
cd ../ansible-language-server
npm ci
cd ../vscode-ansible
