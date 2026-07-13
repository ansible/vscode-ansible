---
title: Add execution environment build command
created: 2026-05-26
status: done
completed: 2026-07-13
priority: medium
scope: extension
---

# Add execution environment build command

## Context

`main` provides a context-menu command on `execution-environment.yml`
files to run `ansible-builder build`. `next` has an EE tree view that
lists container images but no build capability.

## Acceptance criteria

- [x] Right-click `execution-environment.yml` in editor or explorer
      triggers `ansible-builder build`
- [x] Build runs in integrated terminal with progress output
- [x] EE tree refreshes after successful build

## Notes

Integrates with `CommandService` for venv-aware tool resolution and
`TerminalService` for activated-terminal execution. Also available from
the EE view toolbar (file picker) and as MCP tool
`build_execution_environment`.
