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
#
# In order to allow more than one official releases in one month, we will add
#     100,000,000 * (patch segment in the version string in package.json)
# to the number of second passed between last tag and last commit. This logic
# will generate marketplace version numbers from the version string in
# package.json as shown in the following examples:
#
# Version in package.json  Official/Pre-release  Marketplace version number
# -------------------------------------------------------------------------
# 24.6.0                   Official release      24.6.0
# 24.6.0                   Pre-release           24.6.nnnnnnnn
# 24.6.1                   Official release      24.6.100000000
# 24.6.1                   Pre-release           24.6.1nnnnnnnn
# 24.6.2                   Official release      24.6.200000000
# 24.6.2                   Pre-release           24.6.2nnnnnnnn
#
# where nnnnnnnn represents a number of seconds passed from the last official
# release
#
set -Ee
LAST_TAG=$(git describe --tags --abbrev=0)
LAST_TAG_TIMESTAMP=$(git -P log -1 --format=%ct "${LAST_TAG}")
LAST_COMMIT_TIMESTAMP=$(git -P show --no-patch --format=%ct HEAD)
VERSION_SUFFIX="$((LAST_COMMIT_TIMESTAMP-LAST_TAG_TIMESTAMP))"
# We remove the last number from the node reported version.
VERSION_IN_PACKAGE_JSON=$(node -p "require('./package.json').version")
VERSION_PREFIX="${VERSION_IN_PACKAGE_JSON%.*}"
PATCH_VERSION="${VERSION_IN_PACKAGE_JSON#*.*.}"
if [ "${PATCH_VERSION}" -ne 0 ]; then
  VERSION_SUFFIX=$(printf '%d%08d' "${PATCH_VERSION}" "${VERSION_SUFFIX}")
fi
echo -n "${VERSION_PREFIX}.${VERSION_SUFFIX}"
