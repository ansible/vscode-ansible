# ADR-013: SCM Collection Plugin Documentation via Shallow Clone

## Status

Accepted

## Date

2026-06-17

## Context

The Collection Sources sidebar provides two sources of Ansible
collections: Ansible Galaxy and configured GitHub organizations.
Galaxy collections have full plugin-level browsing — users expand a
collection to see plugin types, individual plugins, and complete
documentation (parameters, examples, return values) — powered by the
Galaxy API's `docs-blob` endpoint via `GalaxyDocsCache` (PR #2894).

GitHub collections today are **discovery-only**: the
`GitHubCollectionCache` finds repos with `galaxy.yml`, extracts
namespace/name/version, and offers install via `ade install`. There is
no plugin-level browsing for uninstalled GitHub collections. A user
who wants to understand what plugins a GitHub collection offers must
either install it first or browse the repository manually.

This gap matters because many organizations maintain collections in
GitHub that are not published to Galaxy. The `redhat-cop`,
`ansible-collections`, and private org repositories are primary
sources for these teams. Without plugin browsing, the extension
cannot complete the discovery → documentation → generation loop for
SCM-sourced collections (violating ADR-012's parity invariant).

### Forces in tension

- **Doc quality**: Galaxy provides pre-rendered, normalized docs-blob.
  GitHub repos contain raw Python source files with embedded
  `DOCUMENTATION` YAML strings that require parsing, fragment
  resolution, and normalization.
- **Tooling assumptions**: The project already assumes `ansible-doc`
  is available in the active Python environment (ADR-004, invariant 7).
  Leveraging it avoids reimplementing complex documentation parsing.
- **API rate limits**: GitHub's REST API has a 5,000 requests/hour
  limit for authenticated users. A collection with 200 modules would
  require 200+ API calls to fetch plugin source files individually.
- **Latency vs freshness**: SCM repositories change more frequently
  than Galaxy releases. Caching must balance responsiveness with
  staleness.
- **Disk usage**: Temporary clones and cached JSON consume disk space
  that must be managed.

## Decision

**We will shallow-clone GitHub collection repositories and run
`ansible-doc --metadata-dump` with a constrained `ANSIBLE_COLLECTIONS_PATH`
to produce normalized plugin documentation, cached to disk with
SHA-based invalidation and a 7-day TTL.**

Concretely:

1. When a user expands a GitHub collection node in the tree (or an
   MCP tool requests its docs), `SCMDocsCache` checks for a cached
   JSON file keyed by `{org}__{repo}-{commit_sha}.json`.

2. On cache miss, the service:
   a. Shallow-clones the repo (`git clone --depth 1 --single-branch`)
   into a temporary directory structured as
   `{tmp}/ansible_collections/{namespace}/{name}/`.
   b. Resolves the HEAD SHA from the clone via `git rev-parse HEAD`.
   c. If a cache file for that SHA already exists, refreshes its
   timestamp and returns the existing data (avoids re-indexing
   when only the TTL expired but the content is unchanged).
   d. Runs `ansible-doc --metadata-dump --no-fail-on-errors` with
   `ANSIBLE_COLLECTIONS_PATH={tmp}` to extract all plugin
   documentation in one JSON blob.
   e. Parses the metadata dump using the same shared utility that
   `CollectionsService` uses for installed collections.
   f. Persists the result to `~/.cache/ansible-environments/scm-docs/`.
   g. Removes the temporary clone directory.

3. Cache entries expire after 7 days or when the HEAD SHA changes.
   Users can force-refresh via a context menu command on the
   collection node.

4. An MCP tool (`get_scm_plugin_doc`) provides agent access to the
   same documentation, maintaining ADR-012 parity.

## Alternatives Considered

### Alternative 1: GitHub API (Contents/Trees API)

**Description**: Walk the repository tree via
`GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` to discover
plugin directories, then fetch each plugin's Python file and parse
the `DOCUMENTATION` YAML string from the docstring.

**Pros**:

- No local disk usage beyond the JSON cache
- No dependency on local Python/ansible-doc
- Works in constrained environments (Codespaces, remote SSH)
- Incremental updates via tree SHA comparison

**Cons**:

- Heavy API usage: 200 modules = 200+ API calls per refresh
- Fragile parsing: must replicate `ansible-doc`'s DOCUMENTATION
  extraction (extends_documentation_fragment, version_added
  inheritance, Jinja in docs)
- Incomplete data: doc fragments are cross-file references
- Org-scale problem: `ansible-collections` has 100+ repos

**Why not chosen**: Does not scale to full orgs. Produces
lower-quality documentation than `ansible-doc` because doc fragment
resolution, Jinja rendering, and schema normalization would need to
be reimplemented in TypeScript.

### Alternative 2: Tarball Fetch and Scrape

**Description**: Download the repository tarball via
`GET /repos/{owner}/{repo}/tarball/{ref}`, extract to temp, parse
`DOCUMENTATION`/`EXAMPLES`/`RETURN` YAML blocks ourselves.

**Pros**:

- Single API call per collection (tarball download)
- All files available locally for parsing
- No `git` binary dependency

**Cons**:

- Full repo download: includes tests, CI, docs (community.general ~50MB)
- Same fragile documentation parsing as Alternative 1
- Would reimplement what `ansible-doc` already does
- Temp storage for extracted tarballs

**Why not chosen**: Better API efficiency than Alternative 1, but
still reimplements `ansible-doc`'s parsing logic poorly. The
shallow-clone approach provides the same files with less download
size (git packs data efficiently) and delegates parsing to the
authoritative tool.

## Consequences

### Positive

- Exact documentation parity with installed-collection docs —
  same data format, same normalization, same doc fragment resolution
- Reuses the proven `MetadataDump` → `PluginInfo[]` + `PluginData`
  parsing path from `CollectionsService`
- Minimal new code: the service is structurally identical to
  `GalaxyDocsCache` with a different data acquisition step
- No GitHub API rate limit concerns for clone operations (git
  protocol is separate from REST quota)
- `PluginDocPanel` and MCP tools work unchanged because the cache
  output shape is identical to `GalaxyDocsCache`

### Negative

- Requires `git` binary on PATH (universally available in dev
  environments but not guaranteed in all deployment targets)
- Requires `ansible-doc` in the active Python environment (already
  an invariant — ADR-004)
- Clone latency of 2-10 seconds per collection on first expansion;
  must be async with progress indicator
- Temporary disk usage during clone+extract; mitigated by immediate
  cleanup after metadata extraction
- Cannot parallelize `ansible-doc` across collections easily
  (Python GIL, environment isolation)

### Neutral

- The 7-day TTL is a heuristic; it may need tuning based on user
  feedback about freshness vs performance
- SHA-based invalidation means a force-refresh always checks the
  remote, adding one API call per refresh
- Collections in private repositories require GitHub authentication,
  which is already handled by `GitHubCollectionCache` via
  `vscode.authentication`

## Implementation Notes

### Key files

- `packages/services/src/SCMDocsCache.ts` — new service
- `packages/common/src/parsers/metadataDumpParser.ts` — shared
  browser-safe parsing utility extracted from `CollectionsService`
- `src/views/CollectionSourcesProvider.ts` — tree expansion for
  GitHub collection nodes
- `packages/mcp-server/src/tools.ts` + `handlers.ts` — MCP tool

### Cache structure

```text
~/.cache/ansible-environments/scm-docs/
  ansible-collections__cisco.ios-abc1234.json
  redhat-cop__infra.aap_configuration-def5678.json
```

### Temp directory lifecycle

```text
os.tmpdir()/ansible-scm-docs-{random}/
  ansible_collections/
    {namespace}/
      {name}/        ← shallow clone target
```

Clone, run `ansible-doc`, save JSON, `rm -rf` the temp dir.

## Related Decisions

- [ADR-002](ADR-002-centralized-plugin-doc-cache.md): Plugin doc
  cache — `SCMDocsCache` follows the same cache-first pattern
- [ADR-004](ADR-004-intentional-exclusions-from-main.md): Tools
  discovered from active Python env — `ansible-doc` dependency
- [ADR-005](ADR-005-architectural-invariants.md): Architectural
  invariants — invariants 7 (tool discovery) and 11 (MCP parity)
- [ADR-011](ADR-011-package-architecture.md): Package architecture —
  `SCMDocsCache` belongs in `@ansible/developer-services`
- [ADR-012](ADR-012-mcp-tool-parity.md): MCP tool parity — requires
  corresponding `get_scm_plugin_doc` MCP tool

---

## Revision History

| Date       | Author      | Change           |
| ---------- | ----------- | ---------------- |
| 2026-06-17 | AI-assisted | Initial decision |
