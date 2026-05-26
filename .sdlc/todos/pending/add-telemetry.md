---
title: Add telemetry support
created: 2026-05-26
status: pending
priority: low
scope: extension
---

# Add telemetry support

## Context

`main` integrates Red Hat Segment telemetry via
`@redhat-developer/vscode-redhat-telemetry` with an opt-in
`redhat.telemetry.enabled` config property.

`next` has no telemetry.

## Acceptance criteria

- [ ] Telemetry events for key user actions (activation, command usage,
      feature engagement)
- [ ] Opt-in config property with clear disclosure
- [ ] Uses VS Code's built-in telemetry consent model

## Notes

Evaluate whether to use the Red Hat telemetry library or VS Code's
native `vscode.env.telemetryLevel` API. The native API respects the
user's global telemetry setting automatically.
