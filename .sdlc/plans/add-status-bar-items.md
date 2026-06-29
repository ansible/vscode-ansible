# Add Status Bar Items for Environment Info

**Status:** Implemented
**Branch:** `statusbar_next`
**ADR:** [ADR-017](../adrs/ADR-017-status-bar-click-to-quickpick.md)

## Context

The `next` branch showed Ansible environment info only in sidebar tree views.
Users needed at-a-glance visibility of Python environment and Ansible version
while editing playbooks.

The `main` branch used hover tooltips for detail, but these are unreliable
across platforms. This implementation uses click-to-QuickPick instead.

## What was built

### Status bar items (visible only on ansible files)

**Python Environment** (priority 100, right):

- Text: `$(python) Python 3.12 (.venv)` or `$(warning) Select Python`
- Click: QuickPick with env details + Change/Refresh actions
- Updates on: editor change, env change event, config change

**Ansible Metadata** (priority 99, right):

- Text: `$(ansible-logo) 2.19.11` (custom icon font) or `$(warning) 2.19.11`
  or `$(error) Ansible`
- Click: QuickPick with either ADT tool inventory (when installed) or
  individual version info (ansible, python, ansible-lint)
- Updates on: editor change, LS notification, env change, config change

### Custom Ansible icon font

Registered via `contributes.icons` in `package.json` using a woff2 font
generated from the Ansible "A" logo SVG (`resources/icons/ansible.svg`).
Used as `$(ansible-logo)` in status bar text.

### ADT integration

When `ansible-dev-tools` is installed, the QuickPick shows the full `adt
--version` output. When not installed, falls back to LS metadata. ADT
availability is re-checked on each click (not cached when absent) so
installing ADT mid-session works without reload.

### Telemetry readiness

`AnsibleEnvironmentInfo` interface in `statusBarUtils.ts` defines the shared
data model. Both status bar classes expose getter methods
(`getEnvironmentInfo()`, `getMetadata()`) for telemetry consumption.

### Refresh triggers

| Event                                                 | Python     | Ansible                        |
| ----------------------------------------------------- | ---------- | ------------------------------ |
| Active editor change                                  | `update()` | `update()` (fetch if new file) |
| Document open                                         | `update()` | `update()`                     |
| Python env change                                     | `update()` | `forceRefresh()`               |
| Config change (`ansible.*` / `ansibleEnvironments.*`) | `update()` | `forceRefresh()`               |
| QuickPick "Resync"                                    | -          | `forceRefresh()`               |

### Tests

29 unit tests across 3 files:

- `test/unit/statusBar/statusBarUtils.test.ts` (7 tests)
- `test/unit/statusBar/pythonStatusBar.test.ts` (9 tests)
- `test/unit/statusBar/ansibleStatusBar.test.ts` (13 tests)

Strict lint compliance — no `any` types, proper TypeScript mocks.

## File structure

```text
src/statusBar/
├── statusBarUtils.ts     — AnsibleEnvironmentInfo interface + isAnsibleEditor()
├── pythonStatusBar.ts    — Python env status bar + QuickPick
└── ansibleStatusBar.ts   — Ansible metadata status bar + QuickPick + ADT

resources/
├── icons/ansible.svg     — Clean Ansible "A" logo SVG for icon font
└── fonts/
    ├── ansible-icons.woff2  — Generated icon font
    └── ansible-icons.json   — Character mapping

test/unit/statusBar/
├── statusBarUtils.test.ts
├── pythonStatusBar.test.ts
└── ansibleStatusBar.test.ts
```

## Files modified

| Action | Path                                                        |
| ------ | ----------------------------------------------------------- |
| Create | `src/statusBar/statusBarUtils.ts`                           |
| Create | `src/statusBar/pythonStatusBar.ts`                          |
| Create | `src/statusBar/ansibleStatusBar.ts`                         |
| Create | `resources/icons/ansible.svg`                               |
| Create | `resources/fonts/ansible-icons.woff2`                       |
| Create | `resources/fonts/ansible-icons.json`                        |
| Create | `test/unit/statusBar/statusBarUtils.test.ts`                |
| Create | `test/unit/statusBar/pythonStatusBar.test.ts`               |
| Create | `test/unit/statusBar/ansibleStatusBar.test.ts`              |
| Create | `.sdlc/adrs/ADR-017-status-bar-click-to-quickpick.md`       |
| Update | `src/extension.ts` — wire status bars + event listeners     |
| Update | `package.json` — 2 commands + `contributes.icons`           |
| Update | `vitest.config.mts` — `@src` alias for ext project          |
| Move   | `.sdlc/todos/pending/add-status-bar-items.md` → `complete/` |
