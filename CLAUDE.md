# CLAUDE.md

## Project Overview

VS Code extension for Ansible — provides language server (LSP), linting, auto-completion, hover docs, collection browsing, and execution environment support. Published to both VS Code Marketplace and Open VSX as `redhat.ansible`.

> **Branch note:** This is the `next` branch (ansible-environments architecture). The `main` branch is a frozen legacy codebase — never merge between them. See the `branching-strategy` skill for details.

## Repository Structure

Monorepo using pnpm workspaces (`packages/*`, `docs`):

- **Root (`src/`)** — VS Code extension entry point, panels, views, and editor features
- **`packages/common/`** — `@ansible/common` — browser-safe types, prompts, utils, parsers (zero Node.js deps)
- **`packages/services/`** — `@ansible/developer-services` — Node.js service implementations (fs, child_process, https)
- **`packages/language-server/`** — `@ansible/language-server` — LSP server
- **`packages/mcp-server/`** — `@ansible/mcp-server` — standalone MCP server for AI assistants
- **`packages/lightspeed/`** — `@ansible/lightspeed` — Lightspeed AI features
- **`packages/ui/`** — `@ansible/ui` — shared React components for webviews
- **`docs/`** — Project documentation (Starlight site)
- **`tools/`** — Build helpers (versioning, release scripts)
- **`scripts/`** — Build and codegen scripts (esbuild, skill content generation)

## Prerequisites

- **Node.js** >= 22.18.0
- **pnpm 11+** — install via `npm install -g pnpm` or enable with Corepack (`corepack enable pnpm`)
- **prek** — pre-commit hook runner (`pipx install prek`)
- **uv** — Python package runner, provides `uvx` (`pipx install uv`)

## Common Commands

Use `pnpm run` (no arguments) to list all available scripts.

### Build & Development

```bash
pnpm install             # Install all dependencies (including workspace packages)
pnpm run compile         # TypeScript compilation (generates skill content + tsc -b)
pnpm run build           # esbuild bundle (extension, language server, MCP server, webview)
pnpm run build:production # Production build (minified, no source maps)
pnpm run watch           # Watch mode for TypeScript
pnpm run watch:bundle    # Watch mode for esbuild
pnpm run package:install # Build .vsix, install into VS Code, clean up
```

### Testing

```bash
pnpm test                # Run all vitest tests (compile + lint first via pretest)
pnpm run test:coverage   # Tests with coverage reporting
pnpm run check           # compile + lint + test (iterative development)
pnpm run ci              # compile + lint + test:coverage + build (pre-commit gate)

# Specific test projects (vitest)
pnpm exec vitest run --project=ext        # Extension tests
pnpm exec vitest run --project=common     # @ansible/common tests
pnpm exec vitest run --project=services   # @ansible/developer-services tests
pnpm exec vitest run --project=mcp        # MCP server tests
pnpm exec vitest run --project=ls         # Language server tests
pnpm exec vitest run --project=lightspeed # Lightspeed tests
pnpm exec vitest run --project=ui         # UI component tests

# Integration tests (VS Code test runner)
pnpm run test:integration

# UI tests (WebDriverIO)
pnpm run pretest:ui                  # Install chromedriver + test extensions (first time)
pnpm run test:ui                     # Run WDIO smoke + language server tests
pnpm run test:lightspeed:ui          # Run WDIO lightspeed tests

# User story coverage (WDIO feature coverage)
node scripts/story-coverage.mjs --threshold 0   # Report coverage
node scripts/story-coverage.mjs --threshold 20   # CI gate (exits non-zero if below)
```

### User Story Coverage

WDIO tests track coverage against user stories in `.sdlc/user-stories.yaml`.
Tag `describe` blocks with `@covers STORY-ID` (e.g., `@covers XC-002`).
New user-facing functionality should have a user story added — use the
`define-user-story` agent skill or add manually. See ADR-023.

### Linting

```bash
pnpm run lint            # All linters via prek (eslint, knip, cspell, markdownlint, actionlint, file hygiene)
pnpm run lint:eslint     # ESLint only (via prek hook)
pnpm run lint:knip       # Unused files, deps, and exports (via prek hook)
```

### Packaging & Release

```bash
pnpm run package         # Create .vsix (no dependencies bundled — esbuild handles it)
```

### Documentation

```bash
pnpm run docs:dev        # Start docs dev server
pnpm run docs:build      # Build docs site
pnpm run docs:preview    # Preview built docs
```

## Testing Framework

- **Vitest** for unit/integration tests — configured with projects: `ext`, `common`, `services`, `mcp`, `ls`, `lightspeed`, `ui`
- **WebDriverIO** for UI/browser tests (`test/ui/`), tracked against user stories in `.sdlc/user-stories.yaml`
- **VS Code Test CLI** for extension integration tests (`test/integration/`)
- Path aliases in tests: `@src/*` → `src/*`

## Code Quality

- **ESLint** — TypeScript/JavaScript linting (`eslint.config.mjs`)
- **prek** — Git hook manager (`prek.toml`); runs eslint, knip, cspell, markdownlint, actionlint, file hygiene, commitlint, and the custom skill frontmatter checker
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

1. `pnpm run ci` — required before every commit/push. Runs skill codegen, TypeScript compilation, prek hooks (eslint, knip, cspell, markdownlint, actionlint, file hygiene), vitest with coverage thresholds, and esbuild bundling.
2. After any code change, run `pnpm run compile && pnpm run build` — the extension loads from `dist/` (esbuild bundles) and stale bundles mask bugs.
3. Optionally run `prek install` to activate git hooks for commit-time validation.

For iterative development, `pnpm run check` (compile + lint + test without coverage or build) is acceptable.

## Versioning

Dynamic versioning from git tags via `tools/version.mts`:

- Clean release tag (e.g., `v26.4.4`) → version `26.4.4`
- Between releases → patch = seconds since last tag (pre-release builds)

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

- **next** workflow — matrix Node 22/24/26 (lint, test, UI, package artifacts)
- **Windows + WSL2** tests (`.github/workflows/wsl2-ui.yml`)
- **docs** deployment (`.github/workflows/docs-deploy.yml`)
- **release** — VS Code Marketplace + Open VSX (`.github/workflows/release-vsix.yml`)

## Key Conventions

- Use `pnpm` (the repo uses pnpm workspaces with `pnpm-lock.yaml`)
- Conventional commits with scopes
- TypeScript strict mode; ES2022 target
- Import aliases: `@src`, `@ansible/common`, `@ansible/developer-services`, etc. (esbuild aliases in `scripts/build.mjs`)
- All packages bundled by esbuild into `dist/` for distribution
