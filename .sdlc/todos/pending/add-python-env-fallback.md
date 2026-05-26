---
title: Add Python environment API fallback for non-PET editors
created: 2026-05-26
status: pending
priority: high
scope: extension
---

# Add Python environment API fallback for non-PET editors

## Context

`main` iterated on the Python environment service (originally ported
from `next`) to add a fallback chain:

1. `ms-python.vscode-python-envs` with PET binary (primary)
2. `ms-python.python` environments API (fallback when PET is missing)

The PET binary is missing on OpenVSX-based editors (VSCodium, Dev
Spaces, Kiro) because the universal VSIX doesn't include
platform-specific binaries. Without the fallback, environment
discovery fails entirely on these platforms.

`next` only has the primary path — no fallback.

## Acceptance criteria

- [ ] Detect when PET binary is missing from the vscode-python-envs
      extension path
- [ ] Fall back to `ms-python.python` `PythonExtension` API for
      environment resolution
- [ ] Show a non-intrusive warning that environment discovery may be
      degraded
- [ ] Environment change events work through both paths
- [ ] Works on VSCodium, Dev Spaces, and other OpenVSX editors

## Notes

Reference `main`'s `src/services/PythonEnvironmentService.ts` for the
implementation pattern. Key methods: `_isPetAvailable()`,
`_initFromPythonExtension()`, `resolveInterpreterPath()` with dual
API support. Consider porting to `@ansible/core` with conditional
vscode imports for standalone compatibility.
