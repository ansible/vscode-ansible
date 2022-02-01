#!/bin/bash
# This tool is used to setup the environment for running the tests. Its name
# name and location is based on Zuul CI, which can automatically run it.
set -ex
# we don't want the outdated ubuntu blend of ansible
if [ "$RUNNER_OS" == "Linux" ]; then
    sudo apt-get remove -y ansible
fi

pipx install pre-commit
if [ "$RUNNER_OS" != "Windows" ]; then
    # GHA comes with ansible-core preinstalled via pipx, so we will
    # inject the linter into it. MacOS does not have it.
    pipx install ansible-core
    pipx inject --include-apps ansible-core ansible-lint yamllint
    ansible --version
    ansible-lint --version
fi

npm config set fund false
npm ci
