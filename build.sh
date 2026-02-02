#!/bin/bash


# Ensure ~/.local/bin is in PATH (for uv)
export PATH="$HOME/.local/bin:$PWD/node_modules/.bin:$PATH"

if ! command -v uv &> /dev/null; then
    echo "uv not found, installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    
    # Add to shell rc files if not already present
    for rc_file in "$HOME/.bashrc" "$HOME/.zshrc"; do
        if [ -f "$rc_file" ]; then
            if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$rc_file"; then
                echo "" >> "$rc_file"
                echo "# Add uv and other local tools to PATH" >> "$rc_file"
                echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc_file"
                echo "Added ~/.local/bin to PATH in $rc_file"
            fi
        fi
    done
fi

if ! command -v uv &> /dev/null; then
    echo "ERROR: uv installation failed or not in PATH"
    exit 1
fi


# Export VIRTUAL_ENV so uv.sh can access it (use project's .venv)
export VIRTUAL_ENV="${PWD}/.venv"
# Add venv bin to PATH and remove pyenv shims to avoid conflicts
export PATH="${VIRTUAL_ENV}/bin:$(echo "$PATH" | tr ':' '\n' | grep -v '\.pyenv' | tr '\n' ':' | sed 's/:$//')"

SKIP_DOCKER=1 SKIP_PODMAN=1 task build "$@"

