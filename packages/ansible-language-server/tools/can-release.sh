#!/bin/bash
set -euo pipefail

SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  PROJECT_ROOT=$( cd -P "$( dirname "$SOURCE" )" > /dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$PROJECT_ROOT/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
PACKAGE_ROOT=$( cd -P "$( dirname "$SOURCE" )/.." > /dev/null 2>&1 && pwd )
PROJECT_ROOT=$( cd -P "$( dirname "$SOURCE" )/../../.." > /dev/null 2>&1 && pwd )

# installs the package inside an isolated project and executes its entry point
# in order to check if we packaged everything needed.
mkdir -p "${PROJECT_ROOT}/out/test-als"
pushd "${PROJECT_ROOT}/out/test-als"
git init
cat <<EOF > package.json
{
  "name": "test-als",
  "version": "0.0.1",
  "description": "Test als package",
  "main": "index.js",
  "repository": {
    "type": "git",
    "url": "the repositories url"
  },
  "author": "your name",
  "license": "N/A"
}
EOF
npm add "${PROJECT_ROOT}"/out/@ansible-ansible-language-server-*.tgz
npm install
ts-node "${PACKAGE_ROOT}/test/validate-ls.ts"
popd


VERSION=$(jq -r '.version' "${PACKAGE_ROOT}/package.json")
# VIEW=$(npm view "@ansible/ansible-language-server@${VERSION}")

if npm view "@ansible/ansible-language-server@${VERSION}" > /dev/null 2>&1; then
    echo "::error::ansible-language-server@${VERSION} was already published, you cannot publish without updating the version number in 'package.json' file. Run 'yarn workspace @ansible/ansible-language-server version <version>' and make a pull request to bump it first."
    exit 2
else
    if grep -q "## v${VERSION}" "$PACKAGE_ROOT/changelog.md"; then
        echo "Changelog entry found."
    else
        echo "::warning::Version ${VERSION} was not published but is missing from the changelog, so we should not release."
    fi
    npm publish --dry-run --access public "${PROJECT_ROOT}/out/"@ansible-ansible-language-server-*.tgz
    echo "Version ${VERSION} can be published."
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        echo "Setting can_release_to_npm=true"
        echo "can_release_to_npm=true" >> "${GITHUB_OUTPUT}"
    fi
fi
