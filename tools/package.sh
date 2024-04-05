#!/bin/bash
# (cspell: disable-next-line)
set -Eeuo pipefail
# ^ capital E needed as we want to fail for subshells too.
rm -f ./*.vsix
yarn run webpack
VERSION="$(./tools/get-marketplace-version.sh)"
vsce_package_args=(--no-dependencies --no-git-tag-version --no-update-package-json)
if [[ "$VERSION" != *.0 ]]; then
    vsce_package_args+=("--pre-release")
fi

# --no-dependencies and --no-yarn needed due to https://github.com/microsoft/vscode-vsce/issues/439
yarn run vsce package "${vsce_package_args[@]}" "${VERSION}"

# Using zipinfo instead of `npx vsce ls` due to https://github.com/microsoft/vscode-vsce/issues/517
zipinfo -1 ./*.vsix > out/log/package.log
tools/dirty.sh
echo "Generated ansible-${VERSION}"
