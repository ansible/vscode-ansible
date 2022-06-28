#!/bin/bash
# Quietly reports success if git does not report dirty and there are no
# files that are untracked or not ignored. Otherwise it reports what was changed
# so user can either include it in their change or add those to `.gitignore`.
#
RED='\033[0;31m'
NC='\033[0m' # No Color

git diff --quiet --exit-code || {
    >&2 echo -e "${RED}ERROR: Found files either untracked missing from .gitignore or modified and tracked:${NC}"
    >&2 git ls-files --exclude-standard --others
    >&2 git -P diff --color=always
    exit 1
}
