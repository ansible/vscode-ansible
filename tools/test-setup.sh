#!/bin/bash
# This tool is used to setup the environment for running the tests. Its name
# name and location is based on Zuul CI, which can automatically run it.
set -euo pipefail

# User specific environment
# shellcheck disable=SC2076
for entry in "$HOME/.local/bin"; do
    if ! [[ "$PATH" =~ $entry ]]
    then
        PATH="$entry:$PATH"
    fi
done
set +x
# remove npm from PATH
#PATH=`echo $PATH | tr ':' '\n' | grep -v /npm | tr '\n' ':'`
#export PATH

# save it for further sessions
# shellcheck disable=SC2016
#echo 'export PATH="$PATH"' >> ~/.bashrc
set -x

if [ -f "/etc/os-release" ]; then
    if [ ! -f "/var/cache/apt/pkgcache.bin" ]; then
        sudo apt-get update  # mandatory or other apt-get commands fail
    fi
    # add podman repos
    echo "deb https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_20.04/ /" | sudo tee /etc/apt/sources.list.d/devel:kubic:libcontainers:stable.list
    curl -L "https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_20.04/Release.key" | sudo apt-key add -

    # avoid outdated ansible and pipx
    sudo apt-get remove -y ansible pipx || true
    sudo apt-get install -y --no-install-recommends -o=Dpkg::Use-Pty=0 \
        curl pre-commit python3-venv podman
    podman pull quay.io/ansible/creator-ee:latest
    # validate that podman is really working
    podman run -t quay.io/ansible/creator-ee:latest ansible-lint --version
fi

# on WSL we want to avoid using Windows's npm (broken)
if [ "$(which npm)" == '/mnt/c/Program Files/nodejs/npm' ]; then

    curl -sL https://deb.nodesource.com/setup_16.x | sudo bash
    sudo apt install -qq -o=Dpkg::Use-Pty=0 nodejs
    node --version
    npm --version
    which -a npm
    which -a node
fi

which pipx || python3 -m pip install --user pipx
which -a pipx
which pre-commit || pipx install pre-commit
uname
if [[ $(uname) != MINGW* ]]; then # if we are not on pure Windows
    # GHA comes with ansible-core preinstalled via pipx, so we will
    # inject the linter into it. MacOS does not have it.
    which ansible || pipx install ansible-core

    # we need pipx 1.0 as Ubuntu has a outdated/incompatible version
    pipx inject --include-deps --include-apps ansible-core ansible-lint yamllint
    ansible --version
    ansible-lint --version
fi

npm config set fund false
npm ci
