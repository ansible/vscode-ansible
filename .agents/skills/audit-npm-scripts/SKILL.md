---
name: audit-npm-scripts
description: >
    Audit npm scripts for drift between package.json, scripts/help.mjs,
    and documentation (CLAUDE.md, README.md). Use this skill when adding,
    removing, or renaming npm scripts, or when reviewing a PR that changes
    build commands.
user-invocable: true
triggers: [audit scripts, sync scripts, script drift, pnpm scripts]
---

# Audit pnpm Scripts

Detect and fix drift between the four sources of truth for pnpm scripts:

1. **`package.json`** `scripts` — the canonical definitions
2. **`scripts/help.mjs`** `catalog` — categorized descriptions for `pnpm run help`
3. **`CLAUDE.md`** — agent-facing documentation
4. **`README.md`** — contributor-facing documentation

## When to Run

- After adding, removing, or renaming a pnpm script
- As part of PR self-review (submit-pr skill, Step 3)
- When a contributor reports that docs don't match available commands

## Audit Steps

### 1. Extract scripts from all sources

Read the four files and extract the script names from each:

- `package.json`: keys of `scripts` object (exclude `pre*` lifecycle hooks
  and `vscode:prepublish`)
- `scripts/help.mjs`: script names in the `catalog` array entries
- `CLAUDE.md`: script names mentioned in code blocks or inline code in the
  "Common Commands" section
- `README.md`: script names mentioned in the development/build sections

### 2. Compare and report

For each script in `package.json`, check:

- **Missing from help.mjs** — the script won't appear in `pnpm run help`
- **Missing from CLAUDE.md** — agents won't know about it
- **Missing from README.md** — contributors won't know about it

For each script in `help.mjs` that's NOT in `package.json`:

- **Stale entry** — the script was removed but help.mjs wasn't updated

For each script mentioned in CLAUDE.md or README.md that's NOT in
`package.json`:

- **Stale documentation** — references a script that no longer exists

### 3. Fix drift

For each finding:

- **Missing from help.mjs**: Add the script to the appropriate category
  in `scripts/help.mjs` with a concise description
- **Missing from docs**: Add the script to the relevant section of
  CLAUDE.md and/or README.md
- **Stale entries**: Remove references to scripts that no longer exist

### 4. Verify

Run `pnpm run help` and confirm the output is complete and accurate.

## Output Format

Report findings as a checklist:

```text
pnpm scripts audit:
  [x] package.json has 27 scripts (25 user-facing, 2 lifecycle hooks)
  [x] help.mjs covers 25/25 user-facing scripts
  [ ] CLAUDE.md missing: test:lightspeed:ui, build:lightspeed:webviews
  [x] README.md is current
  [ ] help.mjs has stale entry: test:e2e (removed from package.json)

Fixes applied:
  - Added test:lightspeed:ui to CLAUDE.md Testing section
  - Added build:lightspeed:webviews to CLAUDE.md Build section
  - Removed test:e2e from help.mjs
```
