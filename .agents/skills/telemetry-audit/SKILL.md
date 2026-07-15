---
name: telemetry-audit
description: >
    Audit that every telemetry event maps to a user story in
    .sdlc/user-stories.yaml and that USAGE_DATA.md is in sync.
    Use after adding, removing, or renaming telemetry events.
user-invocable: true
triggers: [audit telemetry, telemetry drift, telemetry mapping, usage data audit]
---

# Audit Telemetry Event Mapping

Validate that every telemetry event defined in code has a corresponding
user story in `.sdlc/user-stories.yaml` and is documented in
`USAGE_DATA.md`.

## When to Run

- After adding or removing a telemetry event
- After modifying `LightspeedEvents` in `packages/lightspeed/src/telemetry.ts`
- As part of PR review for telemetry-related changes
- Periodically to catch drift

## Audit Steps

### 1. Extract telemetry events from code

Read `packages/common/src/types/telemetry.ts` and extract all event keys
from the `TelemetryEvents` object. Read `packages/lightspeed/src/telemetry.ts`
and extract all event keys from the `LightspeedEvents` object. Also grep the
codebase for any `sendEvent` calls that use string literals instead of the enum.

### 2. Extract TEL stories from user-stories.yaml

Read `.sdlc/user-stories.yaml` and extract all stories with `TEL-*` IDs.
Build a map of story ID to the event keys it covers (from the story title
and criteria).

### 3. Extract mapping table from USAGE_DATA.md

Read `USAGE_DATA.md` and parse the story-to-event mapping table. Extract
each row's event key and mapped story ID.

### 4. Cross-reference and report

Check for:

- **Orphan events** — event keys in code with no matching row in
  `USAGE_DATA.md` or no mapped user story
- **Stale mappings** — rows in `USAGE_DATA.md` referencing event keys
  that no longer exist in code
- **Missing stories** — `TEL-*` story IDs referenced in `USAGE_DATA.md`
  that don't exist in `user-stories.yaml`
- **Stale stories** — `TEL-*` stories in `user-stories.yaml` that no
  event maps to
- **Implementation gaps** — events defined in `LightspeedEvents` but
  never called via `sendEvent` in the source (informational, not blocking)

### 5. Fix drift

For each finding:

- **Orphan event**: Add a row to `USAGE_DATA.md` and create a `TEL-*`
  story in `user-stories.yaml` if needed
- **Stale mapping**: Remove the row from `USAGE_DATA.md`
- **Missing story**: Add the story to `user-stories.yaml`
- **Stale story**: Remove from `user-stories.yaml` or note as planned

### 6. Verify

Confirm zero orphan events and zero stale mappings after fixes.

## Output Format

Report findings as a checklist:

```text
telemetry audit:
  [x] 12 events defined in code
  [x] 12 events mapped in USAGE_DATA.md
  [x] 7 TEL-* stories in user-stories.yaml
  [x] 0 orphan events
  [x] 0 stale mappings
  [ ] 8 events defined but not yet instrumented (sendEvent not called)

Fixes applied:
  - (none needed)
```
