#!/bin/bash
# This tool is used to setup the environment for running the tests. Its name
# name and location is based on Zuul CI, which can automatically run it.
set -ex
# we don't want the outdated ubuntu blend of ansible
if [ "$RUNNER_OS" == "Linux" ]; then
  sudo apt-get remove -y ansible
fi

pipx install pre-commit
# see https://github.com/pypa/pipx/issues/88
pipx install ansible-lint
if [ "$RUNNER_OS" != "Windows" ]; then
  pipx inject --include-apps ansible-lint yamllint ansible-core
  ansible-lint --version
  ansible --version
fi

npm config set fund false
npm ci
