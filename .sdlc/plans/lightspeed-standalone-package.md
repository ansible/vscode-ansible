# Lightspeed Standalone Package — Implementation Plan

Related: [ADR-015](../adrs/ADR-015-lightspeed-standalone-package.md)

## Overview

Port Lightspeed (WCA-only) from `main` to `next` as an isolated, opt-in
`packages/lightspeed` workspace package with existing Vue webviews,
designed for easy removal in a few months.

## Architecture

`packages/lightspeed/` owns all domain logic; `src/` contains only a
thin registration shim.

```
packages/lightspeed/ (@ansible/lightspeed)
├── src/
│   ├── index.ts            # Public API barrel
│   ├── definitions.ts      # Commands, URLs, constants
│   ├── interfaces.ts       # Request/response types
│   ├── api.ts              # WCA HTTP API client
│   ├── errors.ts           # Error classes and registry
│   ├── handleApiError.ts   # Error mapping
│   ├── telemetry.ts        # TelemetryReporter interface + event types
│   ├── oauth/              # OAuth provider + user session
│   ├── inline/             # Inline suggestion engine
│   ├── generation/         # Playbook + role generation
│   ├── explanation/        # Playbook + role explanation
│   ├── contentMatches/     # Training matches panel
│   ├── statusBar.ts        # Status bar integration
│   └── utils/              # Shared utilities
├── webviews/               # Vue webviews (ported as-is)
├── test/
│   ├── unit/               # Vitest unit tests (per-phase)
│   ├── helpers/            # Shared test utilities
│   │   └── mockContext.ts  # VS Code ExtensionContext mock factory
│   ├── wdio/               # WDIO E2E tests + mock server
│   └── fixtures/           # Test fixtures
├── package.json
├── tsconfig.json
├── vitest.config.mts       # Package-local vitest config
├── vite.config.mts         # Webview build config
└── wdio.conf.ts            # Package-local WDIO config
```

### Package boundary

`packages/lightspeed/` takes `vscode` as an optional peer dependency
throughout all phases. Note: this is the first workspace package to use
`vscode` as a peer dep (`@ansible/language-server` depends on
`vscode-languageserver`, which is a different library).

The `activate(context: vscode.ExtensionContext, telemetry: TelemetryReporter)`
entry point receives the VS Code extension context. The package pushes its
own disposables onto `context.subscriptions` for clean lifecycle management.

### esbuild integration

The extension uses esbuild for bundling. `@ansible/lightspeed` is integrated
via the esbuild `alias` map in `scripts/build.mjs`, the same pattern used
for `@ansible/services` and `@ansible/common`:

```javascript
alias: {
    '@ansible/lightspeed': path.join(ROOT, 'packages', 'lightspeed', 'src'),
    '@ansible/services': path.join(ROOT, 'packages', 'services', 'src'),
    '@ansible/common': path.join(ROOT, 'packages', 'common', 'src'),
},
```

This means lightspeed code is always bundled into the extension output.
The shim's `if (!enabled) return` prevents execution, not loading.
"Zero activation cost" means zero runtime cost (no JS execution, no event
listeners), not zero bytes in the bundle. This is acceptable for a temporary
feature.

The shim uses a normal `import`, not `require()`.

### Boundary rules

**Inside `packages/lightspeed/`:**

- All domain logic (WCA API client, OAuth, inline suggestions,
  generation, explanation, training matches)
- Types and interfaces
- Vue webview panels with a package-local Vite config
- Own test suites (vitest + WDIO) with fixtures and mock servers
- Settings schema constants
- `TelemetryReporter` interface and event type definitions
- Shared `test/helpers/mockContext.ts` for VS Code ExtensionContext mocking

**Inside `src/features/lightspeed/` (thin shim, ~200 LOC TS + ~150 lines JSON in contributes):**

- `register.ts` — single entry point called from `extension.ts`
  - Checks `ansible.lightspeed.enabled` (default: `false`)
  - If disabled, returns early (zero runtime cost)
  - If enabled, imports `@ansible/lightspeed` and calls
    `activate(context, telemetryReporter)`
  - Returns a `Disposable` for clean deactivation
- No business logic, no state, no direct API calls

**Note:** Static `package.json` contributions (command declarations,
settings schema, auth provider registration) are parsed by VS Code at
install time regardless of the `enabled` setting. This is standard
VS Code behavior and does not represent runtime cost.

**Root `package.json` contributes:**

- Lightspeed commands, settings, auth provider, activation events,
  keybindings, menus
- Grouped with comment markers for easy identification and bulk removal

### Package dependencies

```
@ansible/lightspeed → @ansible/services → @ansible/common
```

No dependency on `@ansible/ui` — Vue webviews are self-contained.

External deps Lightspeed brings:

- `vue`, `primevue`, `@primeuix/themes` — webview UI
- `vite` — package-local webview build (devDependency)
- `uuid` — OAuth session IDs
- `marked` + `highlight.js` — explanation rendering

All Vue/Vite dependencies are scoped to `packages/lightspeed/package.json`
only. They do not appear in the root `package.json`.

### Telemetry strategy

The `next` branch currently has no telemetry infrastructure (pending TODO
at `.sdlc/todos/pending/add-telemetry.md`). The Lightspeed package defines
a `TelemetryReporter` interface and accepts a reporter via `activate()`.

Until extension-level telemetry lands, the shim passes a no-op reporter.
This decouples the Lightspeed port from the telemetry decision.

```typescript
// packages/lightspeed/src/telemetry.ts
export interface TelemetryReporter {
  sendEvent(name: string, properties?: Record<string, string>): void;
}

export const noopReporter: TelemetryReporter = {
  sendEvent() {},
};
```

Telemetry event types to define (ported from `main`):
- `lightspeed.suggestion.accepted` / `rejected` / `ignored`
- `lightspeed.generation.open` / `close` / `transition` / `accept`
- `lightspeed.explanation.requested`
- `lightspeed.feedback.thumbsUp` / `thumbsDown`
- `lightspeed.contentMatches.fetched`

### Settings namespace

Keep `ansible.lightspeed.*` for backward compatibility. The `enabled`
setting defaults to `false` on `next` (opt-in).

Users configure lightspeed settings via VS Code's standard settings UI
(JSON editor or Settings GUI). The `llmProviderPanel.ts` settings webview
from `main` is not ported (it was for multi-provider configuration).

### Test strategy

Unit tests ship with each phase (shifted left). E2E/WDIO tests ship
in Phase 7. Each phase's PR includes code + tests.

- **Unit tests:** own `vitest.config.mts` inside the package, not in
  root config. `npm test` at root never touches Lightspeed.
- **Shared mock factory:** `test/helpers/mockContext.ts` provides
  `createMockExtensionContext()` with mocked `subscriptions`,
  `secrets`, `globalState`, and `workspaceState`. Created in Phase 2,
  reused by all subsequent phases.
- **WDIO tests:** own `wdio.conf.ts` and mock server. Root WDIO runs
  are unaware of Lightspeed specs.
- **Dedicated runners:**
  - `npm run test -w packages/lightspeed` — unit tests
  - `npm run test:wdio -w packages/lightspeed` — E2E tests

## Scoping decisions

### WCA only

The multi-LLM provider system (Google Gemini, RH Custom /
OpenAI-compatible) is **not ported**. Removed:

- `ProviderManager`, provider base/factory
- `GoogleProvider` + `@google/genai`
- `RHCustomProvider` + `openaiCompatibleClient.ts`
- `LlmProviderSettings`, secret storage for API keys
- Provider management commands and settings panel
- Deprecated settings (`provider`, `apiKey`, `modelName`)

The API client talks directly to WCA; auth is OAuth-only.

### Vue webviews kept as-is

Rewriting ~25 Vue components in React for a temporary feature is not
justified. Two UI frameworks coexist temporarily — both disappear when
the package is deleted.

## What already exists

- **Phase 1 API client** (`packages/lightspeed/src/api.ts`): shipped,
  7 WCA endpoint methods, framework-agnostic via `LightspeedApiConfig` DI
- **Phase 1 types** (`interfaces.ts`, `definitions.ts`): all WCA
  request/response types, commands, constants
- **Phase 1 error handling** (`errors.ts`, `handleApiError.ts`):
  40+ error scenarios, `ErrorRegistry`, `mapError()`
- **Root build graph**: tsconfig references and package.json workspace
  wiring already include `@ansible/lightspeed`
- **`@ansible/services`**: shared CLI discovery, caching — reused by
  lightspeed, not rebuilt
- **ADR-015**: architectural decision documented and approved

## NOT in scope

- Multi-LLM provider system (Google, RH Custom, OpenAI-compatible) —
  WCA-only scoping eliminates this
- Vue-to-React rewrite of webview components — temporary feature,
  not justified
- Content creator cross-dependency — coupling from `main` not recreated
- Settings webview panel — users use VS Code's native settings UI
- Explorer sidebar view — not used in `next` architecture
- One-click trial flow — multi-provider onboarding, not applicable
- Performance optimization beyond matching `main` behavior — temporary
  feature

## Implementation phases

### Phase 0: ADR ✅

Write ADR-015 documenting the decision.

### Phase 1: Package skeleton + types + WCA API client ✅

- Created `packages/lightspeed/` following mcp-server pattern
- Ported types/interfaces from `src/interfaces/lightspeed.ts` and
  `src/definitions/lightspeed.ts`
- Ported WCA API client (`api.ts`, `handleApiError.ts`, `errors.ts`)
- Wired into root build graph (tsconfig, workspace)
- Committed this plan and ADR-015

**Follow-up (before Phase 2):**
- Standardize API return types: all methods should return `T | IError`
  (not `T | undefined`). Update `completionRequest()` and
  `feedbackRequest()` to return `IError` on error instead of `undefined`.
- Add unit tests for Phase 1: API client methods, error registry,
  mapError(), getFetch(). Create `test/unit/api.test.ts`,
  `test/unit/errors.test.ts`.
- Create `vitest.config.mts` for the package.

### Phase 2: WCA provider (simplified)

- Port WCA-specific logic only — direct API client, no routing layer
- Drop all BYOLLM code
- Define `TelemetryReporter` interface in `src/telemetry.ts`
- Create shared `test/helpers/mockContext.ts` for ExtensionContext mocking
- Write unit tests for LightSpeedManager

**Simplified LightSpeedManager API (post-stripping):**

```typescript
interface LightSpeedManager {
  constructor(context: ExtensionContext, telemetry: TelemetryReporter);
  readonly api: LightSpeedAPI;
  readonly user: LightspeedUser;
  readonly statusBar: LightspeedStatusBar;
  initialize(): Promise<void>;
  reinitialize(): Promise<void>;
  dispose(): void;
}
```

No `providerManager`, no `getProvider()`, no provider factory calls.
The manager talks to `LightSpeedAPI` directly for all WCA requests.

**Key files to port:**

- `base.ts` (LightSpeedManager) — stripped of provider routing
- `statusBar.ts` — status bar integration

**Files to drop entirely:**

- `providerManager.ts` (multi-provider routing, replaced by direct WCA calls)
- `providers/*` (Google Gemini, RH Custom, base interface, factory)
- `clients/*` (OpenAI-compatible HTTP client)
- `commands/providerCommands.ts` (provider switching/testing commands)
- `llmProviderSettings.ts` (secret storage for API keys, not needed for OAuth-only)

**Tests:** `test/unit/manager.test.ts`, `test/unit/statusBar.test.ts`

**Rollback:** Revert the Phase 2 PR. No runtime impact on the extension
since the shim is not wired until Phase 6.

### Phase 3: OAuth + user session

- Port `lightSpeedOAuthProvider.ts` and `lightspeedUser.ts`
- Export `createAuthProvider()` factory
- Write unit tests using shared mockContext

**Tests:** `test/unit/oauth.test.ts`, `test/unit/user.test.ts`

**Rollback:** Revert the Phase 3 PR. OAuth provider is not registered
until Phase 6.

### Phase 4: Inline suggestions

- Port `inlineSuggestions.ts` and `ansibleContext.ts`
- Port suggestion utilities
- Export `InlineSuggestionsFeature` for the shim
- Write unit tests

**Key files to port:**

- `inlineSuggestions.ts` (VS Code inline completion provider)
- `ansibleContext.ts` (Ansible-specific context for prompts)
- `inlineSuggestion/suggestionDisplayed.ts` (tracking)
- `utils/data.ts` (suggestion eligibility)
- `utils/multiLinePromptForMultiTasks.ts`
- `utils/promiseHandlers.ts`
- `utils/scanner.ts`

**Tests:** `test/unit/inlineSuggestions.test.ts`,
`test/unit/ansibleContext.test.ts`

**Rollback:** Revert the Phase 4 PR. No inline provider registered
until Phase 6.

### Phase 5: Vue webviews + Vite build

- Copy `webviews/lightspeed/` into `packages/lightspeed/webviews/`
- Create package-local `vite.config.mts` for the 4 kept entry points
  (playbook generation, role generation, explanation, training matches)
- Port `webviewMessageHandlers.ts` and status bar logic
- Drop LLM provider settings and explorer webviews
- **Verify CSP compatibility** between `next`'s webview panels and
  Vue/PrimeVue requirements (compare CSP headers, nonce generation)
- Write unit tests for message handlers

**Key files to port:**

- `vue/views/playbookGenPanel.ts` — playbook generation wizard
- `vue/views/roleGenPanel.ts` — role generation wizard
- `vue/views/explanationPanel.ts` — playbook/role explanation
- `contentMatchesWebview.ts` — training data matches
- `vue/views/webviewMessageHandlers.ts` — message routing
- `vue/views/fileOperations.ts` — file creation/writing
- Supporting utils (`explanationUtils.ts`, `outlineGenerator.ts`,
  `parsePlays.ts`, `readVarFiles.ts`, `getRoleNameFromFilePath.ts`,
  `getRoleNamePathFromFilePath.ts`, `updateRolesContext.ts`,
  `watchers.ts`, `webUtils.ts`)

**Files to DROP (not ported):**

- `vue/views/llmProviderPanel.ts` (multi-provider settings UI, not
  applicable to WCA-only)
- `vue/views/llmProviderMessageHandlers.ts` (message handlers for
  dropped provider panel)
- `vue/views/helloWorld.ts` (onboarding panel for multi-provider setup,
  not needed)
- `explorerWebviewViewProvider.ts` (explorer sidebar view, not used on
  `next` architecture)
- `utils/oneClickTrial.ts` (trial signup flow for multi-provider
  onboarding, not applicable to WCA-only OAuth)

**Build integration:**

The package-local `vite.config.mts` builds Vue webviews independently
of the root esbuild pipeline. Add a `build:lightspeed` script to the
root `package.json` that runs `pnpm run build -w packages/lightspeed`.
The root `task build` command chains this after the existing esbuild
step. No changes to the React/esbuild toolchain are needed — Vite is
self-contained within the Lightspeed package.

**Webview asset path resolution:**

Vite outputs webview bundles to `packages/lightspeed/dist/webviews/`.
The webview panels construct `webview.html` using
`vscode.Uri.joinPath(extensionUri, 'packages', 'lightspeed', 'dist', 'webviews', ...)`.
Verify this path resolves correctly in both development and packaged
(.vsix) modes.

**.vsix packaging:**

Update `.vsignore` (or `package.json` `files` field) to include:
- `packages/lightspeed/out/` (compiled TypeScript)
- `packages/lightspeed/dist/webviews/` (Vite-built Vue bundles)

Without this, the extension installs from marketplace with missing
lightspeed files. Add this step to the removal checklist.

**Tests:** `test/unit/messageHandlers.test.ts`,
`test/unit/fileOperations.test.ts`

**Rollback:** Revert the Phase 5 PR. Vue dependencies are scoped to
the package and don't affect the root build.

### Phase 6: Extension shim + integration

- Write `src/features/lightspeed/register.ts` (~200 LOC TypeScript)
- Wire into `extension.ts` with `registerLightspeed(context)`
- Add `package.json` contributes entries (~150 lines JSON)
- Add `@ansible/lightspeed` to esbuild alias in `scripts/build.mjs`
- Default `ansible.lightspeed.enabled` to `false`

**Shim implementation:**

```typescript
// src/features/lightspeed/register.ts
import { activate } from "@ansible/lightspeed";
import { noopReporter } from "@ansible/lightspeed";

export async function registerLightspeed(
  context: vscode.ExtensionContext,
): Promise<vscode.Disposable | undefined> {
  const config = vscode.workspace.getConfiguration("ansible.lightspeed");
  if (!config.get<boolean>("enabled", false)) {
    return undefined; // Zero runtime cost
  }

  return activate(context, noopReporter);
}
```

**Rollback:** Revert the Phase 6 PR, or set `ansible.lightspeed.enabled`
to `false` to disable all runtime effects without reverting.

### Phase 7: E2E tests + CI integration

- Port WDIO tests + mock server into `packages/lightspeed/test/wdio/`
- Port test fixtures
- Create package-local WDIO config
- Validate isolation: root test runs unaffected
- **Update `.github/workflows/ci.yaml`** to include lightspeed:
  - Build step: run `build:lightspeed` script
  - Test step: run lightspeed unit tests (linux-only is acceptable
    for the temporary period)
  - Optional: run lightspeed WDIO tests

## Open questions

1. **Telemetry library.** Which telemetry approach will `next` adopt
   (Red Hat telemetry library vs. VS Code native `vscode.env.telemetryLogger`)?
   The `TelemetryReporter` interface decouples Lightspeed from this decision,
   but the shim needs to know which adapter to inject once telemetry lands.

2. **Settings migration.** Users on `main` with existing
   `ansible.lightspeed.*` settings — will those carry over? VS Code
   persists settings per-workspace, so existing settings should work if
   the namespace is identical. Needs verification.

3. **Bundle size.** Adding Vue + PrimeVue + Vite output to the `.vsix`
   increases the package size. Measure the delta after Phase 5. The
   removal date limits exposure.

## Failure modes

| Codepath | Failure | Test? | Error handling? | User visible? |
|----------|---------|-------|-----------------|---------------|
| OAuth token refresh | Token expired, refresh fails | Phase 3 unit | Session cleared, "Sign In" button shown, VS Code notification with re-auth action | Yes, actionable |
| WCA API request | Network timeout (30s) | Phase 1 unit | Error banner in webview + output channel log | Yes, clear |
| WCA API request | 503 service unavailable | Phase 1 unit | Error banner with specific message | Yes, clear |
| WCA API request | 400 bad request | Phase 1 unit | Error banner with request detail | Yes, clear |
| WCA API request | 429 rate limit | Phase 1 unit | "Too many requests" message | Yes, clear |
| Inline suggestion | AbortController cancel | Phase 4 unit | Silent (expected) | No |
| Vue webview load | CSP blocks scripts | Phase 5 verify | Blank panel | Verified working |
| .vsix packaging | Missing lightspeed files | Phase 7 WDIO | Load failure | Verified working |
| Settings change | reinitialize() throws | Phase 2 unit | Extension error | Yes, error log |
| Role save to new collection | Collection not in workspace | Verified manually | Creates `collections/ansible_collections/{ns}/{name}/roles/` structure | Yes, clear |

Error UX: all panels use `_getUserErrorMessage()` for actionable error
mapping. Auth failures auto-clear the session and show the sidebar
"Sign in" button. Error banners have a styled header and dismiss button.

## Worktree parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Phase 2: Manager | packages/lightspeed/src/ | Phase 1 |
| Phase 3: OAuth | packages/lightspeed/src/oauth/ | Phase 2 |
| Phase 4: Inline | packages/lightspeed/src/inline/ | Phase 3 |
| Phase 5: Webviews | packages/lightspeed/webviews/ | Phase 1 |
| Phase 6: Shim | src/features/lightspeed/ | Phase 2-5 |
| Phase 7: E2E + CI | test/, .github/ | Phase 6 |

**Lane A:** Phase 2 → Phase 3 → Phase 4 (sequential, shared manager)
**Lane B:** Phase 5 (independent, webviews only need Phase 1 API types)

Launch A + B in parallel worktrees. Merge both. Then Phase 6. Then Phase 7.

## Removal checklist

When Lightspeed is deprecated:

**Package removal (bulk delete):**
1. `rm -rf packages/lightspeed/` — all source, tests, webviews, Vue
   deps, Vite config, fixtures, mock server go with it

**Root `package.json` (6 changes):**
2. Remove `"@ansible/lightspeed": "*"` from `dependencies`
3. Remove scripts: `"test:lightspeed"`, `"test:lightspeed:ui"`,
   `"build:lightspeed:webviews"`
4. Remove `contributes.commands` — 6 entries starting with
   `ansible.lightspeed.*`
5. Remove `contributes.menus.commandPalette` — 6 entries for
   lightspeed commands
6. Remove `contributes.menus.editor/context` — 2 entries for
   explain playbook/role
7. Remove `contributes.configuration.properties` — 3 settings:
   `ansible.lightspeed.enabled`, `ansible.lightspeed.URL`,
   `ansible.lightspeed.suggestions.enabled`
8. Remove `contributes.authentication` — `auth-lightspeed` entry
9. Remove `contributes.views` — `ansibleLightspeed` entry

**Root config files (5 changes):**
10. Remove `@ansible/lightspeed` alias from `scripts/build.mjs`
11. Remove `{ "path": "packages/lightspeed" }` from `tsconfig.json`
12. Remove `project('lightspeed', ...)` from `vitest.config.mts`
13. Remove `!packages/lightspeed/out/**` and
    `!packages/lightspeed/dist/**` from `.vscodeignore`
14. Delete `wdio.lightspeed.conf.ts`

**Extension source (2 changes):**
15. Delete `src/features/lightspeed/register.ts`
16. Remove `registerLightspeed()` call and import from
    `src/extension.ts`

**CI (2 changes):**
17. Remove "Build Lightspeed webviews" and "Run Lightspeed UI tests"
    steps from `.github/workflows/ci.yml`
18. Remove "Apply wdio-vscode-service patch" step if no other
    consumer remains

**SDLC docs:**
19. Update ADR-015 status to `Deprecated`
20. Remove this plan document

**Verify:**
21. `npm install && npm run compile && npm run build`
22. `npx vitest run` — all non-lightspeed tests pass
23. `npm run test:ui` — smoke + LS WDIO tests pass

No refactoring of core extension code required.

## Key risks

- **Two UI frameworks.** Vue + React coexist temporarily. Acceptable
  for a feature with a planned removal date.
- **OAuth coupling to VS Code API.** Package accepts `vscode` as a
  peer dep. This is the first workspace package to do so (language-server
  uses `vscode-languageserver`, a different library). Pattern is sound
  but unprecedented in this workspace.
- **Content creator cross-dependency.** On `main`, content creator
  reuses Lightspeed's `WebviewMessageHandlers`. Must not recreate this
  coupling on `next`.
- **Telemetry integration.** Package should export telemetry hooks the
  extension subscribes to, not call telemetry directly. The no-op
  reporter pattern handles the gap until `next` adopts telemetry.

## Implementation tasks

Synthesized from the /plan-eng-review findings. Each task derives from
a specific finding above. Run with Claude Code; checkbox as you ship.

- [x] **T1 (P1, human: ~1h / CC: ~10min)** — api.ts — Standardize return types to `T | IError`
  - Surfaced by: Code Quality — API return type inconsistency (D3)
  - Files: `packages/lightspeed/src/api.ts`, `packages/lightspeed/src/interfaces.ts`
  - Verify: `pnpm run compile -w packages/lightspeed`
- [x] **T2 (P1, human: ~1h / CC: ~15min)** — test/ — Add Phase 1 unit tests + vitest config
  - Surfaced by: Test Review — 0/28 paths tested (D4)
  - Files: `packages/lightspeed/test/unit/api.test.ts`, `packages/lightspeed/test/unit/errors.test.ts`, `packages/lightspeed/vitest.config.mts`
  - Verify: `pnpm run test -w packages/lightspeed`
- [x] **T3 (P2, human: ~30min / CC: ~10min)** — test/helpers/ — Create shared ExtensionContext mock
  - Surfaced by: Outside voice — ExtensionContext mocking needed (D7)
  - Files: `packages/lightspeed/test/helpers/mockContext.ts`
  - Verify: import in Phase 2 unit tests
- [x] **T4 (P2, human: ~30min / CC: ~5min)** — scripts/build.mjs — Add esbuild alias
  - Surfaced by: Step 0 — esbuild bundling strategy (D1)
  - Files: `scripts/build.mjs`
  - Verify: `task build` succeeds
- [x] **T5 (P2, human: ~1h / CC: ~10min)** — Phase 5 — Verify CSP + asset paths + .vsix packaging
  - Surfaced by: Architecture + Outside voice — CSP (D2), packaging (D5)
  - Files: `.vsignore`, webview panel constructors
  - Verify: `task package` includes lightspeed output
- [x] **T6 (P2, human: ~1h / CC: ~15min)** — .github/ — Add CI integration for lightspeed
  - Surfaced by: Outside voice — CI integration missing (D6)
  - Files: `.github/workflows/ci.yaml`
  - Verify: CI runs lightspeed build + tests on PR

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 4 issues, 0 critical gaps |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | issues_found | 13 findings, 3 tensions resolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**CROSS-MODEL:** Both reviewers agree on esbuild alias approach, per-phase
testing, and .vsix packaging requirement. Outside voice caught 3 gaps the
review missed: .vsix packaging, CI integration, ExtensionContext mocking.
All 3 accepted by user.

**VERDICT:** ENG CLEARED — 4 issues found, all resolved. 6 implementation
tasks generated. Ready to implement.

NO UNRESOLVED DECISIONS
