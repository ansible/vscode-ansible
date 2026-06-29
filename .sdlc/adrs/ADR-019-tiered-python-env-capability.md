# ADR-019: Tiered Python Environment Capability Model

## Status

Implemented

## Date

2026-06-24

## Context

The extension depends on `ms-python.python` (hard, in
`extensionDependencies`) and consumes `ms-python.vscode-python-envs`
for environment creation and package management. However,
`python-envs` is **not** a hard dependency — it is absent on Cursor,
some OpenVSX-based editors, VS Code installs where the Python
Extension Pack is not loaded, and F5 Extension Development Host
sessions that only install declared `extensionDependencies`.

Prior to this decision, two critical write operations —
**create virtual environment** and **install ansible-dev-tools** —
hard-required the `python-envs` API. When it was missing, users saw
a toast message with no actionable fallback. The `upgrade` path
already used terminal `pip` and worked everywhere.

This gap blocked US-1 / US-2 / AC-1 ("user can set up a complete
Ansible development environment from the sidebar") on any editor
that did not bundle `python-envs`.

### Forces

- `python-envs` provides the best UX when available: native
  create-env wizard with manager choice, `managePackages` integration,
  PET-backed fast discovery.
- Microsoft owns `python-envs` and actively iterates on it. We should
  not reimplement its wizard in the Ansible extension.
- Making `python-envs` a hard dependency (`extensionDependencies`)
  would block activation on editors that cannot install it.
- Users on Cursor, OpenVSX, or minimal installs still need a
  functional path to create a venv and install tooling.

## Decision

**The extension uses a three-layer capability model for Python
environment operations. No write feature may hard-require
`python-envs`; every write path must have a Layer 3 terminal
fallback.**

### Layer 1 — Hard dependency: `ms-python.python`

Provides interpreter discovery, environment selection, and active
environment path. Already in `extensionDependencies`. The extension
cannot function without it.

### Layer 2 — Preferred write path: `ms-python.vscode-python-envs`

When installed, provides `createEnvironment` wizard,
`managePackages`, and PET-backed fast discovery. This is the
**preferred** code path for all write operations. Listed in
`extensionRecommendations` (soft), not `extensionDependencies` (hard).

### Layer 3 — Owned fallbacks: terminal `python -m venv` + `pip`

When Layer 2 is absent, the extension provides its own terminal-based
fallbacks:

- **Create venv**: prompts for directory name, runs
  `python -m venv <name>` in a VS Code terminal, verifies the binary,
  and selects the new environment via `updateActiveEnvironmentPath`.
- **Install packages**: runs `pip install ansible-dev-tools` in an
  activated terminal (same pattern as the existing `upgrade()` path).

**pip is the only Layer 3 package manager.** Conda, Poetry, and
Pipenv fallbacks are out of scope. If a user's workflow requires
those managers, they should install `python-envs` which supports
them natively.

### Capability enum

`PythonEnvironmentService` exposes a `PythonEnvCapability` type:

| Tier     | Value         | Meaning                                                          |
| -------- | ------------- | ---------------------------------------------------------------- |
| Full     | `full`        | python-envs + PET binary                                         |
| Hybrid   | `envs-no-pet` | python-envs active, PET missing (discovery via ms-python.python) |
| Fallback | `python-only` | Only ms-python.python; terminal fallbacks for writes             |
| None     | `unavailable` | No Python extension at all                                       |

All capability-dependent UI surfaces (viewsWelcome, status bar
routing, command error messages, MCP tool responses) query this
enum once rather than scattering ad-hoc `hasEnvsExtension()` checks.

### Routing rule

Try Layer 2 API first when `prefersEnvsExtension()` is true. Else
try Layer 3 terminal fallback when `isAvailable()` is true. Else
fail with install guidance.

## Alternatives Considered

### A. Hard-depend on `python-envs`

Add `ms-python.vscode-python-envs` to `extensionDependencies`.

**Rejected**: blocks activation on Cursor, OpenVSX, and any editor
that cannot resolve or install the extension. The PET binary may also
be absent even when the extension ID is resolvable (universal VSIX
without platform binaries).

### B. Go terminal-only (remove python-envs integration)

Replace all `python-envs` API calls with terminal `pip` / `venv`.

**Rejected**: regresses UX for the majority of users who do have
`python-envs`. The native create-env wizard, manager selection
(venv/conda/poetry), and `managePackages` integration are
significantly better than a terminal prompt. We should consume
Microsoft's investment, not reimplement it.

### C. Do nothing (status quo)

Keep the hard requirement and document the gap.

**Rejected**: AC-1 is not met on Cursor or OpenVSX. The walkthrough
and onboarding flows are broken for a meaningful portion of users.

## Consequences

### Positive

- AC-1 is achievable on every editor that has `ms-python.python`
- No regression for users who have `python-envs` (Layer 2 is still
  preferred)
- Clear capability tiers make the codebase easier to reason about
- MCP tools (`install_ansible_dev_tools`, `create_python_environment`)
  can document what works in each tier

### Negative

- Terminal fallbacks provide a degraded UX (no manager choice, no
  interactive `managePackages` UI)
- `pip` is the only fallback package manager — conda/poetry users
  without `python-envs` must install packages manually
- The terminal venv creation cannot detect failure reliably without
  shell integration (falls back to a timeout + binary existence check)

### Neutral

- The capability enum will grow if new tiers emerge (e.g., a future
  `ms-python.python` API that exposes venv creation directly)
- Each new write feature must provide both an API path and a terminal
  fallback (or document why it is Layer 2-only)

## Related Decisions

- [ADR-005](ADR-005-architectural-invariants.md), invariant 7:
  "Tools are discovered from the active Python environment" —
  this ADR extends that principle to write operations
- [add-python-env-fallback](../.sdlc/todos/complete/add-python-env-fallback.md):
  prior work that added read-path fallback (discovery); this ADR
  covers write-path fallback
- [ADR-012](ADR-012-mcp-tool-parity.md): new MCP tools
  `install_ansible_dev_tools` and `create_python_environment` added
  per this invariant

---

## Revision History

| Date       | Author      | Change         |
| ---------- | ----------- | -------------- |
| 2026-06-24 | AI-assisted | Initial record |
