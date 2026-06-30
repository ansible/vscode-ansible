# ADR-012: MCP Tool Parity for Extension Capabilities

## Status

Accepted

## Date

2026-06-17

## Context

The Ansible VS Code extension provides a rich interactive experience —
tree views for collections, execution environments, playbooks, and
creator scaffolds; webview panels for plugin docs, EE details, and
progress; and commands for search, filter, install, and AI
summarization. The `@ansible/mcp-server` package exposes a parallel
set of MCP tools so AI agents can perform the same operations
programmatically.

In practice, new features tend to ship with the UI first and the MCP
tool added later — or not at all. The Galaxy browsable tree (PR #2894)
is a concrete example: tree view expansion, filter-in-place, and the
AI sparkle button were implemented first; the `get_galaxy_plugin_doc`
MCP tool was added only after a mid-development review caught the gap.
Had it been missed, an agent could discover Galaxy collections (via
`search_available_collections`) but could never read the docs for a
plugin it found — breaking the discovery → documentation → generation
workflow.

The extension's value proposition depends on a closed loop:

```text
Navigate → Find → Read content → Agent tool → Summarize / Generate
    ↑                                              ↓
    └──────────────────────────────────────────────┘
```

If any step in this loop lacks an MCP equivalent, an agent hits a dead
end. Conversely, if an MCP tool exists but the UI doesn't expose the
same data, human users lose discoverability. Parity in both directions
keeps the loop complete.

### Forces in tension

- **Velocity**: Shipping a tree view is faster than designing an MCP
  tool schema, writing tests, and updating prompts and resources.
- **Consistency**: Agents and humans should have equivalent access to
  every Ansible capability the extension mediates.
- **Maintenance cost**: Each MCP tool is a public API contract; adding
  one carries a long-term support burden.
- **Discoverability**: MCP tools are listed by the server; if the list
  grows too large, agents struggle to select the right tool.

## Decision

**We will require that every user-facing extension capability has a
corresponding MCP tool, and every MCP tool has a corresponding UI
surface.**

Concretely:

1. **Any PR that adds a new tree view node type, command, or webview
   panel must also add (or update) the corresponding MCP tool in
   `@ansible/mcp-server`.** The tool must expose the same data and
   actions available to the UI. The PR must include tests for the new
   tool handler.

2. **Any PR that adds a new MCP tool must ensure the data is
   accessible via the extension UI.** If the tool exposes data that
   has no tree view or panel, the PR must add one (or justify the
   omission in the PR description).

3. **Prompt and resource parity**: When a new tool is added, the MCP
   server's best-practices resource (`get_ansible_best_practices`)
   must be updated to reference it, and any AI prompt builders in
   `@ansible/common` must include the new tool where relevant.

4. **Parity is verified in code review.** The PR checklist (below)
   makes the check explicit. The `ce-agent-native-reviewer` automated
   reviewer already audits for this gap and should continue to be
   dispatched during code reviews.

### PR Checklist Addition

PRs that touch user-facing capabilities must answer:

- [ ] Does this feature have an MCP tool equivalent?
- [ ] Does this MCP tool have a UI equivalent?
- [ ] Are AI prompts and best-practices resources updated?

## Alternatives Considered

### Alternative 1: MCP Tools on Demand

**Description**: Only add MCP tools when an agent or user explicitly
requests them. Treat MCP as an optional power-user surface.

**Pros**:

- Lower upfront cost per feature
- Smaller MCP tool surface to maintain

**Cons**:

- Agents discover gaps at runtime, producing poor UX
- Gaps accumulate silently; no systematic way to detect them
- Breaks the navigate → generate loop for new features

**Why not chosen**: The Galaxy plugin doc gap demonstrated that "add it
later" means "maybe never." Runtime discovery of missing tools wastes
agent tokens and user patience.

### Alternative 2: Auto-generate MCP Tools from Extension Commands

**Description**: Programmatically generate MCP tool definitions by
introspecting registered VS Code commands and their argument schemas.

**Pros**:

- Eliminates manual parity tracking
- Guarantees 1:1 mapping

**Cons**:

- VS Code commands lack typed schemas; many accept opaque tree nodes
- Generated tool descriptions would be poor quality
- No control over tool naming, grouping, or argument validation
- Would expose internal commands (refresh, reveal) that agents
  should not call

**Why not chosen**: The impedance mismatch between VS Code's command
model (untyped, often UI-entangled) and MCP's tool model (typed
schemas, agent-oriented) makes auto-generation impractical. Hand-
authored tools with curated schemas produce better agent experiences.

## Consequences

### Positive

- Agents and humans always have equivalent access to extension
  capabilities
- The discovery → documentation → generation loop is guaranteed
  complete for every feature
- Gaps are caught at PR time, not after deployment
- Forces deliberate API design for agent-facing surfaces

### Negative

- Every new UI feature requires additional MCP tool work, increasing
  the per-feature cost by an estimated 20–30%
- The MCP tool surface grows with the extension; eventually tool
  discovery may need categories or namespaces
- Parity checking is manual (code review); there is no automated
  build-time enforcement yet

### Neutral

- This does not require retroactive tool creation for existing gaps;
  however, known gaps should be tracked as TODOs
- Tools that are purely agent-internal (e.g., `get_ansible_best_practices`)
  do not need a UI equivalent — parity applies to capabilities that
  mediate Ansible operations, not to agent scaffolding

## Implementation Notes

### Current MCP Tool Inventory

| Category      | MCP Tools                                                                                                                                 | UI Surface                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Discovery     | `search_ansible_plugins`, `list_ansible_collections`, `search_available_collections`, `list_source_collections`, `get_collection_plugins` | Collections tree, Collection Sources tree |
| Documentation | `get_plugin_documentation`, `get_galaxy_plugin_doc`                                                                                       | PluginDocPanel webview                    |
| Installation  | `install_ansible_collection`                                                                                                              | Install commands on tree nodes            |
| Generation    | `generate_ansible_task`, `build_ansible_task`, `generate_ansible_playbook`                                                                | AI sparkle commands                       |
| Environments  | `list_execution_environments`, `get_ee_details`                                                                                           | EE tree, EEDetailPanel                    |
| Dev Tools     | `list_ansible_dev_tools`                                                                                                                  | DevTools tree view                        |
| Creator       | `get_ansible_creator_schema`, `ac_*` (dynamic)                                                                                            | CreatorFormPanel                          |
| Skills        | `skill_search`, `skill_list`, `skill_get`, `skill_list_sources`                                                                           | Skills tree view                          |

### Key Files

- MCP tool definitions: `packages/mcp-server/src/tools.ts`
- MCP tool handlers: `packages/mcp-server/src/handlers.ts`
- Extension commands: `src/extension.ts`
- Prompt builders: `packages/common/src/prompts/`
- Best practices resource: `packages/mcp-server/src/server.ts`

### Workflow for New Features

1. Design the UI interaction (tree node, command, panel).
2. Design the MCP tool schema in parallel — what arguments does the
   agent need? What does the response look like?
3. Implement both in the same PR.
4. Update prompt builders if the tool participates in an AI workflow.
5. Update the best-practices resource if the tool changes recommended
   practices.
6. Verify parity in code review using the PR checklist.

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md): Service-based
  architecture — MCP server consumes the same services as the extension
- [ADR-002](ADR-002-centralized-plugin-doc-cache.md): Plugin doc cache
  — shared by both `get_plugin_documentation` tool and PluginDocPanel
- [ADR-005](ADR-005-architectural-invariants.md): Architectural
  invariants — this ADR adds invariant 11
- [ADR-011](ADR-011-package-architecture.md): Package architecture —
  MCP server depends on `@ansible/common` and `@ansible/developer-services`

---

## Revision History

| Date       | Author      | Change           |
| ---------- | ----------- | ---------------- |
| 2026-06-17 | AI-assisted | Initial decision |
