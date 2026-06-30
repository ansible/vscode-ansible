# ADR-017: Status Bar Click-to-QuickPick Interaction

## Status

Implemented

## Date

2026-06-22

## Context

The `main` branch displays Ansible environment info (Python version, Ansible
version, ansible-lint status) in VS Code status bar items using hover tooltips
for detail. This approach has two problems:

1. **Hover tooltips are unreliable.** VS Code's status bar tooltip rendering
   is inconsistent across platforms and window states — sometimes the tooltip
   appears, sometimes it doesn't. Users cannot depend on hover for critical
   environment information.

2. **Tooltips are read-only.** Even when they render, tooltips show information
   but offer no actions. Users must separately find and invoke commands to
   change their Python environment or resync metadata.

Popular VS Code extensions (Python, GitLens, ESLint) solve this with
click-to-open interactions: clicking a status bar item opens a QuickPick or
command palette with both information and actionable options.

## Decision

Status bar items use **click-to-QuickPick** instead of hover tooltips.

Clicking a status bar item opens a `vscode.window.showQuickPick` that displays:

- **Information items** — current version, path, status (read-only rows)
- **Separator**
- **Action items** — change environment, resync metadata, open output channel

No hover tooltip is set. The status bar text provides the at-a-glance
summary (env name, version number, warning/error icons).

### Custom Ansible icon

A custom icon font (`resources/fonts/ansible-icons.woff2`) is generated
from the Ansible "A" logo SVG and registered via `contributes.icons` as
`$(ansible-logo)`. Used in the status bar text for the Ansible version.

### ADT integration

When `ansible-dev-tools` is installed, the QuickPick shows the full
`adt --version` tool inventory instead of individual LS metadata items.
ADT availability is re-checked on each click (not cached when absent)
so installing ADT mid-session works without reloading.

### Data model

A shared `AnsibleEnvironmentInfo` interface in `src/statusBar/statusBarUtils.ts`
defines the data both status bar items collect. Each status bar class exposes a
getter (`getEnvironmentInfo()`, `getMetadata()`) returning this interface, so
future consumers (telemetry, MCP tools) can read the cached values without
duplicating data collection.

### File structure

Status bar code lives in `src/statusBar/` (a UI infrastructure layer), not in
`src/features/` (feature-specific logic like vault, file association, lightspeed).

```text
src/statusBar/
├── statusBarUtils.ts      — AnsibleEnvironmentInfo interface + isAnsibleEditor()
├── pythonStatusBar.ts     — Python environment status bar
└── ansibleStatusBar.ts    — Ansible metadata status bar
```

## Alternatives Considered

### 1. Hover tooltips (main branch approach)

Same as `main`. Rich markdown tooltips on hover.

**Pros:** No extra UI surface. Standard VS Code pattern.
**Cons:** Unreliable rendering. Read-only. No actions.
**Why not chosen:** Unreliable UX reported by users.

### 2. Webview panel on click

Click opens a full webview panel with detailed environment info.

**Pros:** Complete control over layout. Rich UI.
**Cons:** Heavy for simple version info. Slow to open. Breaks flow.
**Why not chosen:** Overkill for displaying 3-5 version strings.

### 3. Output channel on click

Click shows/focuses the Ansible output channel.

**Pros:** Simple. Already exists.
**Cons:** No structured info. User must search logs. No actions.
**Why not chosen:** Poor discoverability of environment info.

## Consequences

**Positive:**

- Reliable interaction — QuickPick always renders correctly.
- Actionable — users can change env or resync from the same menu.
- Telemetry-ready — shared data model avoids duplicate collection.
- Expandable — new actions or info items are one array push.

**Negative:**

- Extra click required vs. hover (when hover works).
- QuickPick items are text-only — no rich markdown formatting.

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md) — Status bar is VS Code
  UI code in `src/`, consuming data from services in `@ansible/developer-services`.
- [ADR-005](ADR-005-architectural-invariants.md) — No `vscode` dependency
  in core packages; status bar stays in `src/`.
