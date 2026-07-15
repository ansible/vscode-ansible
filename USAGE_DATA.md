# Usage Data (Telemetry)

This extension collects anonymized, opt-in usage data to help improve the
Ansible development experience. Telemetry respects VS Code's built-in
`telemetryLevel` setting — no data is sent unless the user has opted in.

## Dual-stream architecture

The extension has two independent telemetry pipelines:

| Pipeline | Route | Segment source | Amplitude destination |
|---|---|---|---|
| **Extension (client-side)** | VS Code extension -> Segment -> Amplitude | Extension-specific source | Extension-specific destination |
| **Lightspeed (server-side)** | Lightspeed service -> Segment -> Amplitude | Lightspeed service source | Lightspeed service destination |

These are separate Segment sources and Amplitude destinations. There is no
data overlap. Schema coordination with the metrics team will be revisited
if/when execution outcome events (success/failure, host count, collections
used) are introduced on the client side.

## Story-to-event mapping

Every telemetry event must map to a user story in
`.sdlc/user-stories.yaml`. Orphan events (no matching story) are flagged
below. Use the `telemetry-audit` agent skill to validate this mapping.

| Event | Event key | User story | Status |
|---|---|---|---|
| Inline suggestion accepted | `lightspeed.suggestion.accepted` | [TEL-001] Track inline suggestion outcomes | Mapped |
| Inline suggestion rejected | `lightspeed.suggestion.rejected` | [TEL-001] Track inline suggestion outcomes | Mapped |
| Inline suggestion ignored | `lightspeed.suggestion.ignored` | [TEL-001] Track inline suggestion outcomes | Mapped |
| Generation panel opened | `lightspeed.generation.open` | [TEL-002] Track generation panel opens | Mapped |
| Generation panel closed | `lightspeed.generation.close` | [TEL-003] Track generation lifecycle | Mapped |
| Generation step transition | `lightspeed.generation.transition` | [TEL-003] Track generation lifecycle | Mapped |
| Generation content accepted | `lightspeed.generation.accept` | [TEL-003] Track generation lifecycle | Mapped |
| Explanation requested | `lightspeed.explanation.requested` | [TEL-004] Track explanation requests | Mapped |
| Feedback thumbs up | `lightspeed.feedback.thumbsUp` | [TEL-005] Track user feedback signals | Mapped |
| Feedback thumbs down | `lightspeed.feedback.thumbsDown` | [TEL-005] Track user feedback signals | Mapped |
| Content matches fetched | `lightspeed.contentMatches.fetched` | [TEL-006] Track content matches fetched | Mapped |
| Walkthrough opened | `walkthrough.open` | [TEL-007] Track walkthrough opens | Planned |

### Orphan events

No orphan events. All defined events map to a user story.

### Event implementation status

| Event key | Defined | Sent in code |
|---|---|---|
| `lightspeed.suggestion.accepted` | Yes | No (not yet instrumented) |
| `lightspeed.suggestion.rejected` | Yes | No (not yet instrumented) |
| `lightspeed.suggestion.ignored` | Yes | No (not yet instrumented) |
| `lightspeed.generation.open` | Yes | Yes |
| `lightspeed.generation.close` | Yes | No (not yet instrumented) |
| `lightspeed.generation.transition` | Yes | No (not yet instrumented) |
| `lightspeed.generation.accept` | Yes | No (not yet instrumented) |
| `lightspeed.explanation.requested` | Yes | Yes |
| `lightspeed.feedback.thumbsUp` | Yes | No (not yet instrumented) |
| `lightspeed.feedback.thumbsDown` | Yes | No (not yet instrumented) |
| `lightspeed.contentMatches.fetched` | Yes | No (not yet instrumented) |
| `walkthrough.open` | No | No (planned — phase 2) |
