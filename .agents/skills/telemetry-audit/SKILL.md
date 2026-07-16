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
**functional** user story in `.sdlc/user-stories.yaml` (or is documented
as platform baseline) and is documented in `USAGE_DATA.md`.

The closed loop is:

**functional user story (ENV/COL/LS/…)** → WDIO `@covers` →
`USAGE_DATA.md` mapping row → emit event

Do **not** mint meta `TEL-*` stories for telemetry orphans.

## When to Run

- After adding or removing a telemetry event
- After modifying `TelemetryEvents` in `packages/common/src/types/telemetry.ts`
- After modifying `LightspeedEvents` in `packages/lightspeed/src/telemetry.ts`
- As part of PR review for telemetry-related changes
- Periodically to catch drift

## Audit Steps

### 1. Extract telemetry events from code

Read `packages/common/src/types/telemetry.ts` and extract all event keys
from the `TelemetryEvents` object. Read `packages/lightspeed/src/telemetry.ts`
and extract all event keys from the `LightspeedEvents` object. Also grep the
codebase for any `sendEvent` calls that use string literals instead of the enum.

### 2. Extract functional stories from user-stories.yaml

Read `.sdlc/user-stories.yaml` and extract all functional stories
(`ENV-*`, `LSP-*`, `COL-*`, `SCF-*`, `PLB-*`, `EE-*`, `AI-*`, `LS-*`,
`XC-*`, etc.). Build a map of story ID to title for mapping validation.

Reject any remaining `TEL-*` stories — they are meta “track X” stories
and must not be used as the mapping target.

### 3. Extract mapping table from USAGE_DATA.md

Read `USAGE_DATA.md` and parse:

- The **platform baseline** section (events that need no product story)
- The **story-to-event mapping** tables (event key → functional story ID)

### 4. Cross-reference and report

Check for:

- **Orphan events** — event keys in code with no matching row in
  `USAGE_DATA.md` and not listed under platform baseline
- **Stale mappings** — rows in `USAGE_DATA.md` referencing event keys
  that no longer exist in code
- **Missing stories** — functional story IDs referenced in `USAGE_DATA.md`
  that don't exist in `user-stories.yaml`
- **Meta TEL-* mappings** — any mapping or story that uses a `TEL-*` ID
  (blocking; rewrite to a functional story)
- **Implementation gaps** — events defined in code but never called via
  `sendEvent` in the source (informational, not blocking)

### 5. Fix drift

For each finding, choose **one** of these paths — never “create a TEL-*
story”:

- **Orphan event**: Map to an existing functional story in
  `USAGE_DATA.md`, **or** add a real UX story (developer persona) in
  `user-stories.yaml` and map to it, **or** document as platform
  baseline, **or** drop the unused event from code
- **Stale mapping**: Remove the row from `USAGE_DATA.md`
- **Missing story**: Add a functional UX story (developer persona) to
  `user-stories.yaml`, then map the event to it
- **Meta TEL-* mapping**: Replace with a functional story ID from the
  product catalog

### 6. Verify

Confirm zero orphan events, zero stale mappings, and zero `TEL-*`
references after fixes.

## Output Format

Report findings as a checklist:

```text
telemetry audit:
  [x] N events defined in code (TelemetryEvents + LightspeedEvents)
  [x] N product events mapped in USAGE_DATA.md to functional stories
  [x] M platform baseline events documented (no product story)
  [x] 0 TEL-* stories or mappings
  [x] 0 orphan events
  [x] 0 stale mappings
  [ ] K events defined but not yet instrumented (sendEvent not called)

Fixes applied:
  - (none needed)
```
