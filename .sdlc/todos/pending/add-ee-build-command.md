---
title: Add execution environment build command
created: 2026-05-26
status: pending
priority: medium
scope: extension
---

# Add execution environment build command

## Context

`main` provides a context-menu command on `execution-environment.yml`
files to run `ansible-builder build`. `next` has an EE tree view that
lists container images but no build capability.

## Acceptance criteria

- [ ] Right-click `execution-environment.yml` in editor or explorer
      triggers `ansible-builder build`
- [ ] Build runs in integrated terminal with progress output
- [ ] EE tree refreshes after successful build

## Notes

Should integrate with `CommandService` for venv-aware execution.
Consider whether to add to the EE tree view as well (build from
selected EE definition).
