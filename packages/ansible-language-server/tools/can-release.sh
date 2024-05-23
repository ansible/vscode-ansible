#!/bin/bash
set -euo pipefail

SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" > /dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR=$( cd -P "$( dirname "$SOURCE" )" > /dev/null 2>&1 && pwd )

# installs the package inside an isolated project and executes its entry point
# in order to check if we packaged everything needed.
pushd "${DIR}/../out/test-als"
git checkout HEAD -- package.json
npm add ../../@ansible-ansible-language-server-*.tgz
npm install
git checkout HEAD -- package.json
npx ts-node ../../test/validate-ls.ts
popd


VERSION=$(jq -r '.version' "${DIR}/../package.json")
# VIEW=$(npm view "@ansible/ansible-language-server@${VERSION}")

if npm view "@ansible/ansible-language-server@${VERSION}" > /dev/null 2>&1; then
    echo "::warning::$VERSION was already published, you cannot publish without updating the version number in 'package.json' file."
else
    if grep -q "## v${VERSION}" "$DIR/../changelog.md"; then
        echo "Changelog entry found."
    else
        echo "::error::Version ${VERSION} was not published but is missing from the changelog, so we should not release."
        exit 3
    fi
    npm publish --dry-run --access public @ansible-ansible-language-server-*.tgz
    echo "Version ${VERSION} can be published."
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        echo "Setting can_release_to_npm=true"
        echo "can_release_to_npm=true" >> "${GITHUB_OUTPUT}"
    fi
fi
