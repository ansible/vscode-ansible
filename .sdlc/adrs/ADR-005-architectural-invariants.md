# ADR-005: Architectural Invariants

## Status

Accepted

## Date

2026-05-26

## Context

The `next` branch establishes a new architecture for the Ansible VS
Code extension (ADR-001 through ADR-004). As multiple contributors
and AI agents work on the codebase, there is a risk of architectural
erosion — adding functionality in the wrong layer, coupling to
specific providers, bypassing shared services, or reimplementing
solved problems.

This ADR codifies the non-negotiable invariants that protect the
architecture. Violating any of them creates compounding debt across
packages. If an invariant needs to change, write a new ADR first.

## Decision

**The following invariants are enforced for all code on the `next`
branch. They are referenced from `AGENTS.md` and must be checked
before every commit.**

### 1. Domain logic lives in `@ansible/core`, not in the extension (ADR-001)

Services that operate on Ansible concepts (collections, plugins,
environments, creator schemas, execution environments) belong in
`packages/core/`. The extension (`src/`) contains only VS Code-specific
code: panels, views, tree providers, and editor integrations.

**Test**: If a new service could be useful to the MCP server or
language server, it belongs in `@ansible/core`.

### 2. `@ansible/core` has zero hard dependencies on `vscode` (ADR-001)

All VS Code API usage in `packages/core/` uses the conditional pattern:

```typescript
let vscode: typeof import('vscode') | undefined;
try { vscode = require('vscode'); } catch {}
```

An unconditional `import * as vscode from 'vscode'` in any core file
breaks the MCP server and language server. This is non-negotiable.

### 3. The plugin doc cache is the single source of truth (ADR-002)

Never spawn `ansible-doc --json` for a single plugin when the cache is
populated. All documentation consumers — hover, PluginDocPanel, MCP
tools, completion — go through
`CollectionsService.getPluginDocumentation()`.

### 4. No direct LLM/AI provider coupling

AI features use VS Code's `vscode.lm` API or the `LlmService`
abstraction. Never import a specific LLM SDK (OpenAI, Anthropic,
Ollama, etc.) directly into the extension or its packages. The
extension delegates model selection to the editor. This keeps the
extension vendor-neutral and avoids bundling large SDK dependencies.

### 5. ansible-creator is the source of truth for content scaffolding (ADR-004)

The extension does not hardcode scaffold templates, starter playbooks,
or project structures. All content creation flows through
`CreatorService` and the schema-driven `CreatorFormPanel`. If a new
scaffold type is needed, it is added to ansible-creator — the
extension picks it up automatically via the schema.

### 6. Execution environments use dev containers, not container exec (ADR-003)

Do not add `docker exec` / `podman exec` routing to run tooling inside
EE containers. EE-based development uses VS Code Dev Containers with
an `ansible-dev-tools` layer. The extension inspects EE images (tree
view) and builds them (`ansible-builder`) but does not run inside them.

### 7. Tools are discovered from the active Python environment (ADR-004)

Services use `CommandService` to find tools (`ansible-doc`,
`ansible-lint`, `ansible-playbook`, `ansible-navigator`, `ade`, etc.)
in the active venv's bin directory. Do not add per-tool path
configuration properties (e.g., `ansible.ansibleNavigator.path`).
Tool availability is a function of the environment, not user config.

### 8. Collection operations use ADE, not ansible-galaxy directly

All collection installation, discovery, and management goes through
`ade` (Ansible Development Environment tool). Do not invoke
`ansible-galaxy collection install` or `ansible-galaxy collection list`
directly. ADE provides consistent venv-aware behavior, unified
logging, and a stable interface that insulates the extension from
ansible-galaxy CLI changes. `CollectionsService.installCollection()`
already enforces this.

### 9. Domain content views live in `@ansible/ui` (ADR-010)

All views that render domain content (EE details, plugin docs,
playbook progress, creator forms) are React components in
`packages/ui/`. Host environments (VS Code webviews, Navita,
Backstage) provide a bridge implementation but do not contain domain
rendering logic. New content views go in `@ansible/ui`, not in
`src/panels/` or `packages/navita/`.

### 10. Shared UI components never import host-specific modules (ADR-010)

`@ansible/ui` components communicate with the host exclusively
through the `HostBridge` interface hierarchy. An `import ... from
'vscode'` or `window.navitaAPI` call in `packages/ui/` is a
violation — the component must use `useBridge()` instead.

### 11. Every extension capability has an MCP tool equivalent (ADR-012)

Any user-facing feature (tree view, command, webview panel) must have
a corresponding MCP tool in `@ansible/mcp-server`, and vice versa.
This keeps the discovery → documentation → generation loop complete
for both human users and AI agents. A PR that adds a tree view node
or command without an MCP tool (or adds a tool without a UI surface)
violates this invariant.

**Test**: If a human can perform an action via the extension UI, an
agent must be able to perform the same action via an MCP tool.

### 12. MCP tools and skills conform to documented best practices (ADR-018)

Tools must have behavioral annotations (`readOnlyHint`,
`destructiveHint`, `idempotentHint`), valid `inputSchema` with
`type: "object"`, server-side input validation, and machine-readable
error responses with recoverability signals. Skills must conform to
the agentskills.io frontmatter spec and support three-level
progressive disclosure. The compliance checklist in ADR-018 is the
authority.

**Test**: If a new tool is added without behavioral annotations or a
new skill lacks valid frontmatter, the PR violates this invariant.

## Consequences

### Positive

- Clear boundaries prevent architectural erosion as the contributor
  base grows
- AI agents can check invariants mechanically before committing
- New contributors understand the "why" behind structural decisions
- Reduces code review burden — invariant violations are objective,
  not subjective

### Negative

- Invariants constrain implementation choices; some shortcuts are
  off-limits even when they would be faster
- Requires discipline to write an ADR before changing an invariant

### Neutral

- The invariant list will grow as new architectural decisions are made
- Each invariant should reference the ADR that established it

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md): Service-based
  architecture (invariants 1, 2)
- [ADR-002](ADR-002-centralized-plugin-doc-cache.md): Plugin doc
  cache (invariant 3)
- [ADR-003](ADR-003-ee-via-devcontainers.md): EE via dev containers
  (invariant 6)
- [ADR-004](ADR-004-intentional-exclusions-from-main.md): Intentional
  exclusions (invariants 5, 7)
- [ADR-010](ADR-010-shared-ui-component-layer.md): Shared UI component
  layer (invariants 9, 10)
- [ADR-012](ADR-012-mcp-tool-parity.md): MCP tool parity
  (invariant 11)
- [ADR-018](ADR-018-mcp-skills-compliance.md): MCP and skills
  compliance policy (invariant 12)

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-05-26 | AI-assisted | Initial invariants (8 rules) |
| 2026-06-10 | AI-assisted | Add invariants 9, 10 (shared UI) |
| 2026-06-17 | AI-assisted | Add invariant 11 (MCP tool parity) |
| 2026-06-23 | AI-assisted | Add invariant 12 (MCP/skills compliance) |
