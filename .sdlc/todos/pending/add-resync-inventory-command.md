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

- [x] Command palette entry "Ansible: Resync Inventory"
- [x] Sends `resync/ansible-inventory` notification to the LS
- [x] Status bar or notification confirms completion
  (LS shows info messages on receipt of the notification)

## Notes

Useful when the user modifies inventory files outside the editor or
changes the active Python environment.
