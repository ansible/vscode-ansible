---
title: Add settings shortcut commands
created: 2026-05-26
completed: 2026-07-10
status: done
priority: low
scope: extension
---

# Add settings shortcut commands

## Context

`main` has convenience commands to open VS Code settings filtered to
the extension's config: "Open Ansible Extension Settings" and "Open
Python Settings". `next` has no such shortcuts.

## Acceptance criteria

- [x] Command palette entry to open settings filtered to extension config
- [x] Uses `vscode.commands.executeCommand('workbench.action.openSettings', '@ext:...')`

## Notes

Trivial to implement. One or two commands opening the settings UI
with the appropriate filter string.
