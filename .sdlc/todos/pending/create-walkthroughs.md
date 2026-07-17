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

- [x] At least one walkthrough guiding environment setup
      (starter `ansible-getting-started` — issue #3029)
- [ ] Walkthrough highlights key next-branch features (sidebar views,
      plugin docs, Creator, playbook runner)
- [x] Steps use `next`'s actual commands and views
- [x] Registered in `package.json` contributes.walkthroughs

## Notes

Starter walkthrough landed with #3029 / WDIO XC-004. Cursor-safe panel
reads the same `contributes.walkthroughs` + media files (#3032) with
sidebar navigation.

**Content source for expansion:** end-user modules in
`.agents/skills/ux-walkthrough/walkthrough-modules.json` (environment,
editor-lsp, collections, creator, playbooks, EE, cross-cutting). Do **not**
copy dogfood-only `setup` steps (F5, build, scaffold review workspace).
AI/MCP/Lightspeed modules can be separate walkthroughs or `when`-gated
steps later.

Edit `package.json` + `media/walkthroughs/` only — one runtime source.
