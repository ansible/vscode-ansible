#!/bin/bash
set -eo pipefail

# Fail if repo is dirty
if [[ -n $(git status -s) ]]; then
  echo 'ERROR: Release script requires a clean git repo.'
  exit 1
fi

RELEASE_NAME=$(gh api 'repos/{owner}/{repo}/releases' --jq '.[0].name')
echo -e "\n## ${RELEASE_NAME}\n" > out/next.md
gh api "repos/{owner}/{repo}/releases" --jq '.[0].body' | \
    sed -e's/[[:space:]]*$//' \
    >> out/next.md

# Remove last newline to avoid double newlines on injection
truncate -s -1 out/next.md

# inject the temp nodes into the docs/changelog.md
if [[ "${OSTYPE}" == "darwin"* ]]; then
    SED_OPTION='-i \x27\x27'
else
    SED_OPTION='-i'
fi
sed "${SED_OPTION}" -e '/<!-- KEEP-THIS-COMMENT -->/r out/next.md' docs/changelog.md

# use prettier to reformat the changelog, lik rewrapping long lines
npx prettier --loglevel error -w docs/changelog.md

# update version
npm version "${RELEASE_NAME}" --allow-same-version --no-commit-hooks --no-git-tag-version

# commit the release
git add package.json package-lock.json docs/changelog.md

# run 'task lint' to ensure validity
task lint --silent

# create new release branch
git checkout -B "release/${RELEASE_NAME}"

# commit the changes
git config user.email || git config user.email ansible-devtools@redhat.com
git config user.name || git config user.name "Ansible DevTools"
echo "Release ${RELEASE_NAME}" | cat -  out/next.md | git commit --file -

# Unless, CI is defined we prompt for confirmation
if [[ -z ${CI+z} ]]; then
    read -p "Are you sure you want to push and create pull-request? " -n 1 -r
    echo    # (optional) move to a new line
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        [[ "$0" = "${BASH_SOURCE[0]}" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
    fi
fi

# do push the new branch
git push origin "release/${RELEASE_NAME}"

# create pull request
gh pr create --label skip-changelog --fill

# configure pr to merge to master when all conditions are met
gh pr merge --auto --squash
