#!/usr/bin/env bash
set -euo pipefail

DIR="$(dirname "$(realpath "$0")")"
# shellcheck source=/dev/null
. "$DIR/_utils.sh"

# `task` is started from a mise shim. Shims do not prepend the project venv
# the way `mise exec` does, so tools installed by `uv sync` are missing.
if [[ -n "${VIRTUAL_ENV:-}" && -d "${VIRTUAL_ENV}/bin" ]]; then
    case ":${PATH}:" in
        *":${VIRTUAL_ENV}/bin:"*) ;;
        *)
            PATH="${VIRTUAL_ENV}/bin:${PATH}"
            export PATH
            ;;
    esac
fi

creator_resources_path="$(uv run python -c "from pathlib import Path; import ansible_creator; print(Path(ansible_creator.__file__).parent)")/resources"
mkdir -p resources/contentCreator/createDevcontainer
mkdir -p resources/contentCreator/createDevfile
ln -fs "$creator_resources_path/common/devfile/devfile.yaml.j2" "resources/contentCreator/createDevfile/devfile-template.txt"
ln -sfn "$creator_resources_path/common/devcontainer/.devcontainer" "resources/contentCreator/createDevcontainer/.devcontainer"

log notice "Using $(python3 --version) from $(uv run which python3)"
actual_python3="$(which python3)"
if [[ "$actual_python3" != "${VIRTUAL_ENV}/bin/python3" ]]; then
    # When mise manages Python, `which python3` resolves to a mise shim
    # instead of the venv binary. That is expected — the venv created by
    # mise (with --system-site-packages --seed) is still correct.
    # Recreating it with `uv venv --clear` would drop those flags and
    # destroy all packages installed by `uv sync` in the parent task.
    if [[ "$actual_python3" == */mise/shims/* ]]; then
        log notice "python3 resolves to mise shim ($actual_python3), venv is managed by mise — skipping recreation."
    else
        log warning "Virtualenv broken $actual_python3 != ${VIRTUAL_ENV}/bin/python3, trying to recreate it ..."
        uv venv --clear "${VIRTUAL_ENV}"
        # shellcheck disable=SC1091
        . "${VIRTUAL_ENV}/bin/activate"
        uv sync --no-progress -q --active
        if [[ "$(which python3)" != ${VIRTUAL_ENV}/bin/python3 ]]; then
            log error "Virtualenv still broken."
            exit 99
        fi
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
    # Use { cmd || true; } to prevent set -euo pipefail from exiting when
    # which -a returns non-zero (executable not found).
    ansible_count="$({ which -a ansible 2>/dev/null || true; } | wc -l | tr -d ' ')"
    if [[ "$ansible_count" -gt 1 ]]; then
        log warning "Found ${ansible_count} ansible installations on CI, removing pre-installed copy ..."
        pipx uninstall --verbose ansible || true
        ansible_count="$({ which -a ansible 2>/dev/null || true; } | wc -l | tr -d ' ')"
        if [[ "$ansible_count" -gt 1 ]]; then
            log error "Please ensure there is no preinstalled copy of ansible on CI.\n$(which -a ansible)"
            exit 66
        fi
    fi
    lint_count="$({ which -a ansible-lint 2>/dev/null || true; } | wc -l | tr -d ' ')"
    if [[ "$lint_count" -gt 1 ]]; then
        log warning "Found ${lint_count} ansible-lint installations on CI, removing pre-installed copy ..."
        pipx uninstall --verbose ansible-lint || true
        lint_count="$({ which -a ansible-lint 2>/dev/null || true; } | wc -l | tr -d ' ')"
        if [[ "$lint_count" -gt 1 ]]; then
            log error "Please ensure there is no preinstalled copy of ansible-lint on CI.\n$(which -a ansible-lint)"
            exit 67
        fi
    fi
    if [[ -d "${HOME}/.ansible" ]]; then
        log warning "Removing unexpected ~/.ansible folder found on CI to avoid test contamination."
        rm -rf "${HOME}/.ansible"
    fi
fi

# Fail if detected tool paths are not from inside our own virtualenv
for CMD_NAME in ansible ansible-lint ansible-navigator; do
    CMD_PATH=$(command -v "$CMD_NAME" 2>/dev/null || true)
    if [[ -z "$CMD_PATH" ]]; then
        log error "${CMD_NAME} executable not found in PATH"
        exit 68
    fi
    [[ "${CMD_PATH}" == "$VIRTUAL_ENV"* ]] || {
        log error "${CMD_PATH} executable is not from our own virtualenv ($VIRTUAL_ENV)"
        exit 68
    }
done
unset CMD_NAME CMD_PATH
