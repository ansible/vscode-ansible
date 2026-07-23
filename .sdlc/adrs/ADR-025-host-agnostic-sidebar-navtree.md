# ADR-025: Sidebar NavTree

## Status

Implemented

## Date

2026-07-17

## Context

The Ansible Activity Bar previously stacked many native `TreeView` sections. Users want a
quieter drawer: accordion (one open at a time), collapsed by default, and auto-open when
Environment Managers or Ansible Dev Tools have a known issue. VS Code cannot collapse
sibling view headers from an extension
([vscode#88219](https://github.com/microsoft/vscode/issues/88219)).

We also intend a future standalone Electron app that reuses the same IA without
`vscode.TreeDataProvider`. Hydration and action dispatch must not live only inside
extension TreeProviders or React components.

## Decision

**We ship a host-agnostic sidebar NavTree: a serializable `SidebarSnapshot` model hydrated
in `@ansible/developer-services`, rendered by React in `@ansible/ui`, with VS Code as
the first host adapter (`WebviewView`). Native Activity Bar TreeViews are removed; the
hub is the sole Ansible sidebar UI.**

Concrete rules:

1. **DTOs** (`SidebarSnapshot`, nodes, welcome/inline actions) live in `@ansible/common`
   (browser-safe).
2. **`SidebarModel`** in `@ansible/developer-services` builds snapshots from services /
   plain inputs and computes `suggestedOpenSectionId`. Lazy-expand node builders
   (`buildEeDetailNodes`, `buildPluginTypeNodes`, `patchNodeChildren`) live here too.
   No `vscode` types in the DTO.
3. **React** (`SidebarShell` / `SidebarTree`) owns only presentation and ephemeral UI
   state (accordion, row expand). Actions are command-id strings dispatched to the host.
4. **VS Code host** registers `ansibleNavTree` (`type: webview`) as the only view
   under `views.ansible-environments`. Controllers in `src/views/` remain for command
   handlers and change events; they are not `TreeDataProvider`s.
5. **AI Tools / AI Skills / Lightspeed** appear as hub sections when the corresponding
   feature flags are on (not separate Activity Bar trees).
6. **Electron** later swaps only the transport (IPC vs postMessage) and command
   registry; it reuses model + React.
7. **Section ids** (`SidebarSectionId`, `SidebarNodeExpand`) stay Ansible-specific for
   this product IA. Generalizing the hub into a free-form accordion toolkit is out of
   scope.

## Alternatives Considered

### Alternative 1: Accordion via native TreeView APIs only

**Description**: Keep seven trees; try to collapse siblings with undocumented or
future APIs.

**Pros**: Native look; no webview cost.

**Cons**: Not supported today (#88219); blocks Electron reuse.

**Why not chosen**: Cannot meet accordion / quiet-by-default requirements.

### Alternative 2: Put hydration in React / webview

**Description**: Webview calls services over a fat RPC and owns population logic.

**Pros**: Less extension code.

**Cons**: Duplicates provider logic; harder to share with MCP/Electron; browser cannot
run Node services.

**Why not chosen**: Violates ADR-011 and Electron readiness.

### Alternative 3: Keep TreeViews behind a setting (dogfood toggle)

**Description**: Hide native trees when `ansible.sidebar.navTree.enabled` is true; keep
`createTreeView` as a fallback.

**Pros**: Escape hatch during migration.

**Cons**: Dual UI maintenance; menus/`viewsWelcome` drift from hub snapshot actions.

**Why not chosen**: After side-by-side dogfood, trees were hard-removed. Commands remain;
only TreeView chrome was deleted.

## Consequences

### Positive

- Accordion and issue-driven open are owned by us.
- Same model + UI path for VS Code webview and future Electron.
- Single Activity Bar surface — no dual tree/hub chrome.

### Negative

- Webview fidelity will never be pixel-identical to native TreeView chrome.
- Controllers expose `onDidChange` for hub refresh (not TreeViews).

### Neutral

- Inline actions and welcome buttons are data on the snapshot, replacing former
  `viewsWelcome` and `view/item/context` inline menus for the sidebar.

## Implementation Notes

- No `ansible.sidebar.navTree.enabled` setting — hub is always on.
- View id: `ansibleNavTree` (only entry in `views.ansible-environments`).
- Host: `src/sidebar/AnsibleNavTreeProvider.ts` (`WebviewViewProvider`).
- Controllers (hydrate + commands, no TreeViews): `src/views/*Controller.ts`.
- Bridge messages: `sidebar/setState`, `sidebar/action`, `sidebar/expandNode`,
  `sidebar/ready`.
- Progressive hydrate: host posts a skeleton `SidebarSnapshot` (section headers +
  loading rows) synchronously, then a full snapshot after async service work.
  Incremental refreshes skip the skeleton. UI is custom `SidebarShell` /
  `SidebarTree` (not react-arborist).
- Open section uses flex fill so trailing headers stay pinned to the bottom of the hub.
- Section builders live under `packages/services/src/sidebar/` with an ordered
  `SECTION_REGISTRY` (see [.sdlc/docs/add-navtree-section.md](../docs/add-navtree-section.md)).

## Related Decisions

- ADR-005: Architectural invariants
- ADR-010: Shared UI package (historical; UI in `@ansible/ui`)
- ADR-011: Package architecture (`@ansible/common` / `@ansible/developer-services`)
- ADR-012: MCP tool parity (hub actions must map to existing commands/tools)

## References

- [vscode#88219](https://github.com/microsoft/vscode/issues/88219) — cannot collapse other views
- Phase 0 playground: `packages/ui/playground/sidebar-navtree.html`

---

## Revision History

| Date       | Author     | Change                                         |
| ---------- | ---------- | ---------------------------------------------- |
| 2026-07-17 | bthornto   | Initial decision                               |
| 2026-07-18 | bthornto   | Progressive skeleton hydrate; custom tree UI   |
| 2026-07-19 | bthornto   | Hard-remove native trees; NavTree-only UI      |
