---
title: Create walkthroughs for new user onboarding
created: 2026-05-26
status: done
completed: 2026-08-17
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
- [x] Walkthrough highlights key next-branch features (sidebar views,
      plugin docs, Creator, playbook runner)
- [x] Steps use `next`'s actual commands and views
- [x] Registered in `package.json` contributes.walkthroughs

## Notes

Starter walkthrough landed with #3029 / WDIO XC-004. Cursor-safe panel
reads the same `contributes.walkthroughs` + media files (#3032) with
sidebar navigation.

The `ansible-getting-started` walkthrough (`package.json` +
`media/walkthroughs/getting-started/*.md`) already contains steps for
all remaining next-branch highlights sourced from
`.agents/skills/ux-walkthrough/walkthrough-modules.json`:

- `browse-collections` → plugin docs (Installed Collections + plugin
  doc panel)
- `scaffold-content` → Creator
- `run-playbooks` → playbook runner (terminal + progress viewer)
- `open-ansible-sidebar` → sidebar views

Also present: `collection-sources`, `execution-environments`,
`editor-language-server`, `diagnostics-status`. AI/MCP/Lightspeed
modules remain out of scope for this walkthrough per the original
notes and can be tackled separately if needed.

WDIO coverage (`test/ui/walkthroughs.spec.ts`, `@covers XC-004`) and
unit coverage (`test/unit/features/walkthroughContent.test.ts`)
already validate the contribution generically (title, step count,
sidebar step present), so no test changes were required.
