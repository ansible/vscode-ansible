#!/bin/bash

# Pull devcontainer template from ansible-creator
CREATOR_REPO="https://github.com/ansible/ansible-creator.git"
CREATOR_DEVCONTAINER_TEMPLATE="src/ansible_creator/resources/common/devcontainer/.devcontainer/devcontainer.json.j2"
EXTENSION_DEVCONTAINER_TEMPLATE="resources/contentCreator/createDevcontainer/devcontainer-template.txt"

# Clone ansible-creator repo

TEMP_DIR=$(mktemp -d)
git clone --depth 1 --branch main "$CREATOR_REPO" "$TEMP_DIR"

# Compare the files
if diff "$TEMP_DIR/$CREATOR_DEVCONTAINER_TEMPLATE" "$EXTENSION_DEVCONTAINER_TEMPLATE" > /dev/null; then
    echo "Devcontainer template matches ansible-creator devcontainer template."
    rm -rf "$TEMP_DIR"
    exit 0
else
    echo "Devcontainer template under resources/ does not match the template ansible-creator is using."
    rm -rf "$TEMP_DIR"
    exit 1
fi
