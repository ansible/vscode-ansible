#!/bin/bash
# cSpell:ignore RPMS xorg cmdtest corepack xrandr nocolor userns pwsh
#
# This tool is used to setup the environment for running the tests. Its name
# name and location is based on Zuul CI, which can automatically run it.
# (cspell: disable-next-line)
set -euo pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"
PROJECT_ROOT="$(dirname "$DIR")"

# inside containers ARCH might not be set
ARCH=${ARCH:-$(uname -m)}
IMAGE_VERSION=$(./tools/get-image-version)
IMAGE=ghcr.io/ansible/community-ansible-dev-tools:${IMAGE_VERSION}
ERR=0
EE_ANSIBLE_VERSION=null
EE_ANSIBLE_LINT_VERSION=null

if command -v sudo >/dev/null 2>&1; then
    SUDO=sudo
else
    SUDO=""
fi

mkdir -p out/log

# Function to retrieve the version number for a specific command. If a second
# argument is passed, it will be used as return value when tool is missing.
get_version () {
    if command -v "${1:-}" >/dev/null 2>&1; then
        _cmd=("${@:1}")
        # if we did not pass any arguments, we add --version ourselves:
        if [[ $# -eq 1 ]]; then
            _cmd+=('--version')
        fi
        # prevents npm runtime warning if both NO_COLOR and FORCE_COLOR are present
        unset FORCE_COLOR
        # Keep the `tail -n +1` and the silencing of 141 error code because otherwise
        # the called tool might fail due to premature closure of /dev/stdout
        # made by `--head n1`. See https://superuser.com/a/642932/3004
        # NO_COLOR is needed by ansible-lint to allow sed to work correctly
        NO_COLOR=1 "${_cmd[@]}" | tail -n +1 | head -n1 | sed -r 's/^[^0-9]*([0-9][0-9\\w\\.]*).*$/\1/'
    else
        log error "Got $? while trying to retrieve ${1:-} version"
        return 99
    fi
}

# Retry a command with configurable attempts and delay
# Usage: retry <max_attempts> <delay_seconds> <command...>
# On failure, outputs the last attempt's stderr/stdout
retry() {
    local max_attempts=$1
    local delay=$2
    shift 2
    local attempt=1
    local output
    while true; do
        if output=$("$@" 2>&1); then
            return 0
        fi
        if [ "$attempt" -ge "$max_attempts" ]; then
            echo "$output" >&2
            return 1
        fi
        log warning "Command failed (attempt $attempt/$max_attempts), retrying in ${delay}s..."
        sleep "$delay"
        ((attempt++))
    done
}

if [[ -z "${HOSTNAME:-}" ]]; then
   export HOSTNAME=${HOSTNAME:-${HOST:-$(hostname)}}
   log warning "Defined HOSTNAME=${HOSTNAME} as we were not able to found a value already defined.."
fi

# if [[ -f /.dockerenv || ! -z "${container:-}" || "${SKIP_UI:-}" == "1" ]]; then
#     log notice "Running inside a container, skipping setup as we will assume container was build with tools inside."
#     exit 0
# fi

if [[ "${OSTYPE:-}" != darwin* && ! -f /.dockerenv && -z "${container:-}" && "${SKIP_UI:-}" != "1" ]]; then
    pgrep "dbus-(daemon|broker)" >/dev/null || {
        log error "dbus was not detecting as running and that would interfere with testing (xvfb)."
        if [[ "${READTHEDOCS:-}" != "True" ]]; then
            exit 55
        fi
    }
fi

if [[ "${OSTYPE:-}" == darwin* ]]; then
    # coreutils provides 'timeout' command
    HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 brew install -q libssh coreutils
fi

is_podman_running() {
    if [[ "$(podman machine ls --format '{{.Name}} {{.Running}}' --noheading 2>/dev/null)" == *"podman-machine-default* true"* ]]; then
        log notice "Podman machine is running."
        return 0
    else
        log error "Podman machine is not running."
        return 1
    fi
}

NODE_MODULES_BIN="$PROJECT_ROOT/node_modules/.bin"
if [ ! -d "$NODE_MODULES_BIN" ] ; then
    log error "$NODE_MODULES_BIN was not found in PATH, likely mise is not correctly installed as it should inject it automatically."
    exit 44
fi

# Detect RedHat/CentOS/Fedora:
if [[ -f "/etc/redhat-release" ]]; then
    RPMS=()
    command -v xvfb-run >/dev/null 2>&1 || RPMS+=(xorg-x11-server-Xvfb)
    if [[ ${#RPMS[@]} -ne 0 ]]; then
        $SUDO dnf install -y "${RPMS[@]}"
    fi
fi


# Fail-fast if run on Windows or under WSL1/2 on /mnt/c because it is so slow
# that we do not support it at all. WSL use is ok, but not on mounts.
WSL=0
if [[ "${OS:-}" == "windows" ]]; then
    log error "You cannot use Windows build tools for development, try WSL."
    exit 1
fi
if grep -qi microsoft /proc/version >/dev/null 2>&1; then
    # resolve pwd symlinks and ensure than we do not run under /mnt (mount)
    if [[ "$(pwd -P || true)" == /mnt/* ]]; then
        log warning "Under WSL, you must avoid running from mounts (/mnt/*) due to critical performance issues."
    fi
    WSL=1
fi

# determine os_version as lowercase string
if [[ "${OSTYPE:-}" == darwin* ]]; then
    OS_VERSION="macos-$(sw_vers --productVersion)"
else
   if command -v lsb_release >/dev/null 2>&1; then
        OS_VERSION="$(lsb_release --id --short 2> /dev/null)-$(lsb_release --release --short 2> /dev/null)"
        OS_VERSION="${OS_VERSION,,}"
        if [[ "$WSL" -eq 1 ]]; then
            # is wsl is configured with interop disabled, calling cmd.exe can fail ugly and without output on GHA
            OS_VERSION=$(cmd.exe /c ver 2>/dev/null | awk '/Version/ {match($0, /\[Version ([0-9.]+)\]/, a); print a[1]}' || echo 'unknown')
        fi
    else # when inside a container this would be needed
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_VERSION="${ID}-${VERSION_ID}"
    fi
fi
log notice "Platform: $OS_VERSION"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "ARCH=$ARCH" >> "$GITHUB_OUTPUT"
    echo "OS_VERSION=$OS_VERSION" >> "$GITHUB_OUTPUT"
fi

if command -v pipx >/dev/null 2>&1; then
    pipx list 2> /dev/null
    for pkg in ansible-core ansible-creator ansible-dev-tools ansible-lint ansible-navigator molecule; do
        if pipx list 2> /dev/null | grep -q "$pkg"; then
            pipx uninstall -q "$pkg"
        fi
    done
    pipx list 2> /dev/null
fi

if [[ -f "/usr/bin/apt-get" ]]; then
    INSTALL=0
    DEBS=(curl file git gcc libonig-dev)
    for DEB in "${DEBS[@]}"; do
        [[ "$(dpkg-query --show --showformat='${db:Status-Status}\n' \
            "${DEB}" || true)" != 'installed' ]] && INSTALL=1
    done
    if [[ "${INSTALL}" -eq 1 ]]; then
        # mandatory or other apt-get commands fail
        timed $SUDO apt-get update -qq -o=Dpkg::Use-Pty=0
        # avoid outdated ansible and pipx
        timed $SUDO apt-get remove -qq -y ansible pipx || true
        # install all required packages
        timed $SUDO apt-get -qq install -y \
            --no-install-recommends \
            --no-install-suggests \
            -o=Dpkg::Use-Pty=0 "${DEBS[@]}"
    fi
    # Remove undesirable packages, like cmdtest which provides another "yarn"
    DEBS=(cmdtest)
    for DEB in "${DEBS[@]}"; do
        [[ "$(dpkg-query --show --showformat='${db:Status-Status}\n' \
            "${DEB}" 2>/dev/null || true)" == 'installed' ]] && \
            $SUDO apt-get -qq remove -y "$DEB"
    done
fi

# Ensure that git is configured properly to allow unattended commits, something
# that is needed by some tasks, like devel or deps.
git config user.email >/dev/null 2>&1 || GIT_NOT_CONFIGURED=1
git config user.name  >/dev/null 2>&1 || GIT_NOT_CONFIGURED=1
if [[ "${GIT_NOT_CONFIGURED:-}" == "1" ]]; then
    echo CI="${CI:-}"
    if [ -z "${CI:-}" ]; then
        log error "git config user.email or user.name are not configured."
        exit 40
    else
        git config --global user.email ansible-devtools@redhat.com
        git config --global user.name "Ansible DevTools"
    fi
fi

# macos specific
if [[ "${OS:-}" == "darwin" && "${SKIP_PODMAN:-}" != '1' ]]; then
    command -v podman >/dev/null 2>&1 || {
        HOMEBREW_NO_ENV_HINTS=1 time brew install podman
        podman machine ls --noheading | grep '\*' || time podman machine init
        podman machine ls --noheading | grep "Currently running" || {
            # do not use full path as it varies based on architecture
            # https://github.com/containers/podman/issues/10824#issuecomment-1162392833
            "qemu-system-${MACHTYPE}" -machine q35,accel=hvf:tcg -cpu host -display none INVALID_OPTION || true
            time podman machine start
            }
        podman info
        podman run --rm hello-world
    }
fi

# User specific environment
if ! [[ "${PATH}" == *"${HOME}/.local/bin"* ]] && [[ "${SKIP_UI:-}" != "1" ]]; then
    # shellcheck disable=SC2088
    log warning "~/.local/bin was not found in PATH, attempting to add it."
    PATH="${HOME}/.local/bin:${PATH}"
    export PATH

    # shellcheck disable=SC2088
    if [[ -n "${GITHUB_ENV:-}" ]]; then
        log notice "Altered GITHUB_ENV to extend PATH."
        echo "{PATH}={$PATH}" >> "$GITHUB_ENV"
    else
        log error "Reconfigure your shell (${SHELL}) to include ~/.local/bin in your PATH, we need it."
        exit 102
    fi
fi

# fail-fast if we detect incompatible filesystem (o-w)
# https://github.com/ansible/ansible/pull/42070
python3 -c "import os, stat, sys; sys.exit(os.stat('.').st_mode & stat.S_IWOTH)" || {
    log error "Cannot run from world-writable filesystem, try moving code to a secured location and read https://docs.ansible.com/projects/team-devtools/guides/ansible/permissions/"
    exit 100
}

# on WSL we want to avoid using Windows's npm (broken)
if [[ "$(command -v npm || true)" == '/mnt/c/Program Files/nodejs/npm' ]]; then
    log error "npm is installed on Windows, we do not support this setup."
    exit 101
fi

if [[ -f yarn.lock ]]; then
    # Check if npm has permissions to install packages (system installed does not)
    # Share https://stackoverflow.com/a/59227497/99834
    test -w "$(npm config get prefix)" || {
        log warning "Your npm is not allowed to write to $(npm config get prefix), we will reconfigure its prefix"
        npm config set prefix "${HOME}/.local/"
    }
fi

# Detect docker and ensure that it is usable (unless SKIP_DOCKER)
DOCKER_VERSION=null
if [[ "${SKIP_DOCKER:-}" != '1' ]]; then
    log notice "Docker checks..."
    if [[ -n ${DOCKER_HOST+x} ]]; then
        log error "DOCKER_HOST is set, we do not support this setup."
        exit 1
    fi

    DOCKER_VERSION="$(get_version docker 2>/dev/null || echo 'null')"
    DOCKER_STDERR="$(docker --version 2>&1 >/dev/null)"
    if [[ "${DOCKER_STDERR}" == *"Emulate Docker CLI using podman"* ]]; then
        log error "podman-docker shim is present and we do not support it. Please remove it."
        exit 1
    fi

    if [ -n "${DOCKER_HOST:-}" ]; then
        log error "Found DOCKER_HOST and this is not supported, please unset it."
        exit 1
    fi
    docker container prune -f >/dev/null 2>&1
    log notice "Pull our test container image with docker."
    retry 3 60 docker pull "${IMAGE}" || {
        log error "Failed to pull image after 3 attempts, maybe current user is not in docker group? Run 'sudo sh -c \"groupadd -f docker && usermod -aG docker $USER\"' and relogin to fix it."
        exit 1
    }
    # without running we will never be sure it works (no arm64 image yet)
    EE_ANSIBLE_VERSION=$(get_version \
        docker run --rm "${IMAGE}" ansible --version)
    EE_ANSIBLE_LINT_VERSION=$(get_version \
        docker run "${IMAGE}" ansible-lint --nocolor --version)
    log notice "ansible: ${EE_ANSIBLE_VERSION}, ansible-lint: ${EE_ANSIBLE_LINT_VERSION}"
    # Test docker ability to mount current folder with write access, default mount options
    docker run -v "$PWD:$PWD" ghcr.io/ansible/community-ansible-dev-tools:latest \
        bash -c "[ -e $PWD ] && [ -d $PWD ] \
        && echo 'Mounts working' || { echo 'Mounts not working. You might need to either disable or make selinux permissive.'; exit 1; }"
fi

if [[ "${SKIP_PODMAN:-}" != '1' ]]; then
    log notice "Podman checks..."
    # macos specific
    if [[ "${OSTYPE:-}" == darwin* && "${SKIP_PODMAN:-}" != '1' ]]; then
        command -v podman >/dev/null 2>&1 || {
            log notice "Installing podman..."
            HOMEBREW_NO_ENV_HINTS=1 timed brew install podman
        }
        log notice "Configuring podman machine ($MACHTYPE)..."
        podman machine ls --noheading | grep '\*' >/dev/null || {
            log warning "Podman machine not found, creating and starting one ($MACHTYPE)..."
            timed podman machine init --now || log warning "Ignored init failure due to possible https://github.com/containers/podman/issues/13609 but we will check again later."
        }
        podman machine ls --noheading
        log notice "Checking status of podman machine ($MACHTYPE)..."
        is_podman_running || {
            log warning "Podman machine not running, trying to start it..."
            # do not use full path as it varies based on architecture
            # https://github.com/containers/podman/issues/10824#issuecomment-1162392833
            # MACHTYPE can look like x86_64 or x86_64-apple-darwin20.6.0
            if [[ $MACHTYPE == x86_64* ]] ; then
                log notice "Running on x86_64 architecture"
            else
                qemu-system-aarch64 -machine q35,accel=hvf:tcg -cpu host -display none INVALID_OPTION || true
            fi
            podman machine start
            # Waiting for machine to become available
            n=0
            until [ "$n" -ge 9 ]; do
                log warning "Still waiting for podman machine to become available $((n * 15))s ..."
                is_podman_running && break
                n=$((n+1))
                sleep 15
            done
            is_podman_running
            }
        # validation is done later
        podman info >out/podman.log 2>&1
        podman run hello-world >out/podman.log 2>&1
        du -ahc ~/.config/containers ~/.local/share/containers  >out/podman.log 2>&1 || true
        podman machine inspect >out/podman.log 2>&1
    fi
fi

# Detect podman and ensure that it is usable (unless SKIP_PODMAN)
PODMAN_VERSION=null
if [[ "${SKIP_PODMAN:-}" != '1' ]]; then
    PODMAN_VERSION="$(get_version podman 2>/dev/null || echo null)"
    podman container prune -f
    log notice "Pull our test container image with podman."
    retry 3 60 podman pull --quiet "${IMAGE}" || {
        log error "Failed to pull image after 3 attempts."
        exit 1
    }
    # without running we will never be sure it works
    log notice "Retrieving ansible version from ee"
    EE_ANSIBLE_VERSION=$(get_version \
        podman run --rm "${IMAGE}" ansible --version)
    log notice "Retrieving ansible-lint version from ee"
    EE_ANSIBLE_LINT_VERSION=$(get_version \
        podman run --rm "${IMAGE}" ansible-lint --nocolor --version)
    log notice "ansible: ${EE_ANSIBLE_VERSION}, ansible-lint: ${EE_ANSIBLE_LINT_VERSION}"
    log notice "Test podman ability to mount current folder with write access, default mount options"
    podman run -v "$PWD:$PWD" ghcr.io/ansible/community-ansible-dev-tools:latest \
        bash -c "[ -e $PWD ] && [ -d $PWD ] && echo 'Mounts working' || { echo 'Mounts not working. You might need to either disable or make selinux permissive.'; exit 1; }"
fi

log notice "Checking node tools availability..."
command -v tsc >/dev/null 2>&1 || {
    log error "tsc not found, please install it."
    exit 1
}
command -v vsce >/dev/null 2>&1 || {
    log error "vsce not found, please install it."
    exit 1
}
command -v ovsx >/dev/null 2>&1 || {
    log error "ovsx not found, please install it."
    exit 1
}

# Create a build manifest so we can compare between builds and machines, this
# also has the role of ensuring that the required executables are present.
#
tee "out/log/manifest-${HOSTNAME}.yml" <<EOF
system:
  uname: $(uname)
env:
  ARCH: ${ARCH:-null}  # taskfile
  OS: ${OS:-null}    # taskfile
  OSTYPE: ${OSTYPE}
tools:
  ansible-lint: $(get_version ansible-lint)
  ansible: $(get_version ansible)
  bash: $(get_version bash)
  gh: $(get_version gh || echo null)
  git: $(get_version git)
  node: $(get_version node)
  npm: $(get_version npm)
  pre-commit: $(get_version pre-commit)
  python: $(get_version python3)
  task: $(get_version task)
  yarn: $(npx --yes yarn --version || echo null)
containers:
  podman: ${PODMAN_VERSION}
  docker: ${DOCKER_VERSION}
community-ansible-dev-tools:
  ansible: ${EE_ANSIBLE_VERSION}
  ansible-lint: ${EE_ANSIBLE_LINT_VERSION}
EOF

[[ $ERR -eq 0 ]] && level=notice || level=error
log "${level}" "${0##*/} -> out/log/manifest-$HOSTNAME.yml and returned ${ERR}"
exit "${ERR}"
