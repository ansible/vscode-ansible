---
name: review-contributor-pr
description: >
  Review and help prepare a contributor's pull request. Use when the user asks
  to review a PR, get a contributor PR ready, update a contributor's branch,
  or ensure a PR meets project standards before merge. Follow this skill so
  contributor PRs are reviewed consistently and avoid rework (lint failures,
  outdated base, weak description).
argument-hint: "<PR number or URL>"
user-invocable: true
metadata:
  author: ansible-environments team
  version: 1.0.0
---

# Review Contributor PR

This skill defines how to review and assist with a **contributor's** pull
request (someone else's PR from a branch in the same repo or from a fork).
Use it when you are helping make a contributor PR merge-ready, not when
submitting your own PR (use `submit-pr` for that).

## Goals

- PR is **up to date with `main`** (no merge conflicts, clean rebase).
- **Lint and type checks pass**: `npx eslint .` and `npx tsc -b` on the full
  tree.
- **Tests pass**: `npx vitest run` for unit tests.
- **PR description** follows the project template (Summary, Changes, Test
  plan) so reviewers and history have clear context.
- Avoid pushing to the contributor's branch with failing CI or an outdated
  base.

## Workflow

### 1. Fetch PR metadata and diff

Use the GitHub API or `gh pr view` to get:

- PR number, title, body, base/head refs, author.
- List of changed files and patch/diff.

Confirm the **base** branch (typically `main`) and whether the PR is from the
same repo or a fork, so you know which remote/branch you will push to if you
make changes.

### 2. Check if the branch is up to date

- Fetch `origin main`.
- Compare base ref of the PR to current `origin/main`. If main has newer
  commits, the contributor's branch should be rebased onto `origin/main`
  before merge.

If you are going to push changes to the contributor's branch:

- Rebase the **local** branch that mirrors their PR onto `origin/main`
  before pushing. That way the PR stays mergeable and CI runs against the
  latest main.

### 3. Run lint and type checks before pushing

Run these checks on the **entire** tree, not only the changed files:

```bash
npx eslint .
npx tsc -b
npx vitest run
```

All checks must pass. Fix any failures (unused imports, type errors, test
regressions) before pushing to the contributor's branch.

Do **not** push to the contributor's branch if checks fail; fix in a new
commit and then push so CI stays green.

### 4. PR description quality

- If the PR body is minimal or missing structure, suggest or apply the
  **submit-pr** template: Summary, Changes, Test plan.

- You can update the PR body via GitHub (if you have permission) or draft
  text for the maintainer/contributor to paste:

  ```bash
  gh pr edit <N> --body-file path/to/body.md
  ```

- Keep the description accurate: list what changed and how to verify (tests,
  manual steps).

### 5. Pushing to the contributor's branch

- Only push to the contributor's branch if you have permission and the user
  has asked you to.

- Before pushing:

  1. Rebase onto `origin/main` so the PR is up to date.
  2. Ensure `npx eslint .` and `npx tsc -b` pass.
  3. Use `--force-with-lease` when pushing a rebased branch:
     `git push <remote> <local-branch>:<their-branch> --force-with-lease`.

- After pushing, the PR will update automatically. Optionally update the PR
  description to mention the new commits.

### 5a. Comment on review threads (same as pr-review)

When you push fixes that address a review comment, **reply on that thread** so
the resolution is visible. Use the same method as the **pr-review** skill:

- Reply via the REST API (use the **top-level** comment id for the thread, not
  a reply). Replace `PR` with the pull request number and `COMMENT_ID` with
  the top-level comment's `id`:

  ```bash
  gh api -X POST "repos/cidrblock/ansible-environments/pulls/PR/comments/COMMENT_ID/replies" \
    -f body="Brief explanation of the fix. Fixed in COMMIT_SHA."
  ```

- To find comment IDs:
  `gh api repos/cidrblock/ansible-environments/pulls/PR/comments` — use the
  top-level comment's `id` (the one with `in_reply_to_id: null` for that
  thread).
- Each reply should state **how** the issue was resolved and include the
  commit hash. Optionally resolve the thread via GraphQL (see pr-review
  skill).

### 6. What not to include in the skill

- **Local-only or environment-specific issues** (e.g. commit signing, SSH
  config, IDE settings) should not be part of the contributor-PR review
  checklist unless they are project policy. Document those separately if
  needed.

## Checklist (quick reference)

When reviewing or preparing a contributor PR:

- [ ] Fetched PR and know base/head and remotes.
- [ ] Branch is up to date with `main` (rebase if needed before push).
- [ ] `npx eslint .` passes.
- [ ] `npx tsc -b` compiles cleanly.
- [ ] `npx vitest run` passes.
- [ ] PR description has Summary, Changes, and Test plan (submit-pr style).
- [ ] If pushing to their branch: rebase onto origin/main, checks green, then
      `git push <remote> <local>:<their-branch> --force-with-lease`.
- [ ] If you addressed a review comment: reply on that thread (same as
      pr-review) with explanation + commit SHA, using the replies endpoint.

## References

- **submit-pr** skill: PR body template and commit conventions.
- **pr-review** skill: Responding to review comments and resolving threads.
- **AGENTS.md**: PR checklist, commit conventions, quality gates.
