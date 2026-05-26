---
title: Add playbook run to editor and explorer context menus
created: 2026-05-26
status: pending
priority: low
scope: extension
---

# Add playbook run to editor and explorer context menus

## Context

`main` has a "Run Ansible Playbook via..." submenu in both the editor
right-click menu and file explorer right-click menu. `next` only
exposes run commands from the Playbooks tree view.

## Acceptance criteria

- [ ] Right-click in an open Ansible file shows "Run Playbook" option
- [ ] Right-click on an Ansible file in explorer shows "Run Playbook"
- [ ] Submenu groups available runners (ansible-playbook, navigator)
- [ ] When clause limits to `editorLangId == ansible` / `resourceLangId == ansible`

## Notes

Depends on ansible-navigator support (gap #2) for the full submenu.
Can ship with just ansible-playbook initially.
