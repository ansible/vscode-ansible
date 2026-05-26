---
title: Add EE-to-devcontainer guidance and tooling
created: 2026-05-26
status: pending
priority: medium
scope: docs
---

# Add EE-to-devcontainer guidance and tooling

## Context

Per ADR-003, the "run inside EE" mode from `main` will not be ported.
Instead, users should add an `ansible-dev-tools` layer to their EE
images and use VS Code Dev Containers.

## Acceptance criteria

- [ ] Documentation explaining how to add a dev-tools layer to an EE
- [ ] Creator form or template for generating `.devcontainer/devcontainer.json`
      from an EE image
- [ ] Migration guide for users coming from main's EE mode

## Notes

The Creator already supports devcontainer scaffolding. This todo is
about connecting EE images to that workflow and documenting the
migration path.
