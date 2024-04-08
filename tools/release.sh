#!/bin/bash
set -eo pipefail

# Remove any local-only tags, avoid failures to incomplete previous release attempts.
git fetch --prune --prune-tags

# Fail if repo is dirty
if [[ -n $(git status -s) ]]; then
  echo 'ERROR: Release script requires a clean git repo.'
  exit 1
fi

RELEASE_NAME=$(gh api 'repos/{owner}/{repo}/releases' --jq '.[0].name')
echo "${RELEASE_NAME}" | grep -Pq "^v\d+\.\d+\$" || {
    echo "Release name (${RELEASE_NAME}) is not valid, must be only in X.Y format." 1>&2
    exit 99
}

# update version
yarn version --immediate "${RELEASE_NAME}.0"

# commit the release
git add package.json

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
git push origin --force "release/${RELEASE_NAME}"

# create pull request
gh pr create --label skip-changelog --fill

# configure pr to merge to master when all conditions are met
gh pr merge --auto --squash
