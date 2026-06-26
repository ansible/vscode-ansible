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

## Copilot reviews as agent learning opportunities

Every Copilot comment on an agent-authored PR is a defect in our own
review process. Copilot applies the same principles every time — if it
found something, the agent's pre-submit self-review (see the
`submit-pr` skill) should have found it first. Without tightening that
loop, we will never ship a PR without comments.

After fixing each Copilot finding, ask: *which principle from the
submit-pr self-review should have caught this?* If one exists but
didn't trigger, the principle needs to be clearer or the agent didn't
apply it. If no principle covers it, add one — but frame it as a
general evaluation criterion, not a specific instance. Adding "don't
do X" only prevents X; strengthening a principle prevents the entire
class of issues X belongs to.

## How Copilot evaluates code

Copilot reviews succeed because they apply a small number of universal
evaluation criteria to every line of the diff. Understanding these
criteria lets the agent anticipate findings rather than react to them.

**Semantic truthfulness.** Every declaration is read as a contract.
Copilot checks whether types, return values, error codes, version
ranges, log levels, comments, and docstrings accurately describe what
the code actually does. Any gap — a comment that says "all" when the
code means "some", a return type that promises `T` but can produce
`{}`, an error code that is empty — gets flagged.

**Information exposure.** Copilot asks "should this data be visible
here?" for every piece of information that escapes internal scope:
logged data, error messages, API responses, documentation examples.
User content in info-level logs, credentials on CLI examples, internal
paths in error messages — all get flagged because the reviewer assumes
the minimum-exposure principle.

**Caller safety.** Copilot reads every public interface from the
caller's perspective and asks "could this surprise me?" Nullable
returns not reflected in the type, missing null guards on
platform-provided arguments, unsafe casts, optional fields typed as
required, hidden side effects (logging, I/O, global state) that the
name or signature doesn't advertise — all get flagged because the
reviewer assumes callers trust the type signature and expect no
undisclosed behavior.

**Drift between prose and code.** Any time a comment, docstring, ADR,
README, or inline annotation co-exists with the code it describes,
Copilot checks whether the prose is still true after the diff. Renamed
functions with old docstrings, changed triggers with old workflow
descriptions, removed features with lingering references — all flagged.

**Supply-chain mutability.** References to external resources (action
tags, dependency versions, engine ranges) that can change without
review get flagged. The reviewer assumes that anything not pinned to
a specific immutable identifier is a vector for silent behavior change.

**Internal consistency.** Every module's exports, code paths, and
naming conventions are checked against each other. If nine code paths
use a registry lookup but the tenth hardcodes a value, or if one
export capitalizes differently from its siblings, the reviewer flags
the deviation because inconsistency signals copy-paste drift or an
unfinished refactor.

**Adversarial input tracing.** Copilot constructs edge-case scenarios
for public functions: what happens with an empty-but-not-falsy value,
a field combination after partial deletion, a response that satisfies
the HTTP status check but lacks expected fields? If the traced path
fails silently, sends a vacuous request, or produces a return value
that violates the declared type, the reviewer flags it. This catches
bugs that defensive checks miss — code can look correct line-by-line
and still break under a specific constructed input.

**Inherited contract completeness.** When the diff extends a class or
implements an interface, Copilot checks that the subclass honors the
full runtime contract — not just compiler-required members but expected
behaviors. An Error subclass without `name` or `message`, a Disposable
without cleanup, a stream without backpressure handling — all get
flagged because TypeScript enforces structure but runtime contracts
include semantics the compiler cannot check.

**Dead weight.** Unused imports, unreachable branches, written-but-never-
read variables, parameters accepted but ignored — anything the code
pays for but doesn't use. The reviewer assumes dead code obscures intent
and may mask bugs.

## Project-specific patterns

These are known project-specific applications of the principles above.
They serve as a quick reference, not an exhaustive list — the principles
above should catch novel issues these don't cover.

- **GitHub Actions**: pin to commit SHAs with a tag comment
  (`actions/checkout@SHA # v4`)
- **JSDoc**: ESLint enforces `jsdoc/require-param` (with description)
  and `jsdoc/require-returns` on exported functions
- **Prettier**: single quotes, trailing commas; run
  `npm exec eslint -- . --fix` before review
- **Imports**: use `@src/*` aliases for cross-package imports, not
  relative `../` paths; remove unused imports
- **VS Code commands**: guard `node` parameters — Command Palette can
  invoke commands with `undefined` args even when `when` hides the menu
- **MarkdownString**: use `appendText` for dynamic content,
  `appendMarkdown` for static template text only. Set `isTrusted` to
  `{ enabledCommands: [...] }` — never `true` — to restrict which
  command URIs can execute
- **Runtime config guards**: if a feature is `when`-gated in
  `package.json`, also guard the handler at runtime
- **Command manifest parity**: every command registered via
  `vscode.commands.registerCommand()` must also appear in
  `contributes.commands` in `package.json`, or it won't show in the
  Command Palette. Check both directions — runtime ↔ manifest
- **Async timeouts**: any request-response pattern (LS notifications,
  RPC calls, tool execution) must have a timeout fallback. If the
  response never arrives, the UI must not stay in a loading state
  indefinitely
- **Generated files**: after codegen, lint the full project — generated
  `.content.ts` files must pass prettier and typescript-eslint

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
