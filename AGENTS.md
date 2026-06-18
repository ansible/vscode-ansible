# Agent Configuration — vscode-ansible (`next` branch)

Read this file before touching code. It defines the architectural
invariants and operational rules for the `next` branch.

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

## Branching Strategy

See the `branching-strategy` skill for full details.

- **`next`** is the active development branch. All PRs target `next`.
- **`main`** is frozen (legacy codebase). Never merge between them.
- Feature branches are created from `upstream/next`.
- PRs require label (`breaking`, `chore`, `feat`, `fix`) and target
  `next` explicitly.

## Quality Gates

Before committing:

1. `npm exec tsc -- -b` — type check all packages
2. `npm exec vitest -- run` — unit tests pass
3. `npm exec eslint -- .` — no lint violations (when eslint config is available)
4. Verify no architectural invariants (above) were violated

## Commit Format

[Conventional Commits](https://www.conventionalcommits.org). Scopes:
`core`, `ls`, `mcp`, `extension`, `views`, `panels`, `ci`, `docs`.

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
| `submit-pr` | Creating a pull request |
| `pr-review` | Responding to review comments |
| `write-adr` | Architectural decisions (not bug fixes) |
| `manage-todos` | Project work item tracking |
| `branching-strategy` | Understanding next vs main |
| `review-contributor-pr` | Reviewing external contributions |
