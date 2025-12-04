#!/usr/bin/env bash
set -euxo pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"

creator_resources_path="$(uv run python -c "from pathlib import Path; import ansible_creator; print(Path(ansible_creator.__file__).parent)")/resources"
mkdir -p resources/contentCreator/createDevcontainer
mkdir -p resources/contentCreator/createDevfile
ln -fs "$creator_resources_path/common/devfile/devfile.yaml.j2" "resources/contentCreator/createDevfile/devfile-template.txt"
ln -fs "$creator_resources_path/common/devcontainer/.devcontainer" "resources/contentCreator/createDevcontainer/"

log notice "Using $(python3 --version) from $(uv run which python3)"
printenv VIRTUAL_ENV
printenv PATH
if [[ "$(which python3)" != ${VIRTUAL_ENV}/bin/python3 ]]; then
    log warning "Virtualenv broken $(which python3) != ${VIRTUAL_ENV}/bin/python3, trying to recreate it ..."
    uv venv --clear "${VIRTUAL_ENV}"
    # shellcheck disable=SC1091
    . "${VIRTUAL_ENV}/bin/activate"
    if [[ "$(which python3)" != ${VIRTUAL_ENV}/bin/python3 ]]; then
        log error "Virtualenv still broken."
        exit 99
    fi
fi
# Fail fast if user has broken dependencies
uv pip check || {
        log error "pip check failed with exit code $?"
        if [[ $MACHTYPE == x86_64* && "${OSTYPE:-}" != darwin* ]] ; then
            exit 98
        else
            log error "Ignored pip check failure on this platform due to https://sourceforge.net/p/ruamel-yaml/tickets/521/"
        fi
}

# GHA failsafe only: ensure ansible and ansible-lint cannot be found anywhere
# other than our own virtualenv. (test isolation)
if [[ -n "${CI:-}" ]]; then
    command -v ansible >/dev/null 2>&1 || {
        log warning "Attempting to remove pre-installed ansible on CI ..."
        pipx uninstall --verbose ansible || true
        if [[ "$(which -a ansible | wc -l | tr -d ' ')" != "1" ]]; then
            log error "Please ensure there is no preinstalled copy of ansible on CI.\n$(which -a ansible)"
            exit 66
        fi
    }
    command -v ansible-lint >/dev/null 2>&1 || {
        log warning "Attempting to remove pre-installed ansible-lint on CI ..."
        pipx uninstall --verbose ansible-lint || true
        if [[ "$(which -a ansible-lint | wc -l | tr -d ' ')" != "1" ]]; then
            log error "Please ensure there is no preinstalled copy of ansible-lint on CI.\n$(which -a ansible-lint)"
            exit 67
        fi
    }
    if [[ -d "${HOME}/.ansible" ]]; then
        log warning "Removing unexpected ~/.ansible folder found on CI to avoid test contamination."
        rm -rf "${HOME}/.ansible"
    fi
fi

# Fail if detected tool paths are not from inside out out/ folder
for CMD in ansible ansible-lint ansible-navigator; do
    CMD=$(command -v $CMD 2>/dev/null)
    [[ "${CMD}" == "$VIRTUAL_ENV"* ]] || {
        log error "${CMD} executable is not from our own virtualenv ($VIRTUAL_ENV)"
        exit 68
    }
done
unset CMD
