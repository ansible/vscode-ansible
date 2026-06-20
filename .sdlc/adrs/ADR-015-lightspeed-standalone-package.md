# ADR-015: Lightspeed as a Standalone Opt-In Package

## Status

Implemented

## Date

2026-06-18

## Context

Ansible Lightspeed (IBM watsonx Code Assistant integration) provides
inline code suggestions, playbook/role generation, playbook/role
explanation, and training data attribution. On the `main` branch it is
deeply embedded in the extension root: ~158 files, ~30 k LOC, 67
references in `extension.ts`, plus coupling into settings, telemetry,
content creator helpers, and the Vite build graph. It was never designed
to be removable.

The `next` branch (`ansible-environments`) intentionally excluded
Lightspeed during the rewrite and has a clean npm-workspace monorepo
with well-isolated packages (`common`, `services`, `ui`,
`language-server`, `mcp-server`).

A business requirement now asks us to bring Lightspeed functionality
to `next` **for a limited period** (a few months) while maintaining the
ability to cleanly remove it afterward. This ADR records the
architectural approach chosen.

### Scoping decisions

- **WCA only.** The multi-LLM provider system (Google Gemini, Red Hat
  Custom / OpenAI-compatible) is not ported. Only the Watson Code
  Assistant (WCA) backend is supported, which simplifies the provider
  layer and eliminates the `@google/genai` dependency and API-key
  management paths.
- **Vue webviews ported as-is.** The `main` branch uses Vue + PrimeVue
  for Lightspeed webviews; `next` uses React + `@ansible/ui` for
  everything else. Rewriting ~25 Vue components in React for a
  temporary feature is not justified. The existing Vue code is ported
  into the package with a dedicated Vite build.
- **Isolated test suites.** Unit tests (vitest) and E2E tests (WDIO)
  live inside `packages/lightspeed/` with their own configs and
  runners. They never appear in the core test runs.

## Decision

**We will port Lightspeed as an opt-in `packages/lightspeed` workspace
package with WCA-only support, existing Vue webviews, and isolated test
suites, designed for clean removal.**

### Package boundary

`packages/lightspeed/` (`@ansible/lightspeed`) owns:

- All domain logic: WCA API client, OAuth, inline suggestions,
  generation/explanation, training matches.
- Types and interfaces (ported from `src/interfaces/lightspeed.ts` and
  `src/definitions/lightspeed.ts` on `main`).
- Vue webview panels with a package-local `vite.config.mts`.
- Own vitest and WDIO test suites with fixtures and mock servers.

The extension (`src/`) contains a thin registration shim
(`src/features/lightspeed/register.ts`, target <200 LOC) that:

1. Checks the `ansible.lightspeed.enabled` setting (default: `false`).
2. If enabled, imports `@ansible/lightspeed` and calls `activate()`.
3. Returns a `Disposable` for clean deactivation.

### Settings

The `ansible.lightspeed.*` namespace is preserved for backward
compatibility. The `enabled` setting defaults to `false` on `next`,
making Lightspeed fully opt-in.

### Activation

`package.json` contributes entries (commands, settings, auth provider,
keybindings, menus) are grouped for easy identification and bulk
removal.

## Alternatives Considered

### A1: Embed Lightspeed in `src/` like `main`

Copy the Lightspeed code directly into the extension source tree,
mirroring the `main` branch layout.

**Pros:** Fastest initial port; no package boundary design needed.

**Cons:** Recreates the tight coupling that makes removal painful on
`main`. Touching `extension.ts`, settings, telemetry, and build config
in ~10+ cross-cutting files. Removal would require careful refactoring
rather than `rm -rf`.

**Why not chosen:** Defeats the primary goal of easy removal.

### A2: Separate VS Code extension

Publish Lightspeed as a standalone VS Code extension that communicates
with the main extension via the extension API.

**Pros:** Cleanest possible isolation; removal is a marketplace
unpublish.

**Cons:** Adds publish/install overhead; cross-extension communication
adds complexity and latency; settings split across two extensions
confuses users; CI must build and test two artifacts.

**Why not chosen:** Over-engineered for a temporary feature lasting a
few months.

### A3: Don't bring Lightspeed to `next`

Keep Lightspeed on `main` only and let users who need it stay on
`main`.

**Pros:** Zero effort; `next` stays clean.

**Cons:** Not viable given the business requirement.

**Why not chosen:** Doesn't meet the requirement.

## Consequences

### Positive

- **Clean removal path.** Deleting the package directory plus a handful
  of registration lines removes Lightspeed completely. A documented
  removal checklist makes this a mechanical task.
- **Core test suite unaffected.** Root `npm test` and WDIO runs never
  include Lightspeed tests.
- **Opt-in activation.** Users who don't enable Lightspeed pay zero
  activation cost.
- **Established pattern.** Follows the same workspace package pattern
  as `@ansible/mcp-server`.

### Negative

- **Two UI frameworks.** Vue (Lightspeed) and React (everything else)
  coexist in the `.vsix`, increasing bundle size temporarily.
- **Additional build tooling.** Vite remains in the workspace for
  Lightspeed webviews alongside the esbuild pipeline.
- **Temporary by design.** Knowing the package will be removed may
  discourage investment in code quality or thorough review.
- **Vue/Vite dependencies** are added to the workspace solely for
  Lightspeed.

### Neutral

- The `@ansible/lightspeed` package accepts `vscode` as a peer
  dependency, consistent with how `@ansible/language-server` handles
  VS Code API access.

## Implementation Notes

The implementation plan is tracked in
[`.sdlc/plans/lightspeed-standalone-package.md`](../plans/lightspeed-standalone-package.md).

### Implemented file structure

```
packages/lightspeed/           — all lightspeed code, removed as a unit
├── src/
│   ├── index.ts               — barrel exports
│   ├── activate.ts            — activation entry point + mockSession
│   ├── api.ts                 — WCA API client (7 endpoints)
│   ├── definitions.ts         — commands, constants, regex patterns
│   ├── interfaces.ts          — request/response types
│   ├── errors.ts              — error classes, registry, isError()
│   ├── handleApiError.ts      — HTTP error mapping
│   ├── telemetry.ts           — TelemetryReporter interface + noopReporter
│   ├── oauth/provider.ts      — OAuth PKCE flow, token refresh
│   ├── commands/
│   │   ├── generation.ts      — playbook/role generation commands
│   │   ├── explanation.ts     — playbook/role explanation commands
│   │   └── inlineSuggestions.ts — inline completion provider
│   ├── panels/
│   │   ├── panelUtils.ts      — webview HTML loading, CSP, nonce
│   │   ├── playbookGenPanel.ts — playbook generation webview panel
│   │   ├── roleGenPanel.ts    — role generation webview panel
│   │   └── explanationPanel.ts — explanation webview panel
│   ├── utils/
│   │   ├── webUtils.ts        — OAuth helpers, URI handler
│   │   └── promiseHandlers.ts — promise-from-event utility
│   └── views/lightspeedView.ts — sidebar tree data provider
├── webviews/                  — Vue 3 frontend (Vite build)
│   ├── src/
│   │   ├── PlaybookGenApp.vue, RoleGenApp.vue, ExplanationApp.vue
│   │   ├── components/ (17 Vue components)
│   │   ├── utils/ (vscodeApi wrapper, outline line numbers)
│   │   ├── types.ts, lightspeed.css
│   │   └── playbook-generation.ts, role-generation.ts, explanation.ts
│   └── *.html (3 entry points)
├── test/
│   ├── unit/ (9 test files, 125 tests)
│   ├── helpers/mockContext.ts
│   └── wdio/ (E2E: lightspeed.spec.ts, mock-server.ts, fixtures/)
├── package.json               — Vue/Vite/PrimeVue deps scoped here
├── vite.config.mts            — webview build config
├── vitest.config.mts          — unit test config
└── tsconfig.json

Root files referencing lightspeed (touched during removal):
├── src/features/lightspeed/register.ts   — shim (delete)
├── wdio.lightspeed.conf.ts               — E2E config (delete)
├── src/extension.ts                      — registerLightspeed() call
├── scripts/build.mjs                     — esbuild alias
├── tsconfig.json                         — project reference
├── vitest.config.mts                     — vitest project entry
├── .vscodeignore                         — out/dist exceptions
├── .github/workflows/ci.yml             — build + test steps
└── package.json                          — contributes, scripts, dep
```

### Removal checklist

See the detailed 23-step removal checklist in
[`.sdlc/plans/lightspeed-standalone-package.md`](../plans/lightspeed-standalone-package.md#removal-checklist).

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md) — Service-Based
  Architecture (established the package pattern this ADR builds on)
- [ADR-004](ADR-004-intentional-exclusions-from-main.md) — Intentional
  Feature Exclusions from `main` (Lightspeed was excluded; this ADR
  partially reverses that decision for a limited period)
- [ADR-011](ADR-011-package-architecture.md) — Package Architecture
  (defines `@ansible/common` and `@ansible/services` that this package
  depends on)

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-06-18 | — | Initial proposal |
