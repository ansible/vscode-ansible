#!/bin/bash
set -exo pipefail

RELEASE_NAME=$(gh api 'repos/{owner}/{repo}/releases' --jq '.[0].name')
echo -e "\n## ${RELEASE_NAME}\n" > out/next.md
gh api "repos/{owner}/{repo}/releases" --jq '.[0].body' | \
    sed -e's/[[:space:]]*$//' \
    >> out/next.md

# Remove last newline to avoid double newlines on injection
truncate -s -1 out/next.md

# inject the temp nodes into the CHANGELOG.md
sed -i '' -e '/<!-- KEEP-THIS-COMMENT -->/r out/next.md' CHANGELOG.md

# use prettier to reformat the changelog, lik rewrapping long lines
npx prettier -w CHANGELOG.md

# commit the release
git add package.json package-lock.json CHANGELOG.md

# run 'task lint' to ensure validity
task lint

# create new release branch
git checkout -b "release/${RELEASE_NAME}"

# commit the changes
echo "Release ${RELEASE_NAME}" | cat -  out/next.md | git commit --file -

# do push the new branch
git push origin "release/${RELEASE_NAME}"

# create pull request
gh pr create --fill

# configure pr to merge to master when all conditions are met
gh pr merge --auto --squash
