---
title: Playbook run menus
created: 2026-05-26
status: done
completed: 2026-07-30
priority: low
scope: extension
---

# Playbook run menus

## Context

`main` has a "Run Ansible Playbook via..." submenu in both the editor
right-click menu and file explorer right-click menu. `next` only
exposes run commands from the Playbooks tree view.

## Acceptance criteria

- [x] Right-click in an open Ansible file shows "Run Playbook" option
- [x] Right-click on an Ansible file in explorer shows "Run Playbook"
- [x] Submenu groups available runners (ansible-playbook, navigator)
- [x] When clause limits to `editorLangId == ansible` / `resourceLangId == ansible`

## Notes

Depends on ansible-navigator support (gap #2) for the full submenu.
Can ship with just ansible-playbook initially.

## Resolution

Added an `ansiblePlaybooks.runVia` submenu ("Run Ansible Playbook
via...") to both `editor/context` (`editorLangId == ansible`) and
`explorer/context` (`resourceLangId == ansible`). It groups two new
commands, `ansiblePlaybooks.runFileWithAnsiblePlaybook` and
`ansiblePlaybooks.runFileWithNavigator`, which reuse saved per-playbook
configuration (via `PlaybooksService`) when the target file is a
discovered playbook, falling back to workspace defaults otherwise.
ansible-navigator support already existed in `PlaybooksService`, so
both runners shipped together. Tracked as user story PLB-008.

Cold review flagged a pre-existing ADR-012 gap: there is no MCP tool
for the ansible-playbook executor (only `run_playbook_navigator`
exists). That predates this change and is tracked separately in
`add-run-playbook-mcp-tool.md` to keep this PR atomic.
