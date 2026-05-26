---
title: Add extension conflict detection
created: 2026-05-26
status: pending
priority: low
scope: extension
---

# Add extension conflict detection

## Context

`main` warns users when conflicting YAML or Ansible extensions are
installed that could interfere with syntax highlighting or language
features. `next` has no such detection.

## Acceptance criteria

- [ ] On activation, check for known conflicting extensions
- [ ] Show a warning notification with guidance to disable conflicts
- [ ] Maintain a list of known conflicting extension IDs

## Notes

Common conflicts include other YAML language extensions that override
the Ansible file association or provide competing completions.
