---
title: Add EE-to-devcontainer guidance and tooling
created: 2026-05-26
completed: 2026-07-22
status: complete
priority: medium
scope: docs
---

# Add EE-to-devcontainer guidance and tooling

## Context

Per ADR-003, the "run inside EE" mode from `main` will not be ported.
Instead, users should add an `ansible-dev-tools` layer to their EE
images and use VS Code Dev Containers.

## Acceptance criteria

- [x] Documentation explaining how to add a dev-tools layer to an EE
- [x] Creator form or template for generating `.devcontainer/devcontainer.json`
      from an EE image
- [x] Migration guide for users coming from main's EE mode

## Implementation

- `docs/src/content/docs/getting-started/ee-devcontainer.mdx` — full guide
  for layering ansible-dev-tools onto an EE and using Dev Containers
- `docs/src/content/docs/getting-started/ee-migration.mdx` — migration guide
  from main's `ansible.executionEnvironment.*` settings
- `ansibleExecutionEnvironments.generateDevcontainer` — EE tree context menu
  command that generates `.devcontainer/devcontainer.json` from a selected image
- `generate_devcontainer_config` MCP tool — ADR-012 parity for AI agents
- `guide-ee-devcontainer` skill — AI skill for EE-to-devcontainer guidance

## Notes

The Creator already supports devcontainer scaffolding. This todo is
about connecting EE images to that workflow and documenting the
migration path.
