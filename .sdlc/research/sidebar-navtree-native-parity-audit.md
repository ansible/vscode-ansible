# Ansible NavTree vs Native Activity Bar — Parity Audit

Date: 2026-07-19 (post hard-remove cutover)  
Method: Dogfood + package.json / SidebarModel / hub host  
Scope: ADR-025 accordion hub (native trees removed)

## Cutover status

| Item | Status |
| --- | --- |
| NavTree-only Activity Bar view (`ansibleNavTree`) | **Done** |
| Native TreeViews / `createTreeView` | **Removed** |
| `ansible.sidebar.navTree.enabled` setting | **Removed** |
| Controllers kept for commands + change events | **Done** |
| Lazy expand builders in `SidebarModel` | **Done** |

## Historical P0–P2 gaps

Pre-cutover parity items (env select, EE lazy tree, collections indexing, tooltips,
python-only welcome, etc.) were fixed during dogfood. See git history on `next` /
feature branches for detail. This document no longer tracks dual-UI gaps.

## Follow-ups (out of scope for cutover)

- Generalize `SidebarSectionId` for non-Ansible consumers
- Rename controller `onDidChangeTreeData` to a neutral change event
- Lit / vscode-elements contribution of accordion primitives
