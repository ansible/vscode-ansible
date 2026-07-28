---
title: Support simple playbook creation via Creator
created: 2026-05-26
status: pending
priority: low
scope: extension
jira: AAP-81422
---

# Support simple playbook creation via Creator

## Context

`main` has a "Create empty playbook" command that inserts a starter
template. Rather than hardcoding a template in the extension, the
Creator should be the source of truth for content examples.

ansible-creator should support generating a simple example playbook
(not just a full project), and the extension should expose that via a
command or Creator tree entry.

## Acceptance criteria

- [ ] ansible-creator supports a simple/example playbook scaffold
  (`add resource playbook`) — implemented in ansible-creator branch
  `feat/AAP-81422-add-simple-playbook-resource` (needs merge/release)
- [x] Extension exposes a command to create a playbook from Creator
  (`ansibleCreator.createSimplePlaybook`)
- [ ] Generated playbook uses best-practice structure from Creator
  (requires a released ansible-creator with the resource)
- [x] MCP picks up the resource automatically via schema
  (`ac_add_res_play` once creator is upgraded)

## Notes

This depends on ansible-creator adding support for single-file
playbook generation. Coordinate with the ansible-creator project.
The extension's role is to expose the Creator capability, not to
own the template content.

Extension branch: `feat/AAP-81422-simple-playbook-creation`
Creator branch: `feat/AAP-81422-add-simple-playbook-resource`
