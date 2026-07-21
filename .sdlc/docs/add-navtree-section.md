# Add an Ansible NavTree section

Use this checklist when adding a new accordion section (e.g. Molecule scenarios).
Do **not** change `SidebarShell` / `SidebarTree` for ordinary sections.

## Steps

1. **Id** — Add the section id to `SidebarSectionId` in
   [`packages/common/src/sidebar.ts`](../../packages/common/src/sidebar.ts).
   If the section needs lazy expand, add a `SidebarNodeExpand` variant there too.

2. **Builder** — Create `packages/services/src/sidebar/sections/<id>.ts` exporting
   `build<Name>(input): SidebarSection` and, if needed,
   `shouldSuggest<Name>(input): boolean`.

3. **Registry** — Register the section in
   [`packages/services/src/sidebar/registry.ts`](../../packages/services/src/sidebar/registry.ts)
   (`SECTION_REGISTRY` order = accordion order). Skeleton and full snapshots both
   use this list.

4. **Input** — Extend `SidebarModelInput` in
   [`packages/services/src/sidebar/types.ts`](../../packages/services/src/sidebar/types.ts).
   Gather data in the VS Code host
   ([`AnsibleNavTreeProvider`](../../src/sidebar/AnsibleNavTreeProvider.ts));
   shape plain DTOs in
   [`assembleSidebarInput.ts`](../../packages/services/src/sidebar/assembleSidebarInput.ts)
   when the mapping is non-trivial.

5. **Commands + MCP** — Wire row/header actions to existing or new commands.
   Per ADR-012, user-facing capabilities need an MCP tool equivalent.

6. **Tests** — Unit-test the section builder (and suggest, if any). Keep
   `SidebarModel` orchestrator tests green. Optional: add a playground mock row.

7. **Story** — If the section is user-facing, add/update a user story in
   `.sdlc/user-stories.yaml` and tag WDIO coverage when applicable.

## Guarantees

- UI only renders `SidebarSnapshot` — no Ansible discovery in the webview.
- Host owns vscode config/auth/workspace; services own pure snapshot building.
- Controllers under `src/views/` expose `onDidChange` for hub refresh (not TreeViews).
