---
title: "Telemetry phase 2: story-mapped events and audit skill"
created: 2026-05-26
status: pending
priority: medium
scope: extension
depends-on: PR #3009 (phase 1 foundation)
---

# Telemetry phase 2: story-mapped events and audit skill

## Context

Phase 1 (PR #3009) laid the telemetry foundation on `next` — Segment
integration, opt-in config, VS Code telemetry consent model. Brad's
review requested a phase 2 with story-mapped events and an audit skill.

The extension's client-side telemetry uses a separate Segment source and
Amplitude destination from Lightspeed's server-side pipeline — no data
overlap. Schema coordination with the metrics team is deferred until
execution outcome events (success/failure, host count, collections) are
added.

## Acceptance criteria

- [ ] Story-to-event mapping table in `USAGE_DATA.md` — each telemetry
      event references a user story ID from `.sdlc/user-stories.yaml`
- [ ] Orphan events (events with no matching story) flagged in the table
- [ ] Missing user stories backfilled in `.sdlc/user-stories.yaml`
- [ ] Agent skill to audit that every telemetry event maps to a user story
- [ ] Walkthrough open events captured (instrument
      `workbench.action.openWalkthrough`)

## Notes

- Phase 1 PR: #3009
- Brad's review: story-mapped events required for phase 2
- Tima's ask: walkthrough open event capture
- Clay's concern: dual Segment streams acknowledged, no overlap today
