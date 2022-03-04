#!/bin/bash
# This tool is used to setup the environment for running the tests. Its name
# name and location is based on Zuul CI, which can automatically run it.
# (cspell: disable-next-line)
set -euxo pipefail

# User specific environment
# shellcheck disable=SC2076
if ! [[ "$PATH" =~ "$HOME/.local/bin" ]]; then
    cat >>"$HOME/.bashrc" <<EOF
# User specific environment
if ! [[ "$PATH" =~ "$HOME/.local/bin" ]]; then
    PATH="$HOME/.local/bin:$PATH"
fi
export PATH
EOF
    # shellcheck disable=SC1091
    source "$HOME/.bashrc"
fi


if [ -f "/usr/bin/apt-get" ]; then
    if [ ! -f "/var/cache/apt/pkgcache.bin" ]; then
        sudo apt-get update  # mandatory or other apt-get commands fail
    fi
    # avoid outdated ansible and pipx
    sudo apt-get remove -y ansible pipx || true
    sudo apt-get install -y --no-install-recommends -o=Dpkg::Use-Pty=0 \
        curl git python3-venv python3-pip
fi

# on WSL we want to avoid using Windows's npm (broken)
if [ "$(which npm)" == '/mnt/c/Program Files/nodejs/npm' ]; then

    curl -sL https://deb.nodesource.com/setup_16.x | sudo bash
    sudo apt-get install -y -qq -o=Dpkg::Use-Pty=0 nodejs gcc g++ make
fi

which pipx || python3 -m pip install --user pipx
which -a pipx
which pre-commit || pipx install pre-commit

if [[ $(uname) != MINGW* ]]; then # if we are not on pure Windows
    # GHA comes with ansible-core preinstalled via pipx, so we will
    # inject the linter into it. MacOS does not have it.
    which ansible || pipx install ansible-core

    # we need pipx 1.0 as Ubuntu has a outdated/incompatible version
    pipx inject --include-deps --include-apps ansible-core ansible-lint yamllint
    ansible --version
    ansible-lint --version
fi

# Log some useful info in case of unexpected failures:
uname
git --version
python3 --version
pre-commit --version
node --version
npm --version

# install npm packages
npm config set fund false
npm ci
