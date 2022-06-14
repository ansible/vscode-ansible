#!/bin/bash
# This tool is used to setup the environment for running the tests. Its name
# name and location is based on Zuul CI, which can automatically run it.
set -ex
# we don't want the outdated ubuntu blend of ansible
if [ "$RUNNER_OS" == "Linux" ]; then
    sudo apt-get remove -y ansible
fi

if [[ "$UNAME" == CYGWIN* || "$UNAME" == MINGW* ]] ; then
    echo "You cannot use Windows for development, but you could try using WSL2 if you ensure that everything runs under it."
    exit 2
fi

if [ -z ${VIRTUAL_ENV+x} ]; then
    if [[ ! -d "${VENV_PATH:-.venv}" ]]; then
        python3 -m venv "${VENV_PATH:-.venv}"
    fi
    which -a python3
    python3 --version
    # shellcheck disable=SC1091
    source "${VENV_PATH:-.venv}/bin/activate"
fi

# GHA comes with ansible-core preinstalled via pipx, so we will
# inject the linter into it. MacOS does not have it.
pip install -U pip
pip install -q pre-commit 'ansible-core>=2.13' 'ansible-lint>=6.2.2'
ansible --version
ansible-lint --version

npm ci
