# Contributing to Ansible

## Prerequisites

- **Node.js 22+** and **npm 10+** (ESLint 10 requires Node 20+)
- **VS Code** (for extension development and debugging)
- **Python 3.9+** (for Ansible tooling integration)

## Setup

```bash
git clone git@github.com:cidrblock/ansible-environments.git
cd ansible-environments
git remote add upstream git@github.com:cidrblock/ansible-environments.git
npm ci
npm run compile
npm run build
```

Use `npm ci` (not `npm install`) for reproducible dependency resolution.

## Daily workflow

1. Create a feature branch from `upstream/next`:

    ```bash
    git fetch upstream
    git checkout -b feat/my-feature upstream/next
    ```

2. Make changes.
3. Iterate with the fast check:

    ```bash
    npm run check    # compile + lint + test (no coverage thresholds)
    ```

4. Before committing, run the full CI mirror:

    ```bash
    npm run ci       # compile + lint + test:coverage + build
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

## npm scripts reference

| Script                    | What it does                           | When to use                                |
| ------------------------- | -------------------------------------- | ------------------------------------------ |
| `npm run compile`         | Skill codegen + `tsc -b`               | After any code change                      |
| `npm run build`           | esbuild bundling                       | Before testing the extension or MCP server |
| `npm run lint`            | ESLint on the entire project           | Check for lint violations                  |
| `npm test`                | Vitest (no coverage)                   | Quick test run                             |
| `npm run test:coverage`   | Vitest with coverage thresholds        | Match CI thresholds (85/75/85/85)          |
| `npm run check`           | compile + lint + test                  | Iterative development                      |
| `npm run ci`              | compile + lint + test:coverage + build | **Before every commit/push**               |
| `npm run watch`           | `tsc -b --watch`                       | Continuous compilation during development  |
| `npm run watch:bundle`    | esbuild watch mode                     | Continuous bundling during development     |
| `npm run package`         | Package VSIX (no install)              | Verify extension packaging works           |
| `npm run package:install` | Package VSIX and install into VS Code  | Test the extension in your local VS Code   |
| `npm run test:ui`         | WebDriverIO e2e tests                  | After UI/panel changes                     |

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
| **Stale bundles after changes**          | Run `npm run compile && npm run build` or `npm run ci`. The extension and MCP server load from `dist/` — stale bundles mask bugs.                          |
| **Partial lint**                         | Always lint the full project (`npm run lint`), not individual files. Cross-file issues (unused exports, import aliases) are invisible in single-file lint. |
| **Forgetting skill codegen**             | `npm run compile` includes codegen. If you edit a `.md` skill file, the `.content.ts` sidecar must be regenerated and committed together.                  |
| **CI passes locally but fails remotely** | Ensure you run `npm run ci` (not just `npm run check`). Coverage thresholds and the esbuild build step catch additional failures.                          |
| **Line ending issues**                   | `.gitattributes` enforces LF for skill files. If codegen produces different output on Windows, check `git config core.autocrlf`.                           |
