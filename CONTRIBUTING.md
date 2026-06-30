# Contributing to Ansible

## Prerequisites

- **Node.js 22+** and **pnpm 11+** (install via `npm install -g pnpm` or Corepack)
- **VS Code** (for extension development and debugging)
- **Python 3.9+** (for Ansible tooling integration)

## Setup

```bash
git clone git@github.com:cidrblock/ansible-environments.git
cd ansible-environments
git remote add upstream git@github.com:cidrblock/ansible-environments.git
pnpm install --frozen-lockfile
pnpm run compile
pnpm run build
```

Use `pnpm install --frozen-lockfile` for reproducible dependency resolution.

## Daily workflow

1. Create a feature branch from `upstream/next`:

    ```bash
    git fetch upstream
    git checkout -b feat/my-feature upstream/next
    ```

2. Make changes.
3. Iterate with the fast check:

    ```bash
    pnpm run check    # compile + lint + test (no coverage thresholds)
    ```

4. Before committing, run the full CI mirror:

    ```bash
    pnpm run ci       # compile + lint + test:coverage + build
    ```

5. Commit, push, and open a PR targeting `next`.

## Branching

- **`next`** is the active development branch. All PRs target `next`.
- **`main`** is frozen (legacy codebase). Never merge between them.
- See the `branching-strategy` skill for details.

## Project structure

See [AGENTS.md](AGENTS.md) for architectural invariants and the full
project layout. See the [ADR index](.sdlc/adrs/README.md) for design
decisions.

```text
packages/
  common/           # @ansible/common — browser-safe types, prompts, utils
  services/         # @ansible/services — Node.js service implementations
  language-server/  # @ansible/language-server — LSP server
  mcp-server/       # @ansible/mcp-server — standalone MCP server
  ui/               # @ansible/ui — shared React webview components
src/                # VS Code extension host (views, panels, commands)
```

## pnpm scripts reference

| Script                     | What it does                           | When to use                                |
| -------------------------- | -------------------------------------- | ------------------------------------------ |
| `pnpm run compile`         | Skill codegen + `tsc -b`               | After any code change                      |
| `pnpm run build`           | esbuild bundling                       | Before testing the extension or MCP server |
| `pnpm run lint`            | All linters via prek (eslint, cspell, markdownlint, etc.) | Check for lint violations |
| `pnpm test`                | Vitest (no coverage)                   | Quick test run                             |
| `pnpm run test:coverage`   | Vitest with coverage thresholds        | Match CI thresholds (85/75/85/85)          |
| `pnpm run check`           | compile + lint + test                  | Iterative development                      |
| `pnpm run ci`              | compile + lint + test:coverage + build | **Before every commit/push**               |
| `pnpm run watch`           | `tsc -b --watch`                       | Continuous compilation during development  |
| `pnpm run watch:bundle`    | esbuild watch mode                     | Continuous bundling during development     |
| `pnpm run package`         | Package VSIX (no install)              | Verify extension packaging works           |
| `pnpm run package:install` | Package VSIX and install into VS Code  | Test the extension in your local VS Code   |
| `pnpm run test:ui`         | WebDriverIO e2e tests                  | After UI/panel changes                     |

## PR process

- Follow [Conventional Commits](https://www.conventionalcommits.org).
  Scopes: `core`, `ls`, `mcp`, `extension`, `views`, `panels`, `ci`, `docs`.
- PRs require a label: `breaking`, `chore`, `feat`, or `fix`.
- See the `submit-pr` skill for the full workflow.
- See the `pr-review` skill for handling review feedback.

## Common pitfalls

| Pitfall                                  | How to avoid                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node version too old**                 | ESLint 10 requires Node 20+. Use Node 22 LTS.                                                                                                              |
| **Stale bundles after changes**          | Run `pnpm run compile && pnpm run build` or `pnpm run ci`. The extension and MCP server load from `dist/` — stale bundles mask bugs.                          |
| **Partial lint**                         | Always lint the full project (`pnpm run lint`), not individual files. Cross-file issues (unused exports, import aliases) are invisible in single-file lint. |
| **Forgetting skill codegen**             | `pnpm run compile` includes codegen. If you edit a `.md` skill file, the `.content.ts` sidecar must be regenerated and committed together.                  |
| **CI passes locally but fails remotely** | Ensure you run `pnpm run ci` (not just `pnpm run check`). Coverage thresholds and the esbuild build step catch additional failures.                          |
| **Line ending issues**                   | `.gitattributes` enforces LF for skill files. If codegen produces different output on Windows, check `git config core.autocrlf`.                           |
