#!/bin/bash
# This tool is used to setup the environment for running the tests. Its name
# name and location is based on Zuul CI, which can automatically run it.
# (cspell: disable-next-line)
set -euo pipefail

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
    INSTALL=0
    for CMD in curl git python3; do
        command -v $CMD >/dev/null 2>&1 || INSTALL=1
    done
    if [ "$INSTALL" -eq 1 ]; then
        echo "We need sudo to install some package: python3, git, curl"
        # avoid outdated ansible and pipx
        sudo apt-get remove -y ansible pipx || true
        sudo apt-get install -y --no-install-recommends -o=Dpkg::Use-Pty=0 \
            curl git python3-venv python3-pip
    fi
fi


# install gh if missing
which gh >/dev/null 2>&1 || {
    echo "Trying to install missing gh on $OS ..."
    if [ "$OS" == "linux" ]; then
      which dnf && sudo dnf install -y gh || true
    fi
    gh --version || echo "WARNING: gh cli not found and it might be needed for some commands."
}

# on WSL we want to avoid using Windows's npm (broken)
if [ "$(which npm)" == '/mnt/c/Program Files/nodejs/npm' ]; then

    curl -sL https://deb.nodesource.com/setup_16.x | sudo bash
    sudo apt-get install -y -qq -o=Dpkg::Use-Pty=0 nodejs gcc g++ make
fi

if [[ ! -d "${VENV_PATH:-.venv}" ]]; then
    python3 -m venv "${VENV_PATH:-.venv}"
fi

if [ -z ${VIRTUAL_ENV+x} ]; then
    # shellcheck disable=SC1091
    source "${VENV_PATH:-.venv}/bin/activate"
fi
python3 -m pip install -U pip

if [[ $(uname) != MINGW* ]]; then # if we are not on pure Windows
    python3 -m pip install -c .config/requirements.txt -r .config/requirements.in
    ansible --version
    ansible-lint --version
fi

command -v nvm >/dev/null 2>&1 || {
    # define its location (needed)
    [ -z "${NVM_DIR:-}" ] && export NVM_DIR="$HOME/.nvm";
    # install if missing
    [ ! -s "${NVM_DIR:-}/nvm.sh" ] && curl -s -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    # activate vnm
    . "${NVM_DIR:-}/nvm.sh" --silent;
    [ -s "/usr/local/opt/nvm/nvm.sh" ] && . "/usr/local/opt/nvm/nvm.sh";
}
which npm  >/dev/null 2>&1 || {
    nvm install
}

# Log some useful info in case of unexpected failures:
uname
git --version
python3 --version
pre-commit --version
nvm --version
npm --version

# install npm packages
npm config set fund false
npm ci
