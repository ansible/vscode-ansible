#!/bin/bash
# Retries a vscode marketplace compatible version number to be used by
# vsce package && vsce publish. These require numeric only, X.Y.Z with ranges
# between 0-2147483647. Package allows other version numbers but publish does
# not.
#
# We used the build number in the past, but that would not allow use retrigger
# a build and might cause problems when switching from a CI to another. Thus,
# we opted for number of seconds passed between last tag and last commit. This
# should generate 0 for tagged commits and other numbers for pull requests.
set -Ee
#LAST_TAG=$(git describe --tags --abbrev=0)
#LAST_TAG_TIMESTAMP=$(git -P log -1 --format=%ct "${LAST_TAG}")
#LAST_COMMIT_TIMESTAMP=$(git -P show --no-patch --format=%ct HEAD)
#VERSION_SUFFIX="$((LAST_COMMIT_TIMESTAMP-LAST_TAG_TIMESTAMP))"
# We remove the last number from the node reported version.
VERSION_PREFIX=$(node -p "require('./package.json').version")
VERSION_SUFFIX=2
echo -n "${VERSION_PREFIX%.*}.${VERSION_SUFFIX}"
