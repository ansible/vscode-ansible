---
name: pr-review
description: >
  Guide for handling pull request reviews, including automated (Copilot) and
  human reviewer feedback. Use when responding to PR comments, resolving
  review threads, or updating PRs after review.
argument-hint: "<PR number>"
user-invocable: true
metadata:
  author: ansible-environments team
  version: 1.0.0
---

# PR Review

This skill defines how to handle PR review feedback in the
ansible-environments project.

## Responding to review comments

Every review comment MUST receive a response and resolution. Unanswered
comments block merge.

### Rules

- Address ALL review comments before requesting re-review. Do not leave
  comments unanswered.
- Every comment requires two actions: a **closing reply** and **thread
  resolution**. Replying alone does not resolve the thread; the thread must
  be explicitly resolved via the GitHub UI or API.
- Reply to each comment with a **brief explanation of how it was resolved** and
  the commit hash (e.g., "Fixed the type annotation so `tsc` passes.
  Fixed in abc1234."). Do not reply with only the SHA; explain the fix.
- If a comment is a false positive or you disagree, reply with a clear
  technical explanation, then resolve the thread. Do not dismiss without
  justification.
- After pushing fixes, update the PR description to reflect the expanded scope
  (per the submit-pr skill).

## Copilot review patterns

Copilot automated reviews surface recurring categories. Address these
proactively before pushing to avoid review round-trips:

### Supply-chain security

Pin GitHub Actions to commit SHAs instead of mutable tags (`@v1`). Mutable
tags allow upstream changes to affect CI without review. Use a comment to
note the original tag:

```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4
```

### Inaccurate documentation

Documentation MUST accurately describe the actual behavior. If a workflow
triggers on `pull_request` targeting `main`, don't document it as running
on "every pull request". Be specific about triggers, branches, and conditions.

### Markdown table formatting

Tables must use a single leading `|` on each line. Double leading `||` renders
as an extra empty column. Validate table rendering before committing.

### Inaccurate comments

Code comments and docstrings MUST accurately describe what the code does. If
you rename a function, change behavior, or remove functionality, update all
associated comments in the same commit.

### Secrets in documentation

Never show API keys, tokens, or credentials on command lines in docs or
examples. Demonstrate env var usage instead. Shell history and process lists
expose command-line arguments.

### Unused variables / imports (ESLint)

Copilot often flags unused imports. With ESLint `no-unused-vars` enabled,
these fail CI. Remove unused imports or prefix intentionally unused parameters
with `_`. Prefer trimming the import list over disabling the rule.

### JSDoc completeness

ESLint enforces `jsdoc/require-param` and `jsdoc/require-returns`. Every
exported function needs `@param` for each parameter and `@returns` for
non-void return types. Add JSDoc proactively — Copilot flags missing
annotations on nearly every PR.

### Prettier formatting

The project enforces single quotes (unless the string contains an
apostrophe, in which case double quotes avoid `\'`), trailing commas,
and consistent parenthesization. Run `npm exec eslint -- . --fix` before
manual review. Generated files (`.content.ts`) must also pass prettier.

### Import alias violations

Use `@src/*` aliases for cross-boundary imports, not relative `../`
paths that reach outside the current package. `no-restricted-imports`
enforces this. Copilot flags violations that ESLint may also catch.

### Command handler null guards

VS Code commands invoked from the Command Palette may receive
`undefined` arguments even if the `when` clause restricts menu
visibility. Always guard `node` parameters in tree-view command
handlers:

```typescript
if (!node) return;
```

### `appendText` vs `appendMarkdown`

Use `appendText` for dynamic or external content in `MarkdownString`
tooltips. `appendMarkdown` with user-controlled data risks formatting
injection (e.g., unescaped `[`, `]`, backticks). Reserve
`appendMarkdown` for static template text.

### Runtime config guards

If a feature is gated by a configuration setting in `package.json`
`when` clauses, also guard the command handler at runtime. The
Command Palette bypasses menu visibility — a user (or agent) can
invoke the command even when the menu item is hidden.

### Documentation and comment drift

When renaming, refactoring, or changing behavior, update ALL comments,
docstrings, and documentation in the same commit. Copilot flags
stale comments on nearly every PR. This includes: JSDoc descriptions,
inline comments, AGENTS.md, README.md, and ADRs.

### Generated file hygiene

After running codegen (`node scripts/generate-skill-content.mjs`), run
`npm exec eslint -- .` on the full project. Prettier and
typescript-eslint rules apply to generated `.content.ts` files. Quote
style, line length, and formatting must match project conventions.

## Workflow

1. **Ensure the PR branch is up to date with `next`.** Before reviewing or
   pushing fixes, rebase onto `next`. A stale base causes misleading CI
   results and merge conflicts. See the `branching-strategy` skill for
   why `next` is the target branch, not `main`.
   ```bash
   git fetch upstream
   git rebase upstream/next
   git push --force-with-lease
   ```
2. After pushing a PR, wait for both CI and Copilot review.
3. Check CI status and read all review comments.
4. Fix all issues in a single commit (or minimal commits).
5. Reply to each comment with a brief explanation of how it was resolved and
   the commit hash (e.g., "Removed unused imports. Fixed in abc1234.").
6. **Resolve each review thread** after replying. Every thread must have both
   a closing reply and an explicit resolution — replying alone is not enough.

### Checking CI status

Always check CI checks as part of the review workflow. Fix failures before
addressing review comments — a green build is a prerequisite for merge.

```bash
# List failing checks (replace N with PR number)
gh pr checks N --json name,state --jq '.[] | select(.state != "SUCCESS" and .state != "PENDING")'

# Get the log link for a specific failed check
gh pr checks N --json name,state,link --jq '.[] | select(.name == "CHECK_NAME") | .link'

# View failed job logs directly
gh run view RUN_ID --log-failed 2>&1 | tail -80
```

Common CI failures and how to fix them:

- **Any of lint / compile / test / build**: Run `npm run ci` locally to
  reproduce the full CI pipeline. This is the fastest path to a fix.
- **lint (eslint)**: Run `npm exec eslint -- . --fix` to auto-fix.
  Common issues: unused imports, missing JSDoc, prettier formatting.
- **compile (tsc)**: Run `npm run compile` (includes skill codegen).
  Fix type mismatches, missing imports, and `any` type leaks.
- **unit tests (vitest)**: Run `npm run test:coverage` to match CI
  thresholds. Update tests when behavior changes.
- **e2e tests (wdio)**: Run `npm run test:ui` to reproduce. These tests
  launch a real VS Code instance — check for timing issues and flaky
  selectors.

### Replying to review comments

Post a reply using the REST API. Each reply must state **how** the issue was
resolved and include the commit hash (not only the SHA):

```bash
# Example: explain the fix, then cite the commit
gh api -X POST "repos/cidrblock/ansible-environments/pulls/PR/comments/COMMENT_ID/replies" \
  -f body="Fixed the type annotation so tsc passes. Fixed in COMMIT_SHA."
```

To get comment IDs: `gh api repos/cidrblock/ansible-environments/pulls/PR/comments`
and use each comment's `id`. Alternatively, reply in the GitHub PR UI, then
resolve threads via GraphQL below.

### Resolving review threads (GraphQL)

Replace `N` with the PR number and `THREAD_ID` with the `id` from
`reviewThreads.nodes[].id` (from the list query). Filter nodes where
`isResolved` is false if you only want to resolve open threads.

```bash
# List threads (get id from nodes for each thread)
gh api graphql -f query='{
  repository(owner: "cidrblock", name: "ansible-environments") {
    pullRequest(number: N) {
      reviewThreads(first: 20) {
        nodes { id isResolved comments(first:1) { nodes { body } } }
      }
    }
  }
}'

# Resolve one thread
gh api graphql -f query='mutation {
  resolveReviewThread(input: {threadId: "THREAD_ID"}) {
    thread { isResolved }
  }
}'
```

7. Update the PR description to include the new commit(s).
8. If CI failure is unrelated to your changes (e.g., flaky test, transient
   network issue), fix it anyway — the PR owns the green build.

### After pushing fixes: check for a new Copilot review

Copilot may run again on new commits. Re-check whether it left a new review or
line comments so you can reply and resolve any new threads.

```bash
# New Copilot review (replace N with PR number, ISO8601 with last push time)
gh api repos/cidrblock/ansible-environments/pulls/N/reviews --jq '.[] | select(.user.login == "copilot-pull-request-reviewer[bot]" and .submitted_at > "ISO8601") | {submitted_at, state, body: .body[0:200]}'

# New Copilot line comments (replace N and ISO8601)
gh api repos/cidrblock/ansible-environments/pulls/N/comments --jq '.[] | select(.user.login == "Copilot" and .created_at > "ISO8601") | {id, created_at, path, body: .body[0:150]}'
```

If both return nothing, no new Copilot activity. Otherwise, address new
comments (reply with how it was resolved + commit hash, then resolve threads)
and repeat this check after the next push.
