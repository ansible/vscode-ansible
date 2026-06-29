# CLAUDE.md

## Project Overview

VS Code extension for Ansible — provides language server (LSP), linting, auto-completion, hover docs, collection browsing, and execution environment support. Published to both VS Code Marketplace and Open VSX as `redhat.ansible`.

> **Branch note:** This is the `next` branch (ansible-environments architecture). The `main` branch is a frozen legacy codebase — never merge between them. See the `branching-strategy` skill for details.

## Repository Structure

Monorepo using npm workspaces (`packages/*`, `docs`):

- **Root (`src/`)** — VS Code extension entry point, panels, views, and editor features
- **`packages/common/`** — `@ansible/common` — browser-safe types, prompts, utils, parsers (zero Node.js deps)
- **`packages/services/`** — `@ansible/services` — Node.js service implementations (fs, child_process, https)
- **`packages/language-server/`** — `@ansible/language-server` — LSP server
- **`packages/mcp-server/`** — `@ansible/mcp-server` — standalone MCP server for AI assistants
- **`packages/lightspeed/`** — `@ansible/lightspeed` — Lightspeed AI features
- **`packages/ui/`** — `@ansible/ui` — shared React components for webviews
- **`docs/`** — Project documentation (Starlight site)
- **`tools/`** — Build helpers (versioning, release scripts)
- **`scripts/`** — Build and codegen scripts (esbuild, skill content generation)

## Prerequisites

- **Node.js** >= 22.18.0
- **npm** (bundled with Node.js; the repo uses npm workspaces)
- **prek** — pre-commit hook runner (`pipx install prek`)
- **uv** — Python package runner, provides `uvx` (`pipx install uv`)

## Common Commands

Use `npm run` (no arguments) to list all available scripts.

### Build & Development

```bash
npm install             # Install all dependencies (including workspace packages)
npm run compile         # TypeScript compilation (generates skill content + tsc -b)
npm run build           # esbuild bundle (extension, language server, MCP server, webview)
npm run build:production # Production build (minified, no source maps)
npm run watch           # Watch mode for TypeScript
npm run watch:bundle    # Watch mode for esbuild
npm run package:install # Build .vsix, install into VS Code, clean up
```

### Testing

```bash
npm test                # Run all vitest tests (compile + lint first via pretest)
npm run test:coverage   # Tests with coverage reporting
npm run check           # compile + lint + test (iterative development)
npm run ci              # compile + lint + test:coverage + build (pre-commit gate)

# Specific test projects (vitest)
npx vitest run --project=ext        # Extension tests
npx vitest run --project=common     # @ansible/common tests
npx vitest run --project=services   # @ansible/services tests
npx vitest run --project=mcp        # MCP server tests
npx vitest run --project=ls         # Language server tests
npx vitest run --project=lightspeed # Lightspeed tests
npx vitest run --project=ui         # UI component tests

# Integration tests (VS Code test runner)
npm run test:integration

# UI tests (WebDriverIO)
npm run pretest:ui                  # Install chromedriver + test extensions (first time)
npm run test:ui                     # Run WDIO smoke + language server tests
npm run test:lightspeed:ui          # Run WDIO lightspeed tests
```

### Linting

```bash
npm run lint            # ESLint on the full project
npm run lint:prek       # Run prek hooks (skillmark, cspell, markdownlint, actionlint, file hygiene)
npm run lint:knip       # Find unused files, deps, and exports (knip)
```

### Packaging & Release

```bash
npm run package         # Create .vsix (no dependencies bundled — esbuild handles it)
```

### Documentation

```bash
npm run docs:dev        # Start docs dev server
npm run docs:build      # Build docs site
npm run docs:preview    # Preview built docs
```

## Testing Framework

- **Vitest** for unit/integration tests — configured with projects: `ext`, `common`, `services`, `mcp`, `ls`, `lightspeed`, `ui`
- **WebDriverIO** for UI/browser tests (`test/ui/`)
- **VS Code Test CLI** for extension integration tests (`test/integration/`)
- Path aliases in tests: `@src/*` → `src/*`

## Code Quality

- **ESLint** — TypeScript/JavaScript linting (`eslint.config.mjs`)
- **prek** — Git hook manager (`prek.toml`); runs skillmark, cspell, markdownlint, actionlint, file hygiene, commitlint, and the custom skill frontmatter checker
- **cspell** — Spell checking for markdown, TypeScript, docs (`.cspell.json`)
- **markdownlint** — Markdown linting (`.markdownlint.json`)
- **actionlint** — GitHub Actions workflow validation
- **knip** — Unused files, dependencies, and exports detection (`knip.json`)
- **skillmark** — SKILL.md validation against agentskills.io spec (`.skillmark.toml`)
- **commitlint** — Conventional commit enforcement (`commitlint.config.mjs`)
- **Conventional commits** — `fix(core):`, `feat(ls):`, `test(ui):`, `chore(deps):` (scopes: `core`, `ls`, `mcp`, `extension`, `views`, `panels`, `ci`, `docs`, `deps`)
- **PR labels** — required: one of `breaking`, `chore`, `feat`, `fix`

## Quality Gates

Before committing:

1. `npm run ci` — required before every commit/push. Runs skill codegen, TypeScript compilation, ESLint, prek hooks, knip (unused deps/exports), vitest with coverage thresholds, and esbuild bundling.
2. After any code change, run `npm run compile && npm run build` — the extension loads from `dist/` (esbuild bundles) and stale bundles mask bugs.
3. Optionally run `prek install` to activate git hooks for commit-time validation.

For iterative development, `npm run check` (compile + lint + test without coverage or build) is acceptable.

## Versioning

Dynamic versioning from git tags via `tools/version.mts`:

- Clean release tag (e.g., `v26.4.4`) → version `26.4.4`
- Between releases → patch = seconds since last tag (pre-release builds)

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

- **lint** → **build-and-test** (Node 20, 22) → **integration** → **ui** → **package**
- **Windows + WSL2** tests (`.github/workflows/wsl2-ui.yml`)
- **docs** deployment (`.github/workflows/docs-deploy.yml`)
- **release** — VS Code Marketplace + Open VSX (`.github/workflows/release-vsix.yml`)

## Key Conventions

- Use `npm` (the repo uses npm workspaces with `package-lock.json`)
- Conventional commits with scopes
- TypeScript strict mode; ES2022 target
- Import aliases: `@src`, `@ansible/common`, `@ansible/services`, etc. (esbuild aliases in `scripts/build.mjs`)
- All packages bundled by esbuild into `dist/` for distribution
