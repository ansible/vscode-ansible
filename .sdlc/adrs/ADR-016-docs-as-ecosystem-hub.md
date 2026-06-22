# ADR-016: Documentation Site as Ecosystem Hub

## Status

Implemented

## Date

2026-06-22

## Context

The `main` branch documentation (Zensical/MkDocs, hosted on Read the
Docs) is scoped to the VS Code extension. Its title is "Ansible VS Code
Extension," its navigation is extension-centric, and the Python CLI
tools it depends on (ansible-lint, ansible-creator, ansible-navigator)
are mentioned only as prerequisites.

This framing has problems:

1. **Fragmented onboarding.** A developer adopting Ansible tooling must
   discover and piece together documentation for ADT, ADE, individual
   CLI tools, the VS Code extension, the Language Server, and the MCP
   server — each with its own README or docs site. There is no single
   entry point.
2. **Editor lock-in.** Titling the docs "VS Code Extension" implies the
   tooling only works in VS Code. The Language Server works in any
   LSP-compatible editor; the MCP server works with any MCP client
   (Cursor, Copilot, Claude Code). The name undersells the reach.
3. **Ecosystem evolution.** The `next` branch adds MCP server support,
   making Ansible tooling accessible to AI agents outside any editor.
   Framing the docs around VS Code doesn't accommodate this.

## Decision

**The documentation site is titled "Ansible Developer Tools" and
structured as an ecosystem hub covering all Ansible development
tooling, not just the VS Code extension.**

The site navigation is organized by capability area, not by artifact:

- **Getting Started** — ecosystem overview, installation, configuration
- **Python Tools** — ADT, ADE, ansible-lint, ansible-creator,
  ansible-navigator (overview pages linking to each tool's own docs)
- **Editor Integration** — VS Code extension, Language Server, settings
- **AI & Agents** — MCP server, connecting AI agents
- **Development** — contributing, architecture, testing
- **Reference** — commands, best practices
- **Roadmap** — feature plans

The Python Tools pages link to each tool's canonical documentation
(Read the Docs, PyPI, GitHub) rather than duplicating it. The docs site
provides integration context — how the tools work together and how they
connect to the editor and AI agent layers.

## Alternatives Considered

### A1: Keep extension-scoped docs

Continue the `main` pattern: title the site "Ansible VS Code Extension"
and document only extension-specific features.

**Pros:** Narrower scope, less content to maintain.

**Cons:** Perpetuates fragmentation. Doesn't accommodate the MCP server,
Language Server standalone usage, or future editor support. Users must
find and read multiple documentation sources.

**Why not chosen:** The `next` branch already provides capabilities
beyond VS Code (MCP server, standalone Language Server). The docs should
reflect this.

### A2: Use "Ansible Developer Tools" as the extension name

Rename the VS Code extension itself to "Ansible Developer Tools,"
matching the Python meta-package (`ansible-dev-tools`).

**Pros:** Strong brand alignment.

**Cons:** Creates confusion between the Python package and the VS Code
extension. Users searching PyPI for "ansible-dev-tools" would find the
Python package; users searching the VS Code marketplace would find the
extension. Same name, different artifacts, different install methods.

**Why not chosen:** "Ansible Developer Tools" works as a documentation
umbrella without being a product name collision. The extension keeps its
own marketplace identity.

## Consequences

### Positive

- **Single entry point.** New developers find one site that maps the
  full tooling landscape and guides them to the right component.
- **Editor-agnostic positioning.** The site accommodates future editor
  support (Neovim, JetBrains) without restructuring.
- **AI-era ready.** The MCP server and agent connectivity have a
  first-class home rather than being buried in extension features.
- **Reduced duplication.** Python tool pages link to canonical docs
  rather than rewriting them.

### Negative

- **Broader maintenance scope.** The site references tools maintained by
  other teams. Links and descriptions can drift.
- **Naming ambiguity.** "Ansible Developer Tools" as a docs title could
  be confused with the `ansible-dev-tools` Python package. The site
  should make the distinction clear on the landing page.

### Neutral

- The VS Code extension marketplace listing retains its own name and
  description. The docs site is complementary, not a replacement for
  marketplace metadata.

## Related Decisions

- [ADR-004](ADR-004-intentional-exclusions-from-main.md) — Intentional
  Feature Exclusions from `main`
- [ADR-012](ADR-012-mcp-tool-parity.md) — MCP Tool Parity (supports the
  "AI & Agents" section existing as a first-class docs category)
- [ADR-015](ADR-015-lightspeed-standalone-package.md) — Lightspeed as
  Standalone Opt-In Package (Lightspeed is excluded from the docs site
  per its temporary status)

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-06-22 | — | Initial record |
