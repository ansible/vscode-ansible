---
title: Create walkthroughs for new user onboarding
created: 2026-05-26
status: pending
priority: low
scope: extension
---

# Create walkthroughs for new user onboarding

## Context

`main` has three walkthroughs for guided onboarding. `next` has no
walkthroughs but has significantly different features (tree views,
Creator forms, plugin doc panel, MCP tools, AI integration) that
should be highlighted during onboarding.

The walkthroughs should be designed for `next`'s feature set, not
ported directly from `main`.

## Acceptance criteria

- [ ] At least one walkthrough guiding environment setup
- [ ] Walkthrough highlights key next-branch features (sidebar views,
      plugin docs, Creator, playbook runner)
- [ ] Steps use `next`'s actual commands and views
- [ ] Registered in `package.json` contributes.walkthroughs

## Notes

Design the walkthrough content after the core features stabilize.
Consider: environment selection, collection browsing, plugin doc
panel, Creator scaffolding, playbook execution, MCP/AI tools.
