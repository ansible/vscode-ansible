---
name: branching-strategy
description: >
    Use this skill when creating branches, submitting PRs, rebasing,
    cherry-picking, or deciding which branch to target. Explains the `next`
    vs `main` branch layout and enforces the rule that all new PRs target
    `next`.
argument-hint: ''
user-invocable: false
metadata:
    author: ansible-environments team
    version: 1.0.0
---

# Branching Strategy

## Branch Layout

This repository has two long-lived branches with **completely different
codebases**. They share git lineage but their contents are incompatible.

### `next` — active development (ansible-environments architecture)

- **This is the branch you should be working on.**
- Contains the ansible-environments codebase: modular `@ansible/core`
  service layer, new language server, MCP server, schema-driven webviews,
  and tree view sidebar providers.
- All new features, bug fixes, and PRs target `next`.
- Does NOT contain Lightspeed. If Lightspeed is reintroduced, it will
  be a separate package within the `next` monorepo.

### `main` — legacy codebase (frozen)

- Contains the original vscode-ansible extension with Lightspeed, Vue
  webviews, DocsLibrary-based language server, and npm workspaces.
- **Do NOT push code from `next` into `main`.** The codebases are
  architecturally incompatible. Merging or cherry-picking between them
  will break both.
- `main` may still receive critical security fixes directly, but no
  feature work.

## Rules

### NEVER merge or cherry-pick between `next` and `main`

The two branches have entirely different directory structures, package
names, build systems, and architectures. Code from one will not work in
the other without significant adaptation. Do not attempt to:

- Merge `next` into `main`
- Merge `main` into `next`
- Cherry-pick commits from `main` to `next` (or vice versa)
- Rebase `next` onto `main`

If functionality from `main` is needed in `next`, it must be manually
ported and adapted to the `next` architecture (different service layer,
different LS, different package structure).

### PRs from forks MUST target `next`

When a contributor opens a PR from a fork, it **must** target the `next`
branch. PRs targeting `main` should be redirected to `next` unless they
are critical security fixes for the legacy extension.

To retarget an existing PR:

```bash
gh pr edit <number> --base next
```

### Creating feature branches

Always branch from `next`, never from `main`:

```bash
git fetch upstream
git checkout -b feat/my-feature upstream/next
```

### Submitting PRs

PRs must target `next` explicitly. When using `gh pr create`, specify
the base branch:

```bash
gh pr create --base next --title "feat(core): ..." --body "..."
```

### Reviewing PRs

When reviewing a PR, verify the base branch is `next`. If a PR
incorrectly targets `main`, leave a comment asking the author to retarget
and use `gh pr edit <number> --base next`.

## Architecture Reference

The `next` branch is organized as an npm monorepo:

```text
packages/
  core/           → @ansible/core (VS Code-independent services)
  language-server/ → @ansible/language-server (LSP server)
  mcp-server/     → @ansible/mcp-server (standalone MCP server)
src/
  extension.ts    → VS Code extension entry point
  panels/         → Webview panels (PluginDocPanel, CreatorFormPanel, etc.)
  views/          → TreeView providers (Collections, EE, Creator, etc.)
  services/       → VS Code-specific services (Terminal, Python env)
test/
  unit/           → Unit tests
  integration/    → Integration tests
  ui/             → WDIO browser-based UI tests
```

The `main` branch uses a completely different layout (npm workspaces,
`packages/ansible-language-server/`, `packages/ansible-mcp-server/`,
`src/features/lightspeed/`, `webviews/lightspeed/`, Vue + Vite build).
These paths do not exist in `next`.
