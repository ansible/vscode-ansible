---
title: Support simple playbook creation via Creator
created: 2026-05-26
status: done
completed: 2026-07-28
priority: low
scope: extension
jira: AAP-81422
---

# Support simple playbook creation via Creator

## Context

`main` has a "Create empty playbook" command that inserts a starter
template. Rather than hardcoding a template in the extension, the
Creator should be the source of truth for content examples.

## Acceptance criteria

- [x] ansible-creator supports a simple/example playbook scaffold
  (`add resource playbook`) — ansible/ansible-creator#634
- [x] Extension exposes the resource via the schema-driven Creator
  tree and MCP (`ac_add_res_play`) — no dedicated palette command
  (SCF-003 / ADR-004)
- [x] Generated playbook uses best-practice structure from Creator

## Notes

Delivered by ansible-creator; vscode-ansible picks the resource up
automatically once an upgraded creator is installed. A dedicated
extension command is not required.
