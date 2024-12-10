#!/bin/bash

# Pull devfile template from ansible-creator
CREATOR_REPO="https://github.com/ansible/ansible-creator.git"
CREATOR_DEVFILE_TEMPLATE="src/ansible_creator/resources/common/devcontainer/.devcontainer/devcontainer.json.j2"
EXTENSION_DEVFILE_TEMPLATE="resources/contentCreator/createDevfile/devfile-template.txt"

# Clone ansible-creator repo

TEMP_DIR=$(mktemp -d)
git clone --depth 1 --branch main "$CREATOR_REPO" "$TEMP_DIR"

# Compare the files
if diff "$TEMP_DIR/$CREATOR_DEVFILE_TEMPLATE" "$EXTENSION_DEVFILE_TEMPLATE" > /dev/null; then
    echo "Devfile template matches ansible-creator devfile template."
    rm -rf "$TEMP_DIR"
    exit 0
else
    echo "Devfile template under resources/ does not match the template ansible-creator is using."
    rm -rf "$TEMP_DIR"
    exit 1
fi
