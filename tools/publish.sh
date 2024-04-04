#!/bin/bash
# (cspell: disable-next-line)
set -Eeuo pipefail

VERSION="$(./tools/get-marketplace-version.sh)"
publish_args=()
if [[ "$VERSION" != *.0 ]]; then
    publish_args+=("--pre-release")
fi
yarn run vsce publish "${publish_args[@]}" --skip-duplicate --packagePath ./*.vsix
yarn run ovsx publish "${publish_args[@]}" --skip-duplicate ./*.vsix
