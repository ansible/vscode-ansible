# Agent Configuration — vscode-ansible (`next` branch)

Read this file before touching code. It defines the architectural
invariants and operational rules for the `next` branch.

## New Developer Detection

On your **first interaction** in this workspace, check whether the
developer is new to the codebase:

```bash
git log --author="$(git config user.name)" --oneline next -- | head -1
```

If this returns empty (no commits on `next`), offer the `onboard`
skill:

> "It looks like this may be your first time working in this codebase.
> Would you like me to walk you through the architecture, ADRs, and
> development workflows? (Just say `/onboard` or skip to your task.)"

Also offer onboarding if the developer asks orientation questions like
"how does this work", "where is X", "what's the structure", or "I'm
new here".

## Architectural Invariants

These are non-negotiable. Violating any of them will break the system
or create debt that compounds across packages. Do **not** work around
them — if you think one needs to change, write an ADR first (see the
`write-adr` skill).

Full rationale for each invariant is in
[ADR-005](.sdlc/adrs/ADR-005-architectural-invariants.md).
Package architecture is in [ADR-011](.sdlc/adrs/ADR-011-package-architecture.md).

1. **Browser-safe code lives in `@ansible/common`, Node.js services in
   `@ansible/services`** (ADR-011). Types, prompts, pure parsers, and
   utils go in `packages/common/`. Services that use `fs`, `path`,
   `child_process`, or `https` go in `packages/services/`.

2. **`@ansible/common` has zero dependencies on Node.js builtins or
   `vscode`** (ADR-011). It must be importable in any JS environment
   (browser, webview, Node, Deno). `@ansible/services` uses the
   conditional `try { vscode = require('vscode') } catch {}` pattern.

3. **The plugin doc cache is the single source of truth** (ADR-002).
   Never spawn `ansible-doc --json` for one plugin when the cache is
   populated. Use `CollectionsService.getPluginDocumentation()`.

4. **No direct LLM/AI provider coupling.** Use `vscode.lm` or
   `LlmService`. Never import a specific LLM SDK (OpenAI, Anthropic,
   etc.) into the extension or packages.

5. **ansible-creator is the source of truth for content scaffolding**
   (ADR-004). No hardcoded templates. Use `CreatorService` and the
   schema-driven `CreatorFormPanel`.

6. **Execution environments use dev containers, not container exec**
   (ADR-003). No `docker exec` / `podman exec` routing. EE development
   uses VS Code Dev Containers.

7. **Tools are discovered from the active Python environment**
   (ADR-004). Use `CommandService`. No per-tool path config properties.

8. **Collection operations use ADE, not ansible-galaxy directly.**
   All install, discovery, and management goes through `ade`. Do not
   invoke `ansible-galaxy` directly.

9. **Every extension capability has an MCP tool equivalent**
   (ADR-012). Any user-facing feature (tree view, command, panel) must
   have a corresponding MCP tool in `@ansible/mcp-server`, and vice
   versa. PRs adding UI without a tool (or a tool without UI) violate
   this invariant.

10. **No write feature may hard-require `python-envs`** (ADR-019).
    Environment creation and package install must work when
    `ms-python.vscode-python-envs` is absent. Use the
    `PythonEnvCapability` tier model: prefer the API (Layer 2), fall
    back to terminal pip/venv (Layer 3). `pip` is the only Layer 3
    package manager.

## Branching Strategy

See the `branching-strategy` skill for full details.

- **`next`** is the active development branch. All PRs target `next`.
- **`main`** is frozen (legacy codebase). Never merge between them.
- Feature branches are created from `upstream/next`.
- PRs require label (`breaking`, `chore`, `feat`, `fix`) and target
  `next` explicitly.

## Quality Gates

### Prerequisites

`npm run ci` requires two tools that are **not** npm dependencies:

- **prek** — pre-commit hook runner (`pipx install prek`)
- **uv** — Python package runner, provides `uvx` (`pipx install uv`)

Both are installed automatically in CI. Contributors must install them
locally before running `npm run ci` or `npm run lint:prek`.

### Before committing

1. `npm run ci` — **required before every commit/push**. Runs skill
   codegen, TypeScript compilation, ESLint, prek hooks (skillmark,
   cspell, markdownlint, actionlint, file hygiene), Vitest with
   coverage thresholds (85/75/85/85), and esbuild bundling. This
   mirrors what CI runs. Do not push if it fails. Do not claim quality
   gates passed without running this command.
2. Verify no architectural invariants (above) were violated.

For iterative development, `npm run check` (compile + lint + test
without coverage thresholds or build) is acceptable. Switch to
`npm run ci` before committing.

### Rebuild after changes

After **any** code change, run `npm run compile && npm run build`.
The extension, MCP server, and language server all load from `dist/`
(esbuild bundles) — stale bundles mask bugs. `npm run ci` includes
both steps, but if you are testing interactively (e.g., reloading the
extension window), rebuild explicitly.

## Commit Format

[Conventional Commits](https://www.conventionalcommits.org). Scopes:
`core`, `ls`, `mcp`, `extension`, `views`, `panels`, `ci`, `docs`, `deps`.

## Project Structure

```
packages/
  common/           → @ansible/common (browser-safe types, prompts, utils, parsers)
  services/         → @ansible/services (Node.js service implementations)
  language-server/  → @ansible/language-server (LSP server)
  mcp-server/       → @ansible/mcp-server (standalone MCP server)
  ui/               → @ansible/ui (shared React components for webviews)
src/
  extension.ts      → VS Code extension entry point
  panels/           → Webview panels
  views/            → TreeView providers
  services/         → VS Code-specific services
  features/         → Editor features (vault, file association)
.sdlc/
  adrs/             → Architecture Decision Records
  todos/            → Project work items (pending/complete)
  templates/        → ADR and todo templates
.agents/
  skills/           → Agent skills for common workflows
```

## Internal Skills (ADR-014)

AI prompt text lives in markdown files under `packages/common/src/skills/`.
Each `.md` file is the **single source of truth** for one AI instruction —
consumed both by the extension (via prompt builders) and by external agents
(via MCP `skill_list` / `skill_get` tools).

### File format

```markdown
---
name: Explain Ansible Plugin
description: Explain a plugin with practical examples
tags: [collections, plugins]
category: domain
triggers: [explain plugin, plugin docs]
---
# Explain Ansible Plugin

Instructions go here...

---
Context is appended below the second separator at runtime.
```

YAML frontmatter provides metadata for MCP discovery. The body after
the closing `---` is the instruction text. Prompt builders call
`stripFrontmatter()` and append dynamic context (plugin name, FQCN, etc.).

### Rules

- **Never hardcode prompt text in TypeScript.** Write a `.md` skill and
  import its generated `.content` sidecar.
- **Run `node scripts/generate-skill-content.mjs`** after adding or
  editing a `.md` skill file. This regenerates the `.content.ts`
  sidecars. Commit both the `.md` and `.content.ts` together.
- **Export every new skill from `packages/common/src/skills/index.ts`**
  so the `SkillRegistry` `builtin` source picks it up.
- **Skills must be browser-safe.** They live in `@ansible/common` and
  must not reference Node.js APIs.
- **Test prompt builders** in `packages/common/test/prompts/` by
  asserting on key fragments the skill must contain.

### Dual consumption paths

| Consumer | How it reads skills |
|----------|---------------------|
| Extension prompt builders | `import skill from '../skills/foo.content'` + `stripFrontmatter()` |
| MCP agents (`skill_list` / `skill_get`) | `SkillRegistry` loads `BUILTIN_SKILLS` with `source: 'builtin'`, `trust: 'certified'` |

## Key Skills

| Skill | When to use |
|-------|-------------|
| `onboard` | First-time developer orientation |
| `submit-pr` | Creating a pull request |
| `pr-review` | Responding to review comments |
| `write-adr` | Architectural decisions (not bug fixes) |
| `manage-todos` | Project work item tracking |
| `branching-strategy` | Understanding next vs main |
| `review-contributor-pr` | Reviewing external contributions |
