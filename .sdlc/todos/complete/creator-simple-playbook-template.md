---
title: Support simple playbook creation via Creator
created: 2026-05-26
status: done
completed: 2026-08-17
priority: low
scope: extension
---

# Support simple playbook creation via Creator

## Context

`main` has a "Create empty playbook" command that inserts a starter
template. Rather than hardcoding a template in the extension, the
Creator should be the source of truth for content examples.

ansible-creator should support generating a simple example playbook
(not just a full project), and the extension should expose that via
a command or Creator tree entry.

## Acceptance criteria

- [x] ansible-creator supports a simple/example playbook scaffold
- [x] Extension exposes playbook creation through the schema-driven Creator flow
- [x] Generated playbook uses best-practice structure from Creator

## Notes

This depends on ansible-creator adding support for single-file
playbook generation. Coordinate with the ansible-creator project.
The extension's role is to expose the Creator capability, not to
own the template content.

## Resolution

ansible-creator 26.8.0 added `add resource playbook` ("Add a sample
Ansible playbook file to an existing path") to its CLI schema. Per
ADR-004/ADR-005, the Creator integration is fully schema-driven
(`CreatorService` loads `ansible-creator schema` at runtime;
`CreatorProvider` builds the tree and `CreatorFormPanel` renders the
form from whatever the CLI reports) — no extension code changes were
needed for the new leaf command to appear under **Creator → Add →
Resource → Playbook**, and it is automatically exposed as an MCP tool
(`ac_add_res_playbook`) via `CreatorToolGenerator`.

Updated the ansible-creator docs (`ansible-creator.mdx`,
`ansible-creator/reference.mdx`) to document the new
`add resource playbook` command alongside the other resource types.
