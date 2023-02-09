#!/bin/bash
set -euo pipefail

if [[ -d ../ansible-language-server ]]; then
    echo "Ansible Language Server already cloned"
    exit 0
else
    echo "Cloning Ansible Language Server"
    git clone https://github.com/ansible/ansible-language-server ../ansible-language-server
fi
