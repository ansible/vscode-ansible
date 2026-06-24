---
title: Python environment capability parity
created: 2026-06-24
status: pending
priority: high
scope: extension, mcp
related:
  - .sdlc/todos/complete/add-python-env-fallback.md
  - docs/src/content/docs/roadmap/feature-ansible-ide-experience.md
---

# Python environment capability parity

## Context

US-1 / US-2 / AC-1 require users to discover environments, create a venv,
install ansible-dev-tools, and select an interpreter. Today these write
operations hard-require `ms-python.vscode-python-envs`, which is not in
`extensionDependencies` and may be missing on Cursor, OpenVSX, or minimal
VS Code installs.

## What shipped

- `PythonEnvCapability` enum (`full`, `envs-no-pet`, `python-only`, `unavailable`)
  on `PythonEnvironmentService` with routing helpers
- Terminal fallback for `createEnvironment` (`python -m venv`) when python-envs
  is absent
- Terminal fallback for `DevToolsService.install()` (`pip install ansible-dev-tools`)
- `extensionRecommendations` for `ms-python.vscode-python-envs` in package.json
- `viewsWelcome` entries for Environment Managers and Dev Tools views with
  capability-aware `when` clauses
- `setContext` for `ansible.pythonEnvCapability` and `ansible.pythonEnvAvailable`
- Status bar routes to `python.setInterpreter` when python-envs is not present
- One-time degraded-mode information message with install link
- MCP tools `install_ansible_dev_tools` and `create_python_environment` (ADR-012)
- Cursor docs updated with tiered capability table

## Remaining work

- [ ] Unit tests for `getCapability()` matrix across all four tiers
- [ ] Unit test for `DevToolsService.install()` terminal fallback path
- [ ] E2E test profile that runs without python-envs installed
- [ ] PRD assumption #3 clarification (recommended primary, not blocker)
- [ ] Update ux-walkthrough skill to use sidebar commands instead of manual
      venv steps as default path (follow-up, low priority)

## Acceptance criteria

- AC-1 passes on Cursor and VS Code without `python-envs` installed
- No regression when `python-envs` is present (Layer 2 still preferred)
- Extension activates without crash when neither Python extension is present
