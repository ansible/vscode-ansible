#!/bin/bash
# (cspell: disable-next-line)
set -euo pipefail

# Ensure we have the our sibling ready
if [[ ! -d ../vscode-ansible ]]; then
  cd ..
  git clone https://github.com/ansible/vscode-ansible
  cd vscode-ansible
else
  cd ../vscode-ansible
  git checkout main
  git pull --ff-only
fi

unset VIRTUAL_ENV

cleanup() {
    rv=$?
    pgrep xvfb-run | xargs --no-run-if-empty sudo kill || true
    exit $rv
}

if [[ -f "/usr/bin/apt-get" ]]; then
  trap "cleanup" SIGINT SIGTERM ERR EXIT
  xvfb-run --auto-servernum task devel -- ../ansible-language-server
else
  task devel -- ../ansible-language-server
fi
