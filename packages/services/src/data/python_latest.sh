#!/bin/bash
# Vendored from ansible-navigator (https://github.com/ansible/ansible-navigator)
# Original: src/ansible_navigator/data/python_latest.sh
#
# Copyright Red Hat
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Finds the highest-version python on PATH inside a container and
# executes the given script with it.

# Find the latest Python version installed
find_latest_python() {
    # Get all python executables in the PATH and sort them
    PYTHON_EXECUTABLE=$(compgen -c python | grep -E '^python[0-9]+(\.[0-9]+)?$' | sort -V | tail -n 1)

    # Check if any Python executable was found
    if [[ -z "$PYTHON_EXECUTABLE" ]]; then
        echo "No Python executable found on the system."
        return 1
    fi

    return 0
}

# Use the latest Python executable
run_with_latest_python() {
    find_latest_python
    if [[ $? -ne 0 ]]; then
        exit 1
    fi

    # Run a Python script or use the Python shell
    "$PYTHON_EXECUTABLE" "$@"
}

# Pass arguments to the script
run_with_latest_python "$@"
