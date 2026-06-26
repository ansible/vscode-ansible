---
name: submit-pr
description: >
  Prepare and submit a pull request for the vscode-ansible project.
  Syncs with the `next` branch, creates a feature branch, runs lint and
  type checks, commits with conventional commits, then creates the PR
  targeting `next` via gh. Use when the user asks to submit, create, or
  open a pull request, or says "submit PR", "open PR", "create PR".
argument-hint: "[branch-name] [--title 'PR title']"
user-invocable: true
metadata:
  author: ansible-environments team
  version: 1.0.0
---

# Submit PR

## Workflow

### Step 1: Sync with `next` and create a feature branch

**IMPORTANT:** All feature branches MUST be based on `next`, never `main`.
See the `branching-strategy` skill for details.

```bash
git fetch upstream
git checkout -b <branch-name> upstream/next
```

Use a descriptive branch name (e.g., `feat/add-vault-commands`,
`fix/completion-provider-crash`).

If changes already exist on the current branch (e.g., from an in-progress
session), cherry-pick or rebase them onto the new branch.

### Step 2: Run the full CI check locally

```bash
npm run ci
```

This single command runs skill codegen, TypeScript compilation, ESLint
on the **entire project**, Vitest with coverage thresholds, and the
esbuild production bundle. It mirrors what CI runs.

**All checks must pass cleanly on all files** — not just the files you
changed. If the branch has pre-existing violations (e.g., from an old base),
rebase onto `upstream/next` first.

**CRITICAL:** Run `npm run ci` as the **last step before committing**.
Do not push if it fails. Do not claim quality gates passed without
running this command. Partial lint (on changed files only) or skipping
the build step has caused repeated CI failures.

If violations are found:
1. Run `npm exec eslint -- . --fix` to auto-fix what it can
2. Manually fix remaining violations (type errors, test failures)
3. Re-run `npm run ci` until clean — do not shortcut with partial runs

**Rebuild reminder:** After any code change, `npm run ci` handles
compilation and bundling. If testing interactively (e.g., reloading the
extension), also run `npm run compile && npm run build` explicitly.

### Step 3: Self-review the diff

**This step is mandatory.** Do not skip it. Do not combine it with
Step 2. After CI passes, review the **full PR diff** — all commits
since the branch diverged from the base branch, not just the last
commit or unstaged changes:

```bash
git diff upstream/next...HEAD
```

Read every changed line against these questions. For each question,
name at least one specific file and line you verified. If you cannot,
you haven't actually reviewed the diff.

**Artifact-type sweep.** Before answering the questions below, list
every distinct artifact type in the diff (e.g., TypeScript, YAML
workflow, shell script, Dockerfile, JSON config). For each question,
you must cite at least one file of *each* artifact type — not just
TypeScript. If a question feels inapplicable to an artifact type,
translate it:

- "caller" in YAML means any action, job, or step that consumes
  a declaration (e.g., `actions/checkout` consumes `permissions:`,
  a downstream job consumes an output)
- "type signature" in YAML means a key's implicit contract
  (e.g., `permissions:` replaces defaults, not extends them;
  `if:` expressions evaluate to boolean)
- "constructed scenario" for shell means: what happens when
  the command runs on a different shell (bash vs powershell),
  a different OS (encoding, path separators), or with missing
  input (empty files, failed prior steps)?
- "dependencies pinned to intent" for actions means: does the
  action tag, permissions scope, or `if:` condition express
  exactly what you mean — not broader, not narrower?

1. **Does every statement mean what it says?** Check every type
   signature, return value, error code, version range, log level,
   comment, and docstring. If the code declares it, the runtime must
   honor it on every path.

2. **Does this expose more than it should?** Check every log call,
   error message, and user-facing string. Does it contain user content,
   credentials, or internal state? Could a caller or log reader learn
   something they shouldn't? Also check every capability grant:
   `isTrusted`, permission scopes, `enabledCommands`, CORS origins,
   CSP directives. Does each grant the minimum necessary, or does it
   open a wider surface than the code actually uses?

3. **Would a caller be surprised?** Read every public function from
   the caller's perspective. Can it return a value the type doesn't
   cover? Does it mutate an argument the caller owns? Does it throw
   where the signature implies it won't? Does it have side effects
   (logging, I/O, global state) that its name or signature doesn't
   advertise? Does it behave differently from sibling functions in
   the same file?

4. **Is everything still true after this change?** Diff comments and
   docstrings against the code they describe. Did you rename something
   but leave the old name in prose? Did you change behavior but leave
   an old description?

5. **Are dependencies and versions pinned to intent?** Check every
   version range, action tag, and engine constraint. Does each one
   express what you actually mean — not tighter, not looser?

6. **Is there dead weight?** Check for unused imports, unreachable
   branches, written-but-never-read variables, parameters accepted
   but ignored.

7. **Is this internally and externally consistent?** Within each
   module: do all code paths use the same patterns (e.g., registry
   lookups vs hardcoded values)? Are exports named consistently
   (capitalization, prefixes)? Across the repo: do tsconfig targets,
   engine floors, and conventions match sibling packages? For VS Code
   extensions: is every command registered in TypeScript also declared
   in `contributes.commands`? Is every `when` clause, menu entry, and
   keybinding backed by a registered command? Cross-artifact mismatches
   (runtime registration vs manifest declaration) are the easiest to
   miss and the most embarrassing to ship.

8. **Would a constructed scenario break this?** For each public
   function, construct one realistic failure case: an edge-case
   input, a specific field combination after deletion/filtering,
   an empty-but-not-falsy value. Trace it through the code path.
   If it fails silently, sends a vacuous request, or produces a
   return value that violates the declared type, that's a finding.
   Also construct *temporal* failures: what happens when an async
   dependency never responds, times out, or responds after the
   consumer has moved on? What happens when a state-change handler
   updates one cache but not a sibling cache that shares the same
   UI surface?

9. **Do inherited contracts hold?** When extending a class or
   implementing an interface, check that the subclass honors the
   full runtime contract — not just the compiler-required members,
   but expected behaviors (Error needs name and message, Disposable
   needs dispose, EventEmitter needs cleanup). TypeScript enforces
   structure; runtime contracts include semantics.

Only proceed to Step 3b after completing this review.

### Step 3b: Cold subagent review

**This step is mandatory.** The self-review in Step 3 is necessary but
insufficient — it suffers from confirmation bias because the reviewing
agent wrote the code. Spin up a **read-only subagent** with no
conversation history to review the diff cold.

The subagent sees only the diff and the review questions. It has no
memory of the intent, iterations, or trade-offs that led to the code.
This forces it to read every line at face value — the same way Copilot
or a human reviewer would.

```
Launch a Task subagent with:
  subagent_type: "generalPurpose"
  readonly: true
  run_in_background: false
```

Use this prompt template (fill in the repository path and diff):

````
You are reviewing a pull request diff. You have no prior context about
why these changes were made — review every line at face value.

Repository: <absolute path to repo>
Base branch: upstream/next

Run `git diff upstream/next...HEAD` to get the full diff, then read
every changed file in full (not just the diff hunks — you need
surrounding context to evaluate contracts and consistency).

Evaluate the diff against these 9 questions. For each question, either
report a concrete finding (file, line, what's wrong, why it matters)
or state "No findings." Do not pad with observations that aren't
actionable.

1. Does every statement mean what it says? (types, return values,
   comments, docstrings — does the runtime honor them on every path?)
2. Does this expose more than it should? (logs, errors, user strings,
   capability grants like isTrusted, permission scopes, CSP)
3. Would a caller be surprised? (nullable returns, hidden side effects,
   undisclosed I/O, inconsistency with sibling functions)
4. Is everything still true after this change? (prose vs code drift —
   renamed symbols with old docstrings, changed behavior with old
   descriptions)
5. Are dependencies and versions pinned to intent?
6. Is there dead weight? (unused imports, unreachable branches,
   written-but-never-read variables)
7. Is this internally and externally consistent? (patterns, naming,
   cross-artifact parity — e.g., commands registered in TS must be
   declared in package.json contributes.commands)
8. Would a constructed scenario break this? (edge-case inputs,
   empty-but-not-falsy values, temporal failures — async dependency
   never responds, state handler updates one cache but not a sibling)
9. Do inherited contracts hold? (interface implementations honor
   runtime semantics, not just compiler-required members)

Return ONLY findings. Format each as:
  **[Q#] file:line — description**

If there are no findings across all 9 questions, return:
  "No findings."
````

**Act on every finding.** Fix the code, then re-run `npm run ci`.
Do not dismiss findings without a clear technical justification
documented in the self-review output.

If the subagent returns "No findings", proceed to Step 4.

### Step 4: Commit with conventional commits

Use the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Common types for this project:

| Type | When to use |
|------|-------------|
| `feat` | New feature (provider, service, view, panel) |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style/formatting (no logic change) |
| `refactor` | Code restructuring (no feature or fix) |
| `test` | Adding or updating tests |
| `build` | Build system, dependencies, packaging |
| `ci` | CI/CD configuration |
| `chore` | Maintenance tasks |

Scopes reflect project areas: `core`, `ls` (language server), `mcp`,
`extension`, `views`, `panels`, `ci`.

Examples:
- `feat(ls): add hover documentation for module options`
- `fix(core): handle missing ansible-doc gracefully`
- `test(ls): add completion provider unit tests`
- `build: add esbuild bundling for VSIX packaging`

Follow the 50/72 rule: commit title under 50 characters, body lines wrapped
at 72 characters.

Include an issue reference in the commit body or PR body:

```text
related: #<issue_number>
```

### Step 5: Push and create the pull request

**Labels are required.** The repository requires at least one of these
labels: `breaking`, `chore`, `feat`, `fix`. Map the conventional commit
type to the closest allowed label (e.g., `perf` → `feat`,
`refactor` → `chore`, `docs` → `chore`, `test` → `chore`,
`build` → `chore`, `ci` → `chore`).

```bash
git push -u origin HEAD

gh pr create --base next --label "<type>" --title "conventional commit style title" --body "$(cat <<'EOF'
## Summary
- Concise description of what changed and why

## Changes
- List of notable changes

## Quality of life
- AI-authored additions: ADRs, agent skills, documentation, templates
- List each AI-generated artifact and its purpose

## Test plan
- [ ] `npm run ci` passes (compile + lint + test:coverage + build)
- [ ] `npm run test:ui` passes (if e2e-relevant changes)

related: #<issue_number>
EOF
)"
```

Return the PR URL to the user.

### Maintaining the PR

When pushing additional commits to an existing PR, **always update the PR
body** to reflect the new changes:

```bash
gh pr edit <pr-number> --body "$(cat <<'EOF'
...updated body...
EOF
)"
```

The Summary, Changes, and Test plan sections must stay current with all
commits on the branch, not just the initial one.

### PR structure requirements

These requirements come from the project's AGENTS.md:

- **Single commit**: PR should contain a single commit. Squash changes and
  rebase before pushing new changes.
- **Atomic changes**: If changes can be split into smaller atomic PRs, do so.
- **Draft status**: Keep PR as *draft* until CI reports green on all jobs.
