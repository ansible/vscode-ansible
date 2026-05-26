---
title: Add resync Ansible inventory command
created: 2026-05-26
status: pending
priority: low
scope: extension
---

# Add resync Ansible inventory command

## Context

The language server already handles the `resync/ansible-inventory`
notification to clear and rebuild its inventory cache. `main` exposes
this as a user-facing command `extension.resync-ansible-inventory`.
`next` has no command wired to this notification.

## Acceptance criteria

- [ ] Command palette entry "Ansible: Resync Inventory"
- [ ] Sends `resync/ansible-inventory` notification to the LS
- [ ] Status bar or notification confirms completion

## Notes

Useful when the user modifies inventory files outside the editor or
changes the active Python environment.
