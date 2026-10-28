#!/usr/bin/env bash
# cSpell:ignore precheck
set -euo pipefail


function check_for_duplicate_executables() {
    local EXECUTABLES=(
        "ade"
        "adt"
        "ansible"
        "ansible-creator"
        "ansible-lint"
        "ansible-navigator"
        "molecule"
    )
    ERR=0
    for cmd in "${EXECUTABLES[@]}"; do
        local found_files=()
        if ! command -v "$cmd" >/dev/null 2>&1; then
            echo "ERROR: $cmd not found in PATH" >&2
            ERR=1
        else
            path_remaining="$PATH"
            while [ -n "$path_remaining" ]; do
                if [[ "$path_remaining" == *:* ]]; then
                    dir="${path_remaining%%:*}"
                    path_remaining="${path_remaining#*:}"
                else
                    dir="$path_remaining"
                    path_remaining=""
                fi
                [ -d "$dir" ] || continue
                file="$dir/$cmd"
                if [ -f "$file" ] && [ -x "$file" ]; then
                    # Check if file is already in found_files to avoid duplicates
                    is_duplicate=0
                    if [ ${#found_files[@]} -gt 0 ]; then
                        for existing_file in "${found_files[@]}"; do
                            if [ "$existing_file" = "$file" ]; then
                                is_duplicate=1
                                break
                            fi
                        done
                    fi
                    if [ $is_duplicate -eq 0 ]; then
                        found_files+=("$file")
                    fi
                fi
            done
            count=${#found_files[@]}
            if [[ $count -ne 1 ]]; then
                echo "ERROR: Multiple instances of '$cmd' found in PATH, we cannot proceed as it might produce unexpected outcomes: ${found_files[*]}" >&2
                ERR=1
            fi
        fi
    done
    return $ERR
}

check_for_duplicate_executables
