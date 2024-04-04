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
# In our CalVar format, where the major segment represents the short year and
# the minor segment contains the month, saving only the number of seconds passed
# between last tag and the last commit in the patch segment could result in
# duplicate version numbers if there are multiple tagged commits occurring
# within the same month.
#
# We will create version numbers based on the following logic to address that
# possible version duplication issue:
#
# 1. If the number of seconds passed between last tag and the last commit in
#    the patch segment is equal to 0, use the version number stored in
#    package.json.
#
#    (Examples) 24.4.0, 24.12.1
#
# 2. Otherwise,
#    - For the major and minor segments, use the values taken from the version
#      number stored in package.json.
#    - For the patch segment, concatenate following two numbers as strings:
#        * The patch segment taken from the version number stored in package.json
#          incremented by 1, i.e., transforming 0 into 1, 9 into 10, etc.
#        * A zero-padded 8-digit number that represents the number of seconds
#          passed between last tag and the last commit
#
#    (Examples) 24.4.100123456, 24.12.200123456
#
set -Ee
LAST_TAG=$(git describe --tags --abbrev=0)
LAST_TAG_TIMESTAMP=$(git -P log -1 --format=%ct "${LAST_TAG}")
LAST_COMMIT_TIMESTAMP=$(git -P show --no-patch --format=%ct HEAD)
VERSION_SUFFIX="$((LAST_COMMIT_TIMESTAMP-LAST_TAG_TIMESTAMP))"
# We remove the last number from the node reported version.
VERSION_PREFIX=$(node -p "require('./package.json').version")
if [ $VERSION_SUFFIX -eq 0 ]
then
  echo -n "${VERSION_PREFIX}"
else
  echo -n "${VERSION_PREFIX%.*}.$(printf '%d%08d' $((${VERSION_PREFIX#*.*.} + 1)) ${VERSION_SUFFIX})"
fi
