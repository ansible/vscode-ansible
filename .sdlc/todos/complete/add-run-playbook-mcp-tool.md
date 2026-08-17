---
title: ansible-playbook MCP tool
created: 2026-07-30
status: done
completed: 2026-08-17
priority: medium
scope: mcp
---

# ansible-playbook MCP tool

## Context

ADR-012 (invariant #9 in AGENTS.md) requires every user-facing capability
to have a corresponding MCP tool, and vice versa. `packages/mcp-server/src/tools.ts`
only exposes `run_playbook_navigator` (ansible-navigator). There is no
MCP tool for running a playbook with plain `ansible-playbook`, even
though the extension has supported that executor from the Playbooks
tree view (`ansiblePlaybooks.run`, `ansiblePlaybooks.runWithProgress`)
since before this gap was noticed, and now also from the editor/explorer
"Run Ansible Playbook via..." context menu
(`ansiblePlaybooks.runFileWithAnsiblePlaybook`).

## Acceptance criteria

- [x] New `run_playbook` MCP tool mirrors `run_playbook_navigator`'s shape
      (inventory, limit, tags, check, diff, become, connection, vault, etc.)
- [x] Tool executes `ansible-playbook` in the active Python environment
- [x] Tool is registered in `packages/mcp-server/src/tools.ts` and handled
      in `packages/mcp-server/src/handlers.ts`
- [x] Covered by a unit test in `packages/mcp-server/test/`

## Notes

Identified during self-review of the
`add-playbook-run-context-menus` todo (PLB-008). Not fixed there to
keep that PR atomic — this is pre-existing debt, not a regression.
