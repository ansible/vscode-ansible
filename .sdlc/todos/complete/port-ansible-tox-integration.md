---
title: Port and improve Ansible Tox integration
created: 2026-05-26
completed: 2026-07-24
status: completed
priority: medium
scope: extension
---

# Port and improve Ansible Tox integration

## Context

`main` has an Ansible Tox integration providing a VS Code Test
Controller and Task Provider for `tox-ansible.ini` environments.
However, the implementation had reliability issues and never worked
correctly in `main`.

Port the concept to `next` with a fresh implementation using the
service-based architecture.

## Acceptance criteria

- [x] Test Controller discovers tox-ansible scenarios from workspace
- [x] Users can run individual scenarios from the Testing sidebar
- [x] Test results are reported back to the Test Controller
- [x] Task Provider for `tox-ansible` task type
- [x] Uses `CommandService` for venv-aware tox execution

## Resolution

Delivered in PR [#3046](https://github.com/ansible/vscode-ansible/pull/3046)
(Jira: AAP-81423). Complete rewrite using `ToxAnsibleService` +
`CommandService`. Uses `tox list --ansible --gh-matrix` JSON for
discovery. All 10 reliability bugs from the `main` implementation
addressed. MCP tools, telemetry, and unit tests included.
