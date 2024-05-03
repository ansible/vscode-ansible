#!/bin/bash
# (cspell: disable-next-line)
set -Eeuo pipefail

for FILE in ./*.vsix; do
    VERSION=$(unzip -p "${FILE}" extension/package.json | jq -r .version)
    publish_args=()
    if [[ "$VERSION" != *.0 ]]; then
        publish_args+=("--pre-release")
    fi
    echo "Publishing ${VERSION}" "${publish_args[@]}"
    yarn run vsce publish "${publish_args[@]}" --skip-duplicate --packagePath "${FILE}" --readme-path docs/README.md
    yarn run ovsx publish "${publish_args[@]}" --skip-duplicate "${FILE}"
done
