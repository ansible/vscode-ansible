#!/bin/bash
#
# This tool is used to setup the environment for running the tests. Its name
# name and location is based on Zuul CI, which can automatically run it.
# (cspell: disable-next-line)
set -euo pipefail

IMAGE=quay.io/ansible/creator-ee:latest
PIP_LOG_FILE=out/log/pip.log
HOSTNAME="${HOSTNAME:-localhost}"
ERR=0
EE_ANSIBLE_VERSION=null
EE_ANSIBLE_LINT_VERSION=null

mkdir -p out/log
# we do not want pip logs from previous runs
:> "${PIP_LOG_FILE}"

# Function to retrieve the version number for a specific command. If a second
# argument is passed, it will be used as return value when tool is missing.
get_version () {
  if command -v "$1" >/dev/null 2>&1; then
    _cmd=("${@:1}")
    # if we did not pass any arguments, we add --version ourselves:
    if [[ $# -eq 1 ]]; then
      _cmd+=('--version')
    fi
    "${_cmd[@]}" | head -n1 | sed -r 's/^[^0-9]*([0-9][0-9\\w\\.]*).*$/\1/'
  else
    >&2 echo "ERROR $? running: $*"
    return 99
  fi
}

# Fail-fast if run on Windows or under WSL1/2 on /mnt/c because it is so slow
# that we do not support it at all. WSL use is ok, but not on mounts.
if [[ "${OS:-}" == "windows" ]]; then
    echo "ERROR: You cannot use Windows build tools for development, try WSL."
    exit 1
fi
if grep -qi microsoft /proc/version >/dev/null 2>&1; then
    # resolve pwd symlinks and ensure than we do not run under /mnt (mount)
    if [[ "$(pwd -P || true)" == /mnt/* ]]; then
        echo "WARNING: Under WSL, you must avoid running from mounts (/mnt/*) due to critical performance issues."
    fi
fi

# User specific environment
if ! [[ "${PATH}" == *"${HOME}/.local/bin"* ]]; then
    echo "WARN: ~/.local/bin was not found in PATH, attempting to add it."
    cat >>"${HOME}/.bashrc" <<EOF
# User specific environment
if ! [[ "${PATH}" =~ "${HOME}/.local/bin" ]]; then
    PATH="${HOME}/.local/bin:${PATH}"
fi
export PATH
EOF
    PATH="${HOME}/.local/bin:${PATH}"
fi

if [[ -f "/usr/bin/apt-get" ]]; then
    INSTALL=0
    # qemu-user-static is required by podman on arm64
    # python3-dev is needed for headers as some packages might need to compile
    DEBS=(curl git python3-dev python3-venv python3-pip qemu-user-static xvfb)
    for DEB in "${DEBS[@]}"; do
        [[ "$(dpkg-query --show --showformat='${db:Status-Status}\n' "${DEB}" || true)" != 'installed' ]] && INSTALL=1
    done
    if [[ "${INSTALL}" -eq 1 ]]; then
        printf '%s\n' "We need sudo to install some packages: ${DEBS[*]}"
        # mandatory or other apt-get commands fail
        sudo apt-get update -qq -o=Dpkg::Use-Pty=0
        # avoid outdated ansible and pipx
        sudo apt-get remove -y ansible pipx || true
        # install all required packages
        sudo apt-get install -y --no-install-recommends --no-install-suggests -o=Dpkg::Use-Pty=0 "${DEBS[@]}"
    fi
fi


# install gh if missing
command -v gh >/dev/null 2>&1 || {
    echo "Trying to install missing gh on ${OS} ..."
    if [[ "${OS}" == "linux" ]]; then
      command -v dnf && sudo dnf install -y gh
    fi
    gh --version || echo "WARNING: gh cli not found and it might be needed for some commands."
}

# on WSL we want to avoid using Windows's npm (broken)
if [[ "$(command -v npm || true)" == '/mnt/c/Program Files/nodejs/npm' ]]; then
    curl -sL https://deb.nodesource.com/setup_16.x | sudo bash
    sudo apt-get install -y -qq -o=Dpkg::Use-Pty=0 nodejs gcc g++ make python3-dev
fi


VIRTUAL_ENV=${VIRTUAL_ENV:-out/venvs/${HOSTNAME}}
if [[ ! -d "${VIRTUAL_ENV}" ]]; then
    python3 -m venv "${VIRTUAL_ENV}"
fi
# shellcheck disable=SC1091
. "${VIRTUAL_ENV}/bin/activate"

python3 -m pip install -q -U pip

if [[ $(uname || true) != MINGW* ]]; then # if we are not on pure Windows
    python3 -m pip install -q -c .config/requirements.txt -r .config/requirements.in
fi

command -v nvm >/dev/null 2>&1 || {
    # define its location (needed)
    [[ -z "${NVM_DIR:-}" ]] && export NVM_DIR="${HOME}/.nvm";
    # install if missing
    [[ ! -s "${NVM_DIR:-}/nvm.sh" ]] && curl -s -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    # activate nvm
    # shellcheck disable=1091
    . "${NVM_DIR:-}/nvm.sh"
    # shellcheck disable=1091
    [[ -s "/usr/local/opt/nvm/nvm.sh" ]] && . "/usr/local/opt/nvm/nvm.sh";
}
command -v npm  >/dev/null 2>&1 || {
    nvm install stable
}

# Detect podman and ensure that it is usable
PODMAN_VERSION="$(get_version podman || echo null)"
if [[ "${PODMAN_VERSION}" != 'null' ]]; then
  if [[ "$(podman machine ls --format '{{.Running}}' --noheading || true)" == "false" ]]; then
    echo -n "Starting podman machine "
    podman machine start
    while [[ "$(podman machine ls --format '{{.Running}}' --noheading || true)" != "true" ]]; do
        sleep 1
        echo -n .
    done
    echo .
  fi
  podman pull --quiet "${IMAGE}" >/dev/null
  # without running we will never be sure it works (no arm64 image yet)
  EE_ANSIBLE_VERSION=$(get_version podman run -i ${IMAGE} ansible --version) || ERR=$?
  EE_ANSIBLE_LINT_VERSION=$(get_version podman run -i ${IMAGE} ansible-lint --version) || ERR=$?
fi

# Create a build manifest so we can compare between builds and machines, this
# also has the role of ensuring that the required executables are present.
#
cat >out/log/manifest.yml <<EOF
system:
  uname: $(uname)
env:
  ARCH: ${ARCH:-null}  # taskfile
  OS: ${OS:-null}    # taskfile
  OSTYPE: ${OSTYPE}
tools:
  ansible: $(get_version ansible)
  ansible-lint: $(get_version ansible-lint)
  bash: $(get_version bash)
  git: $(get_version git)
  gh: $(get_version gh || echo null)
  node: $(get_version node)
  npm: $(get_version npm)
  nvm: $(get_version nvm || echo null)
  pre-commit: $(get_version pre-commit)
  python: $(get_version python)
  task: $(get_version task)
containers:
  podman: ${PODMAN_VERSION}
  docker: $(get_version docker || echo null)
creator-ee:
  ansible: ${EE_ANSIBLE_VERSION}
  ansible-lint: ${EE_ANSIBLE_LINT_VERSION}
EOF

# install npm packages
npm config set fund false
npm ci

echo "=== ${0##*/} -> out/log/manifest.yml and returned ${ERR} ==="
exit "${ERR}"
