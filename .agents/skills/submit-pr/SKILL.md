---
name: submit-pr
description: >
  Prepare and submit a pull request for the ansible-environments project.
  Syncs with main, creates a feature branch, runs lint and type checks,
  commits with conventional commits, then creates the PR via gh. Use when
  the user asks to submit, create, or open a pull request, or says "submit
  PR", "open PR", "create PR".
argument-hint: "[branch-name] [--title 'PR title']"
user-invocable: true
metadata:
  author: ansible-environments team
  version: 1.0.0
---

# Submit PR

## Workflow

### Step 1: Sync with main and create a feature branch

Always start from the latest main:

```bash
git fetch origin
git checkout -b <branch-name> origin/main
```

Use a descriptive branch name (e.g., `feat/add-vault-commands`,
`fix/completion-provider-crash`).

If changes already exist on the current branch (e.g., from an in-progress
session), cherry-pick or rebase them onto the new branch.

### Step 2: Run lint and type checks

```bash
npx eslint .
npx tsc -b
npx vitest run
```

**All checks must pass cleanly on all files** — not just the files you
changed. If the branch has pre-existing violations (e.g., from an old base),
rebase onto `origin/main` first.

If violations are found:
1. Run `npx eslint . --fix` to auto-fix what it can
2. Manually fix remaining violations (type errors, test failures)
3. Re-run until clean

### Step 3: Commit with conventional commits

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

### Step 4: Push and create the pull request

```bash
git push -u origin HEAD

gh pr create --title "conventional commit style title" --body "$(cat <<'EOF'
## Summary
- Concise description of what changed and why

## Changes
- List of notable changes

## Test plan
- [ ] `npx eslint .` passes
- [ ] `npx tsc -b` compiles cleanly
- [ ] `npx vitest run` passes
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
