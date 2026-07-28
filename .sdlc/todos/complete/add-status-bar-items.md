---
title: Add status bar items for environment info
created: 2026-05-26
status: done
priority: medium
scope: extension
---

# Add status bar items for environment info

## Context

`main` shows Ansible metadata (version) and the active Python
interpreter in the VS Code status bar. This gives at-a-glance
visibility without opening the sidebar.

`next` has no status bar items — environment info is only in the
sidebar tree views.

## Acceptance criteria

- [x] Status bar item showing active Python environment
- [x] Status bar item showing Ansible version (from LS metadata)
- [x] Clicking the items opens relevant commands (select environment,
      resync, etc.)
- [x] Items update when the active environment changes

## Notes

Use `vscode.window.createStatusBarItem()`. The LS already supports
the `update/ansible-metadata` notification for version info.
