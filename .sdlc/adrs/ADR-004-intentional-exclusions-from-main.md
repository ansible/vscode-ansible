# ADR-004: Intentional Feature Exclusions from main

## Status

Accepted

## Date

2026-05-26

## Context

A comprehensive gap analysis between `main` and `next` identified
features present in `main` (excluding Lightspeed) that do not exist
in `next`. Some of these gaps are intentional — the `next` architecture
handles the same user need differently or the feature is no longer
appropriate. This ADR records those decisions to prevent them from
resurfacing in future gap analyses.

## Decision

**The following features from `main` will NOT be ported to `next`.
Each has a rationale tied to an architectural difference or a
deliberate design choice.**

### 1. `ansible.playbook.arguments` config property

**What it did**: A single string setting appended to every
`ansible-playbook` invocation.

**Why excluded**: `next` has `PlaybookConfigPanel`, a webview form
with per-playbook and global default run configuration (inventory,
limits, tags, extra vars, etc.). This is a richer, more discoverable
approach. A raw string arg field encourages unstructured, error-prone
input.

### 2. Welcome / ADT hub panel (`WelcomePagePanel`, `ansible-home`)

**What it did**: A sidebar webview showing system readiness checks,
tool versions, and shortcut links.

**Why excluded**: `next`'s sidebar is composed of purpose-built tree
views (environments, packages, collections, EE, Creator, playbooks,
MCP tools) that provide more granular, actionable information. A
monolithic "hub" panel adds no value when the tree views already
surface the same data in context.

### 3. Content Creator hardcoded webview panels (7 panels)

**What they did**: Seven separate Vue panels, one per scaffold type
(collection, project, devfile, EE definition, plugin, role,
devcontainer).

**Why excluded**: `next`'s `CreatorFormPanel` dynamically generates
forms from the ansible-creator CLI schema. New scaffold types are
automatically supported when ansible-creator adds them — no extension
code changes required. A separate todo covers validating that the
dynamic form handles all field-level validation the hardcoded panels
provided.

### 4. `ansible.completion.provideRedirectModules` config property

**What it did**: Toggle to include redirected/legacy module short names
in completions (e.g., `copy` instead of `ansible.builtin.copy`).

**Why excluded**: Redirected module names are flagged by ansible-lint's
FQCN rule. `ansible-lint --fix` auto-corrects them. Including legacy
names in completions encourages the pattern that lint then flags —
contradictory guidance. The completion provider should only offer
FQCNs.

### 5. `ansible.ansibleNavigator.path` config property

**What it did**: Manual path override for the ansible-navigator
executable.

**Why excluded**: `next`'s `DevToolsService` and `CommandService`
discover tools from the active Python environment's bin directory
automatically. If ansible-navigator is installed via
`ansible-dev-tools`, it is found without manual configuration. A
separate todo covers adding ansible-navigator run support; it will
use the existing service discovery, not a manual path setting.

### 6. MCP server enable/disable toggle commands

**What they did**: `ansible.mcpServer.enabled` and
`ansible.mcpServer.disable` toggled a setting and registered/
unregistered the MCP server provider.

**Why excluded**: `next` handles MCP configuration differently with
`ansibleMcpTools.configure` (opens MCP config) and
`ansible-environments.configureCursorMcp` (writes Cursor MCP config).
The MCP server is also registered as a VS Code `mcpServerDefinition`
provider, making it discoverable by Copilot without manual toggling.

### 7. DocsLibrary (module source indexing)

**What it did**: Indexed Ansible module documentation by parsing
Python source files and `meta/runtime.yml`, providing source file
paths and line ranges for go-to-definition.

**Why excluded**: Replaced by the centralized plugin doc cache
(ADR-002). The `--metadata-dump` output provides the same
documentation without parsing Python source. Go-to-definition will
open the `PluginDocPanel` webview instead of raw Python files (see
pending todo). The source-file-based approach required filesystem
access to collection installations and broke in container/remote
scenarios.

## Consequences

### Positive

- Future gap analyses can reference this ADR instead of re-evaluating
  each exclusion
- Contributors understand why these features don't exist in `next`
- Prevents accidental reimplementation of superseded patterns

### Negative

- Users migrating from `main` may miss specific features; migration
  documentation should reference this ADR to explain the differences

### Neutral

- Some excluded features have successor implementations in `next`
  (PlaybookConfigPanel, CreatorFormPanel, service discovery). Users
  get the same capability through a different interface.

## Related Decisions

- [ADR-002](ADR-002-centralized-plugin-doc-cache.md): Replaces
  DocsLibrary
- [ADR-003](ADR-003-ee-via-devcontainers.md): Replaces EE mode
  settings

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-05-26 | AI-assisted | Initial record of gap analysis exclusions |
