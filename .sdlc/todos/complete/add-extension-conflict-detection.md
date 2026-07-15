---
title: Add extension conflict detection
created: 2026-05-26
completed: 2026-07-14
status: complete
priority: low
scope: extension
---

# Add extension conflict detection

## Context

`main` warns users when conflicting YAML or Ansible extensions are
installed that could interfere with syntax highlighting or language
features. `next` has no such detection.

## Acceptance criteria

- [x] On activation, check for known conflicting extensions
- [x] Show a warning notification with guidance to disable conflicts
- [x] Maintain a list of known conflicting extension IDs

## Implementation

- `src/features/extensionConflicts.ts` — frozen list of 6 conflicting
  IDs, detection on activation + `extensions.onDidChange`, warning with
  "Show Extensions" action, session-scoped dismiss state
- `src/extension.ts` — wired via `registerExtensionConflictDetection(context)`
- `test/unit/features/extensionConflicts.test.ts` — 13 unit tests

## Notes

Common conflicts include other YAML language extensions that override
the Ansible file association or provide competing completions.
