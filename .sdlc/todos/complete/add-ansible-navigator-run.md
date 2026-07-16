---
title: Add ansible-navigator run support
created: 2026-05-26
status: done
completed: 2026-07-16
priority: medium
scope: extension
---

# Add ansible-navigator run support

## Context

`main` supports running playbooks via `ansible-navigator run` in
addition to `ansible-playbook`. ansible-navigator provides TUI-based
execution, execution environment integration, and artifact collection.

`next` only supports `ansible-playbook` runs from the Playbooks tree.

## Acceptance criteria

- [x] "Run via ansible-navigator" option in Playbooks tree context menu
- [x] ansible-navigator discovered via CommandService from active venv
- [x] Runs in integrated terminal with venv activation

## Notes

ansible-navigator should be discovered via `DevToolsService` /
`CommandService` from the active Python environment — no separate
path config property needed. Consider whether this should be a run
option in PlaybookConfigPanel or a separate command.
