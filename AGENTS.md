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

1. **Domain logic lives in `@ansible/core`, not in the extension**
   (ADR-001). If a service could be used by the MCP server or language
   server, it belongs in `packages/core/`, not `src/`.

2. **`@ansible/core` has zero hard dependencies on `vscode`**
   (ADR-001). Use the conditional `try { vscode = require('vscode') }
   catch {}` pattern. An unconditional `import` breaks MCP and LS.

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
  core/             → @ansible/core (VS Code-independent services)
  language-server/  → @ansible/language-server (LSP server)
  mcp-server/       → @ansible/mcp-server (standalone MCP server)
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

## Key Skills

| Skill | When to use |
|-------|-------------|
| `submit-pr` | Creating a pull request |
| `pr-review` | Responding to review comments |
| `write-adr` | Architectural decisions (not bug fixes) |
| `manage-todos` | Project work item tracking |
| `branching-strategy` | Understanding next vs main |
| `review-contributor-pr` | Reviewing external contributions |
