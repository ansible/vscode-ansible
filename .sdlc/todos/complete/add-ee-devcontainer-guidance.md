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

- `docs/src/content/docs/editor/devcontainer.mdx` — Editor Integration guide
  (use Dev Containers, add config via creator, layer ADT onto an EE)
- `docs/src/content/docs/getting-started/ee-devcontainer.mdx` — short pointer
- `docs/src/content/docs/getting-started/ee-migration.mdx` — migration guide
  from main's `ansible.executionEnvironment.*` settings
- `ansibleExecutionEnvironments.generateDevcontainer` — EE tree context menu
  opens Creator `add resource devcontainer` with `--image` prefilled
- MCP: reuse creator tool `ac_add_res_devc` (ADR-012 parity; no custom generator)
- `guide-ee-devcontainer` skill — guides agents to `ac_add_res_devc` + outer
  Containerfile for ansible-dev-tools

## Notes

The Creator already supports devcontainer scaffolding. This todo is
about connecting EE images to that workflow and documenting the
migration path. Custom `generate_devcontainer_config` was removed in
favor of creator + skill guidance (PR review direction).
