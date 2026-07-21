# ADR-024: Host-Agnostic Getting Started (Shared Walkthrough Content)

## Status

Implemented

## Date

2026-07-17

## Context

User story XC-004 requires guided walkthroughs so Ansible developers can
learn key workflows without leaving the editor. VS Code provides a native
**Getting Started** surface via `contributes.walkthroughs` and
`workbench.action.openWalkthrough`.

Cursor is a first-class host for this extension (MCP auto-registration,
dogfooding, ADR-019 / ADR-020). Cursor does **not** reliably expose the
VS Code walkthrough / Welcome UI today:

- Command Palette searches for "Walkthrough" often return nothing.
- Help → Welcome fails with unresolved `walkThrough://` resources
  (known Cursor product bug).

If we only ship `contributes.walkthroughs`, Cursor users get no guided
path. If we invent a second Cursor-only content tree, we maintain two
tours that drift. Agent-facing MCP `get_extension_walkthrough` is a
third narrative unless we keep human onboarding content unified.

### Forces

- VS Code users should still get the native Getting Started chrome when
  the host supports it.
- Cursor users need a first-class in-editor path (status bar + command
  palette) that does not depend on host Welcome.
- Walkthrough copy must have a **single source of truth**.
- Usage tracking (`walkthrough.open` → XC-004) must fire for the Cursor
  path, not only for host open.
- Cursor may restore walkthrough support later; the architecture should
  not require a content rewrite when that happens.

## Decision

**We will treat `package.json` `contributes.walkthroughs` (plus referenced
`media/walkthroughs/**` files) as the single content source, and render
that same contribution through host-appropriate shells.**

Concrete rules:

1. **Content SoT** — Step titles, descriptions, command links, and media
   live only under `contributes.walkthroughs` and `media/walkthroughs/`.
   Do not duplicate step copy in TypeScript, MCP handlers, or agent skills.
2. **VS Code shell** — Keep the contribution so Welcome / Open Walkthrough
   works when the host supports it.
3. **Cursor-safe shell** — `Ansible: Get Started` and the Ansible status
   bar **Get Started** link open an in-extension panel that reads
   `extension.packageJSON.contributes.walkthroughs` at runtime and renders
   steps with sidebar navigation.
4. **Telemetry** — Opening the panel (or the telemetry open helper) emits
   `walkthrough.open` with `walkthroughId` (e.g.
   `redhat.ansible#ansible-getting-started`), mapped to XC-004 in
   `USAGE_DATA.md`.
5. **Content expansion** — Prefer end-user modules from
   `.agents/skills/ux-walkthrough/walkthrough-modules.json` as a *catalog*
   when authoring steps. Do not copy dogfood-only setup (F5, build,
   scaffold review workspace) into product walkthroughs. The UX skill
   remains internal release feedback, not the product UI.
6. **Exit criteria** — If Cursor restores walkthrough host UI, prefer
   opening the host walkthrough where it works; keep the panel as a
   fallback or thin wrapper. **Do not** fork a second content tree.

## Alternatives Considered

### Alternative 1: VS Code walkthroughs only

**Description**: Ship `contributes.walkthroughs` and document that Cursor
users should use VS Code or MCP for guidance.

**Pros**:

- Zero custom UI.
- Native Getting Started chrome on VS Code.

**Cons**:

- XC-004 is broken for Cursor humans.
- Conflicts with Cursor as a first-class host (ADR-019 / ADR-020).

**Why not chosen**: Leaves a primary IDE without guided onboarding.

### Alternative 2: Cursor-only panel with separate markdown

**Description**: Maintain a dedicated Cursor guide (e.g. under `docs/` or
hardcoded HTML) independent of `contributes.walkthroughs`.

**Pros**:

- Full control of Cursor UX.
- No dependence on host walkthrough APIs.

**Cons**:

- Two tours to maintain; guaranteed drift.
- VS Code Welcome and Cursor Get Started diverge silently.

**Why not chosen**: Violates the single-content-source requirement.

### Alternative 3: Drop `contributes.walkthroughs`; panel everywhere

**Description**: Remove the VS Code contribution; always use the
in-extension panel on every host.

**Pros**:

- One shell, one content path.
- Identical UX on VS Code and Cursor.

**Cons**:

- Loses native Getting Started discovery on VS Code (install/welcome
  flows, marketplace familiarity).
- Harder for users who expect the standard walkthrough chrome.

**Why not chosen**: We can keep native VS Code discovery without
duplicating content; dual shells with one SoT is cheaper than giving up
the host surface.

## Consequences

### Positive

- Cursor and VS Code share one walkthrough definition.
- Status bar / palette entry works without host Welcome.
- XC-004 and `walkthrough.open` stay meaningful on Cursor.
- Clear rule for future contributors: edit `package.json` + media only.

### Negative

- Two shells to keep working (host contribution + panel renderer).
- Panel UX is simpler than native Getting Started (acceptable until
  Cursor restores host support or we invest in richer UI).
- Authors must remember that media markdown is rendered by a small
  subset converter in the panel (headings, links, code, bold) — not a
  full CommonMark engine.

### Neutral

- MCP `get_extension_walkthrough` may remain a longer agent script; it
  should not silently diverge from the human tour's themes. Unifying
  MCP copy with the contribution is encouraged but not required by this
  ADR.
- Native VS Code open (Welcome) and panel open both use the same
  contribution; telemetry may differ in path (host vs
  `walkthrough.open` from our command). Prefer emitting
  `walkthrough.open` from our entry points.

## Implementation Notes

| Piece | Location |
| ----- | -------- |
| Content | `package.json` → `contributes.walkthroughs`, `media/walkthroughs/getting-started/` |
| Panel + command | `src/features/gettingStarted.ts`, `src/features/walkthroughContent.ts` |
| Status bar link | `src/statusBar/ansibleStatusBar.ts` → **Get Started** |
| Telemetry helper | `src/telemetry.ts` → `ansible.telemetry.trackWalkthroughOpen` |
| Story / coverage | XC-004 in `.sdlc/user-stories.yaml`, WDIO `test/ui/walkthroughs.spec.ts` |
| Content catalog (authoring) | `.agents/skills/ux-walkthrough/walkthrough-modules.json` |

Patterns:

- Read walkthroughs via `context.extension.packageJSON`, never hardcode
  step arrays in the panel.
- Prefer `enableCommandUris` so step links run real extension commands.
- When adding steps, update media files next to the contribution in the
  same PR.

## Related Decisions

- [ADR-019](ADR-019-tiered-python-env-capability.md) — Cursor / hosts
  without full VS Code extension APIs still need functional paths.
- [ADR-020](ADR-020-single-repo-multi-distribution.md) — Cursor is an
  explicit distribution target.
- [ADR-023](ADR-023-wdio-feature-coverage.md) — XC-004 and WDIO
  `@covers` for user-facing capabilities.
- [ADR-012](ADR-012-mcp-tool-parity.md) — Agent walkthrough tooling
  remains separate but should not invent a conflicting human tour.

## References

- Issue [#3032](https://github.com/ansible/vscode-ansible/issues/3032) —
  Cursor-friendly getting started
- Issue [#3029](https://github.com/ansible/vscode-ansible/issues/3029) /
  PR [#3031](https://github.com/ansible/vscode-ansible/pull/3031) — XC-004
  WDIO + starter walkthrough
- Cursor forum: Welcome / `walkThrough://` failures
- VS Code contribution point: `contributes.walkthroughs`

---

## Revision History

| Date       | Author            | Change                                      |
| ---------- | ----------------- | ------------------------------------------- |
| 2026-07-17 | Bradley Thornton  | Initial decision; implemented with PR #3031 |
