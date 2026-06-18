---
name: onboard
description: >
  Walk a new developer through the project architecture, ADRs,
  development workflows, and codebase structure. Use when the user says
  "onboard me", "walk me through the project", "I'm new here", "help me
  get started", "show me the architecture", or any variant of asking for
  an orientation to the ansible-environments codebase.
argument-hint: "[--quick] [--topic architecture|workflows|adrs|skills]"
user-invocable: true
metadata:
  author: ansible-environments team
  version: 1.0.0
---

# Developer Onboarding

Guide a new developer through the project step by step. This is an
**interactive** skill — present each section, pause for questions, and
adapt depth based on the developer's experience.

## Workflow

Run through these sections in order. After each section, ask if the
developer has questions before proceeding.

If the user passes `--quick`, give a condensed overview (one paragraph
per section, skip the deep dives). If `--topic <topic>` is given, jump
directly to that section.

### Section 1: Project Overview

Read and present `CONTRIBUTING.md` (prerequisites, setup, daily
workflow). Confirm the developer has:

- Node.js 22+ and npm 10+
- VS Code installed
- The repo cloned and `npm ci` completed

Then run:

```bash
npm run compile && npm run build
```

Verify both succeed. If not, troubleshoot before continuing.

### Section 2: Architecture

Read and present `AGENTS.md`, focusing on:

1. **Package architecture** — explain the five packages and their
   dependency rules:
   - `@ansible/common` — browser-safe, zero Node.js dependencies
   - `@ansible/services` — Node.js services, conditional `vscode` require
   - `@ansible/language-server` — LSP server
   - `@ansible/mcp-server` — standalone MCP server for AI agents
   - `@ansible/ui` — shared React webview components

2. **Extension host** (`src/`) — panels, views, services, features

3. **The nine architectural invariants** — read each one aloud. These
   are non-negotiable and the most important thing for a new developer
   to internalize.

Point to `AGENTS.md` for the full reference.

### Section 3: Architecture Decision Records

Read `.sdlc/adrs/README.md` to list all ADRs. Walk through the key
ones in this order:

| ADR | Why it matters for onboarding |
|-----|-------------------------------|
| ADR-001 | Foundational: why we have a service layer separate from VS Code |
| ADR-011 | Package split: `@ansible/common` vs `@ansible/services` |
| ADR-005 | The invariants — explains *why* each rule exists |
| ADR-006 | esbuild bundler — how the build works |
| ADR-014 | Internal skills — how AI prompts are managed |
| ADR-012 | MCP tool parity — every UI feature needs an MCP tool |

For each ADR, summarize the **Decision** and **Consequences** sections.
Don't read them verbatim — explain them conversationally.

Skip ADRs that are `Proposed` or `Deprecated` unless the developer asks.

### Section 4: Development Workflows

Walk through the daily development loop:

1. **Branching** — read the `branching-strategy` skill. Key point:
   `next` is the active branch, `main` is frozen, never merge between
   them. All feature branches come from `upstream/next`.

2. **Edit → Check → Iterate cycle**:
   ```bash
   npm run check    # compile + lint + test (fast feedback)
   ```

3. **Before committing**:
   ```bash
   npm run ci       # compile + lint + test:coverage + build
   ```
   This mirrors CI. Do not push if it fails.

4. **Submitting a PR** — point to the `submit-pr` skill. Key points:
   - Conventional Commits with project scopes
   - Labels required (`breaking`, `chore`, `feat`, `fix`)
   - Target `next`, never `main`
   - Single commit, draft until CI green

5. **Handling PR review** — point to the `pr-review` skill. Key points:
   - Reply to every comment with explanation + commit hash
   - Resolve threads explicitly
   - Common Copilot patterns to watch for

6. **Testing the extension locally**:
   ```bash
   npm run package           # package VSIX only
   npm run package:install   # package + install into VS Code
   ```
   After `package:install`, reload VS Code to activate the updated
   extension. Press `F5` for a lighter-weight Extension Development
   Host (uses the dev build without packaging).

### Section 5: Internal Skills and AI Integration

Explain the dual-consumption model for AI prompts:

1. **Internal skills** live in `packages/common/src/skills/*.md` as
   markdown with YAML frontmatter.
2. **Codegen** produces `.content.ts` sidecars (`node scripts/generate-skill-content.mjs`).
3. **Prompt builders** in `packages/common/src/prompts/` import
   `.content` files and append dynamic context.
4. **MCP agents** discover skills via `skill_list` / `skill_get` tools
   through the `SkillRegistry` `builtin` source.

Point to ADR-014 for the full rationale.

### Section 6: Key Services Tour

Briefly explain the major services — what each one does, not how it
works internally:

| Service | What it does |
|---------|-------------|
| `CollectionsService` | Plugin doc cache, collection discovery |
| `CommandService` | Runs CLI tools from the active Python env |
| `CreatorService` | Scaffolds content via `ansible-creator` |
| `ExecutionEnvService` | EE image listing and inspection |
| `SkillRegistry` | AI skill discovery and indexing |
| `EECache` / `EnvironmentCache` | Caching layers for EE and env data |
| `SCMDocsCache` | Plugin docs from Git repos (shallow clone) |

Point to `packages/services/src/` for the implementations.

### Section 7: Testing

Explain the test structure:

- **Unit tests** (`vitest`) — in `packages/*/test/` and `test/unit/`
- **Integration tests** — `test/integration/` (requires VS Code test runner)
- **UI tests** (`wdio`) — `test/ui/` (requires display server)
- **Coverage thresholds** — 85% statements, 75% branches, 85%
  functions, 85% lines (enforced by `npm run test:coverage`)

Show how to run tests:

```bash
npm test              # quick unit tests
npm run test:coverage # with thresholds (matches CI)
npm run test:ui       # e2e (requires display)
```

### Section 8: Common Pitfalls

Read the "Common pitfalls" table from `CONTRIBUTING.md` and walk
through each one. These are the mistakes that have caused the most
rework historically:

- Wrong Node version (ESLint 10 needs Node 20+)
- Stale bundles after changes
- Partial lint (single file vs full project)
- Forgetting skill codegen after editing `.md` files
- CI vs local environment mismatch

### Section 9: Available Agent Skills

List all skills in `.agents/skills/` with a one-line description of
when to use each:

| Skill | When to use |
|-------|-------------|
| `onboard` | First-time project orientation (you are here) |
| `submit-pr` | Creating a pull request |
| `pr-review` | Responding to review comments |
| `write-adr` | Architectural decisions |
| `manage-todos` | Project work item tracking |
| `branching-strategy` | Branch questions (next vs main) |
| `review-contributor-pr` | Reviewing external contributions |

### Wrap-up

Ask the developer:

1. Do you have questions about any section?
2. Is there a specific area of the codebase you want to explore first?
3. Do you have a task or issue to start working on?

If they have a task, suggest the appropriate workflow (e.g.,
`submit-pr` for a new feature, `write-adr` for an architectural
change).
