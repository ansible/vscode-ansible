---
title: Port and improve Ansible Tox integration
created: 2026-05-26
status: pending
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

- [ ] Test Controller discovers tox-ansible scenarios from workspace
- [ ] Users can run individual scenarios from the Testing sidebar
- [ ] Test results are reported back to the Test Controller
- [ ] Task Provider for `tox-ansible` task type
- [ ] Uses `CommandService` for venv-aware tox execution

## Notes

Rewrite rather than direct port. The `main` implementation had issues
that should be investigated and fixed. Consider using `tox --list`
JSON output for scenario discovery instead of parsing config files.
