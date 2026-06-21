# CLAUDE.md

## Project Overview

VS Code extension for Ansible — provides language server (LSP), linting, auto-completion, hover docs, and AI-powered Lightspeed features. Published to both VS Code Marketplace and Open VSX as `redhat.ansible`.

## Repository Structure

Monorepo using npm workspaces (`packages/*`):

- **Root (`src/`)** — VS Code extension (TypeScript + ESBuild)
- **`packages/ansible-language-server/`** — Ansible Language Server (LSP), published to npm as `@ansible/ansible-language-server`
- **`packages/ansible-mcp-server/`** — MCP server for AI assistant integration, published as `@ansible/ansible-mcp-server`
- **`webviews/`** — Vue 3 UI components (Lightspeed, settings panels)
- **`docs/`** — Project documentation, development guides
- **`tools/`** — Build helpers (versioning, release scripts)

## Prerequisites

- **Node.js** >= 24.13.1
- **npm** (bundled with Node.js; the repo uses npm workspaces)
- **Python** 3.11–3.14 with `uv` for dependency management
- **Task** (taskfile.dev) — primary build orchestrator

## Common Commands

### Build & Development

```bash
task setup          # Initial setup (install deps, build)
task build          # Full build (extension + packages)
task watch          # Watch mode for development
npm run compile     # Compile TypeScript
task code           # Install .vsix into VS Code
```

### Testing

```bash
task test           # Run all tests
task unit           # Unit tests only (vitest)
task e2e            # E2E tests (VS Code test runner)
task wdio           # WebDriverIO UI tests

# ALS tests specifically
cd packages/ansible-language-server
npm run test                    # All ALS tests (vitest --project=als)
SKIP_PODMAN=1 SKIP_DOCKER=1 npm run test-without-ee  # Skip container tests

# Run a specific test file
npx vitest run --project=als -- test/services/schemaService.test.ts
```

### Lightspeed Testing

```bash
# Unit tests (125 tests)
npm run test:lightspeed                          # or: npx vitest run --project=lightspeed

# E2E / WDIO tests (6 tests — requires built extension)
npm run pretest:wdio                             # Pre-install chromedriver + test extensions (first time)
npm run compile && npm run build                 # Build extension
npm run build:lightspeed:webviews                # Build Vue webviews
npm run test:lightspeed:ui                       # Run lightspeed E2E tests

# All WDIO tests (smoke + language server + lightspeed)
npm run test:ui
```

### Linting & Formatting

```bash
task lint           # Run all linters (biome, eslint, prek hooks)
prek run -a -v      # Run all pre-commit hooks directly
```

### Packaging & Release

```bash
task package        # Create .vsix and npm tarballs
task release        # Prepare release (tag-based versioning via tools/version.mts)
```

## Testing Framework

- **Vitest** for unit/integration tests — configured with projects: `ext`, `als`, `mcp`, `vue`
- **WebDriverIO** for UI/browser tests (`test/wdio/`)
- **VS Code Test CLI** for extension integration tests
- Test helpers in `packages/ansible-language-server/test/helper.ts` (mock connections, fixtures)
- Path aliases in tests: `@src/*` → `src/*`, `@test/*` → `test/*`

## Code Quality

- **Biome** — TypeScript/JavaScript formatting and linting (`biome.json`)
- **ESLint** — additional lint rules (`eslint.config.mjs`)
- **prek** — pre-commit hooks (replaces pre-commit; config in `.pre-commit-config.yaml`)
- **commitlint** — conventional commit messages enforced (e.g., `fix(als):`, `feat:`, `test:`)
- **cspell/codespell** — spell checking; custom dictionary at `.config/dictionary.txt`
- **PR labels** — required: one of `breaking`, `chore`, `feat`, `fix` (enforced by `ack` CI job)

## Versioning

Dynamic versioning from git tags via `tools/version.mts`:
- Clean release tag (e.g., `v26.4.4`) → version `26.4.4`
- Between releases → patch = seconds since last tag (pre-release builds)

## CI/CD

GitHub Actions (`.github/workflows/ci.yaml`):
- **lint** → **preflight** → **build** → **test** (linux, macos, wsl, wdio) → **check**
- **publish** — VS Code Marketplace + Open VSX (on release event)
- **publish-npm** — npm packages (on release event)
- Release triggered by creating a GitHub Release from a git tag

## Key Conventions

- Use `npm` (the repo uses npm workspaces with package-lock.json)
- Conventional commits: `fix(als):`, `feat:`, `test(ui):`, `chore(deps):`
- TypeScript strict mode; ES2022 target
- Import aliases: `@src`, `@webviews`, `@root` (ESBuild paths)
- ALS builds to both ESM (`dist/cli.js`) and CJS (`dist/cli.cjs`) — the `bin` field uses CJS
- The `NODE_ENV=production npm run compile` command in ALS produces the production bundle
