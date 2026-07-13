---
title: Python environment capability parity
created: 2026-06-24
status: complete
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

- [x] Unit tests for `getCapability()` matrix across all four tiers
      (test/unit/services/pythonEnvCapability.test.ts — covers all tiers
      with parameterized describe/it blocks, plus edge cases for hint
      content and priority when both APIs are present)
- [x] Unit test for `DevToolsService.install()` terminal fallback path
      (packages/services/test/services/DevToolsService.terminal.test.ts —
      covers terminal pip install, Layer 2 priority, polling when shell
      integration is unavailable, and upgrade via terminal)
- [x] E2E test profile that runs without python-envs installed
      (.vscode-test.mjs `no-python-envs` label +
      test/integration/activation-no-envs.test.ts — validates activation,
      commands, views, and refresh without crash)
- [x] PRD assumption #3 clarification (recommended primary, not blocker)
      python-envs is listed in `extensionRecommendations` (soft), not
      `extensionDependencies` (hard). ADR-019 documents this explicitly:
      Layer 2 is preferred, Layer 3 terminal fallback is always available.
- [x] Update ux-walkthrough skill to use sidebar commands instead of manual
      venv steps as default path (already addressed — SKILL.md directs
      reviewers to use sidebar, walkthrough-modules.json uses
      ansibleDevToolsEnvManagers.create command)

## Acceptance criteria

- AC-1 passes on Cursor and VS Code without `python-envs` installed
- No regression when `python-envs` is present (Layer 2 still preferred)
- Extension activates without crash when neither Python extension is present
