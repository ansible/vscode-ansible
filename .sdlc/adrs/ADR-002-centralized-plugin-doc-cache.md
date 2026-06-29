# ADR-002: Centralized Plugin Documentation Cache

## Status

Implemented

## Date

2026-05-26

## Context

`CollectionsService` (in `@ansible/core`, see [ADR-001](ADR-001-service-based-architecture.md)) is the single service responsible for discovering and indexing Ansible collections and their plugins. Multiple consumers need plugin documentation:

- **Hover provider** (language server): Shows full documentation when the user hovers over a module FQCN.
- **PluginDocPanel** (VS Code webview): Renders rich, searchable plugin documentation.
- **MCP server**: Returns plugin documentation to AI assistants via `get_plugin_doc` tool.
- **Completion provider** (language server): Displays short descriptions in the completion list.

### The problem: redundant subprocess calls

`CollectionsService` already runs `ansible-doc --metadata-dump` during collection discovery. This single command returns the **complete** documentation for every installed plugin — full docstrings, options with types and defaults, examples, return values, and metadata. The output is typically 20-50 MB of JSON depending on the number of installed collections.

However, the original implementation discarded almost all of this data. The `MetadataEntry` parsing type extracted only three fields per plugin:

```typescript
interface MetadataDoc {
    plugin_name?: string;
    short_description?: string;
    collection?: string;
}
```

When a consumer later requested full documentation (e.g., user hovers over `ansible.builtin.copy`), `getPluginDocumentation()` spawned a **new** `ansible-doc --json "ansible.builtin.copy"` subprocess to retrieve the same information that had already been fetched and thrown away.

### Impact

- **Latency**: Each hover or doc panel open incurred a 500ms-2s subprocess call. Users experienced a visible delay every time they viewed plugin documentation.
- **Resource waste**: `ansible-doc` loads the full Ansible Python runtime on each invocation. On systems with many collections, this means loading hundreds of megabytes of Python modules per subprocess.
- **Redundancy**: The data was available during the initial `--metadata-dump` call. Fetching it again per-plugin duplicated network/disk I/O, process startup, and Python import overhead.
- **Offline fragility**: If the Python environment became unavailable after initial discovery (e.g., venv deactivated, container stopped), cached collection _names_ were available but documentation was not — the subprocess fallback would fail.

### Forces

- The `--metadata-dump` output is large (tens of MB). Storing it all in memory increases the extension's RAM footprint.
- The disk cache (`collections-metadata.json`) also grows. However, this file is already written to `.cache/ansible-environments/` and is not shipped with the extension.
- The data is authoritative — `ansible-doc --metadata-dump` is the same source that `ansible-doc --json <plugin>` reads from. There is no fidelity difference.
- All three consumers (`@ansible/language-server`, VS Code panels, `@ansible/mcp-server`) access documentation through the same `CollectionsService.getPluginDocumentation()` method (ADR-001's single-service design).

## Decision

**We will store the full plugin documentation from `ansible-doc --metadata-dump` in `CollectionsService`'s in-memory cache and disk cache, eliminating per-plugin subprocess calls for documentation retrieval.**

Concretely:

1. **Widen the parsing types**: `MetadataEntry` now captures the full `PluginData` shape (`doc`, `examples`, `return`, `metadata`) instead of a stripped-down three-field subset.

2. **In-memory doc store**: A new `_pluginDocs: Map<string, PluginData>` map, keyed by `${fqcn}:${pluginType}`, holds the complete documentation for every discovered plugin. This map is populated during the `--metadata-dump` parse loop — the same loop that already iterates over every plugin to build the collection index.

3. **Disk cache includes docs**: The `CollectionsCache` interface gains an optional `pluginDocs` field. When the cache is written after a refresh, all plugin docs are serialized alongside the collection index. When the cache is read on startup, docs are restored into `_pluginDocs`.

4. **Cache-first retrieval**: `getPluginDocumentation()` checks `_pluginDocs` first. If the plugin is found, it returns immediately with no subprocess call. If not found (e.g., a plugin installed after the last refresh), it falls back to the per-plugin `ansible-doc --json` subprocess and caches the result in `_pluginDocs` for subsequent calls.

## Alternatives Considered

### Alternative 1: Keep per-plugin subprocess calls

**Description**: Retain the current behavior where `getPluginDocumentation()` always spawns `ansible-doc --json <plugin>`.

**Pros**:

- No additional memory usage
- Always returns the freshest possible documentation

**Cons**:

- 500ms-2s latency per documentation request
- Redundant — the data was already fetched and discarded
- Fails when the Python environment is unavailable

**Why not chosen**: The latency is unacceptable for hover providers and degrades the editing experience. The "freshness" argument is moot — the collection index is already point-in-time from the last refresh.

### Alternative 2: Lazy-load and cache per plugin on first access

**Description**: Don't store docs during the initial metadata dump. Instead, on first access to each plugin's docs, run the subprocess, cache the result, and serve subsequent requests from cache.

**Pros**:

- Lower initial memory footprint (only caches docs that are actually viewed)
- Simpler change to the parsing loop (no widening needed)

**Cons**:

- First access to each plugin still pays the subprocess cost
- Doesn't leverage the data already flowing through the parse loop
- Users who browse collections in the sidebar (common workflow) would trigger hundreds of sequential subprocess calls as they expand collection nodes

**Why not chosen**: The `--metadata-dump` data is already in memory during parsing. Discarding it and re-fetching on demand wastes the work already done. The marginal cost of keeping it is far lower than the cost of re-fetching.

### Alternative 3: Store only frequently-accessed plugins

**Description**: Cache full docs for a configurable subset of plugins (e.g., top 100 by usage, or only `ansible.builtin.*`).

**Pros**:

- Reduces memory for users with thousands of plugins installed

**Cons**:

- Requires heuristics or configuration to decide which plugins to cache
- Cache misses still hit the subprocess path
- Complexity for marginal memory savings — the full dump is already parsed

**Why not chosen**: The filtering logic adds complexity without meaningful benefit. Even with 5,000+ plugins, the full doc cache is under 100 MB in memory — well within the extension host's budget.

## Consequences

### Positive

- **Instant documentation**: Hover, doc panel, and MCP doc lookups return in microseconds instead of 500ms-2s. The user experience for browsing plugin documentation is qualitatively different.
- **Zero subprocess calls in steady state**: After the initial `--metadata-dump` run (which was already happening), no additional `ansible-doc` processes are spawned for documentation.
- **Offline resilience**: Once the cache is populated (in memory or on disk), documentation remains available even if the Python environment becomes unreachable.
- **Single code path**: All documentation consumers go through the same `_pluginDocs` map. No behavioral differences between hover, webview, and MCP.
- **Disk cache warmth**: On extension restart, the disk cache restores both the collection index and full plugin docs. The user sees documentation instantly while the background refresh runs.

### Negative

- **Increased memory usage**: The full `_pluginDocs` map adds 30-100 MB of memory depending on the number of installed collections. This is proportional to the `--metadata-dump` output size.
- **Larger disk cache**: The `collections-metadata.json` file grows from a few hundred KB (collection index only) to 20-50 MB (index + full docs). Removed the `null, 2` pretty-printing to keep the file compact.
- **Stale docs until refresh**: If a plugin is updated without triggering a `CollectionsService` refresh, the cached docs may be stale. This is the same staleness window as the collection index itself — mitigated by background refresh on activation and manual refresh via the sidebar.

### Neutral

- The subprocess fallback path remains for plugins not in the cache (e.g., newly installed before a refresh). This path now also populates `_pluginDocs`, so subsequent requests for the same plugin are instant.
- The disk cache format is backward-compatible — old caches without `pluginDocs` load normally with an empty docs map and populate on the next refresh.

## Implementation Notes

- The doc key format is `${fqcn}:${pluginType}` (e.g., `ansible.builtin.copy:module`). The plugin type is included because the same FQCN can exist as different plugin types (e.g., `ansible.builtin.file` is both a module and a lookup).
- The background refresh path uses temporary `Map` instances for both `_collections` and `_pluginDocs`, swapping atomically after the load completes. This prevents the UI from seeing partially-loaded state.
- The `writeCollectionsCache` function now uses `JSON.stringify(cache)` without pretty-printing (was `JSON.stringify(cache, null, 2)`) to reduce disk cache size by ~40%.

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md): Service-based architecture — establishes `@ansible/core` and `CollectionsService` as the single domain layer

---

## Revision History

| Date       | Author      | Change                                                              |
| ---------- | ----------- | ------------------------------------------------------------------- |
| 2026-05-26 | AI-assisted | Initial proposal (Implemented status — documents change in this PR) |
