#!/bin/bash

# Pull devcontainer template from ansible-creator
CREATOR_REPO="https://github.com/ansible/ansible-creator.git"
CREATOR_DEVCONTAINER_TEMPLATE="src/ansible_creator/resources/common/devcontainer/.devcontainer"
EXTENSION_DEVCONTAINER_TEMPLATE="resources/contentCreator/createDevcontainer/.devcontainer"

# Clone ansible-creator repo
TEMP_DIR=$(mktemp -d)
git clone --depth 1 --branch main "$CREATOR_REPO" "$TEMP_DIR"

# Compare the contents of the files in the directories
DIFF_OUTPUT=$(diff -r -q "$TEMP_DIR/$CREATOR_DEVCONTAINER_TEMPLATE" "$EXTENSION_DEVCONTAINER_TEMPLATE" | grep -v "^Only in")

if [ -z "$DIFF_OUTPUT" ]; then
    echo "Devcontainer content matches ansible-creator devcontainer content."
    rm -rf "$TEMP_DIR"
    exit 0
else
    echo "Devcontainer content under resources/ does not match the content ansible-creator is using."
    echo "Differences:"
    diff -r "$TEMP_DIR/$CREATOR_DEVCONTAINER_TEMPLATE" "$EXTENSION_DEVCONTAINER_TEMPLATE" | grep -v "^Only in"
    rm -rf "$TEMP_DIR"
    exit 1
fi
