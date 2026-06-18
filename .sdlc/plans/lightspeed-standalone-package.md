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
│   ├── oauth/              # OAuth provider + user session
│   ├── inline/             # Inline suggestion engine
│   ├── generation/         # Playbook + role generation
│   ├── explanation/        # Playbook + role explanation
│   ├── contentMatches/     # Training matches panel
│   ├── statusBar.ts        # Status bar integration
│   └── utils/              # Shared utilities
├── webviews/               # Vue webviews (ported as-is)
├── test/
│   ├── unit/               # Vitest unit tests
│   ├── wdio/               # WDIO E2E tests + mock server
│   └── fixtures/           # Test fixtures
├── package.json
├── tsconfig.json
├── vitest.config.mts       # Package-local vitest config
├── vite.config.mts         # Webview build config
└── wdio.conf.ts            # Package-local WDIO config
```

### Boundary rules

**Inside `packages/lightspeed/`:**

- All domain logic (WCA API client, OAuth, inline suggestions,
  generation, explanation, training matches)
- Types and interfaces
- Vue webview panels with a package-local Vite config
- Own test suites (vitest + WDIO) with fixtures and mock servers
- Settings schema constants

**Inside `src/features/lightspeed/` (thin shim, <200 LOC):**

- `register.ts` — single entry point called from `extension.ts`
  - Checks `ansible.lightspeed.enabled` (default: `false`)
  - If disabled, returns early (zero activation cost)
  - If enabled, imports `@ansible/lightspeed` and calls `activate()`
  - Returns a `Disposable` for clean deactivation
- No business logic, no state, no direct API calls

**Root `package.json` contributes:**

- Lightspeed commands, settings, auth provider, activation events,
  keybindings, menus
- Grouped for easy identification and bulk removal

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

### Settings namespace

Keep `ansible.lightspeed.*` for backward compatibility. The `enabled`
setting defaults to `false` on `next` (opt-in).

### Test isolation

- **Unit tests:** own `vitest.config.mts` inside the package, not in
  root config. `npm test` at root never touches Lightspeed.
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

## Implementation phases

### Phase 0: ADR

Write ADR-015 documenting the decision.

### Phase 1: Package skeleton + types + WCA API client

- Create `packages/lightspeed/` following mcp-server pattern
- Port types/interfaces from `src/interfaces/lightspeed.ts` and
  `src/definitions/lightspeed.ts`
- Port WCA API client (`api.ts`, `handleApiError.ts`, `errors.ts`)
- Wire into root build graph (tsconfig, workspace)
- Commit this plan and ADR-015

### Phase 2: WCA provider (simplified)

- Port WCA-specific logic only — direct API client, no routing layer
- Drop all BYOLLM code

### Phase 3: OAuth + user session

- Port `lightSpeedOAuthProvider.ts` and `lightspeedUser.ts`
- Accept `vscode` as a peer dependency
- Export `createAuthProvider()` factory

### Phase 4: Inline suggestions

- Port `inlineSuggestions.ts` and `ansibleContext.ts`
- Port suggestion utilities
- Export `InlineSuggestionsFeature` for the shim

### Phase 5: Vue webviews + Vite build

- Copy `webviews/lightspeed/` into `packages/lightspeed/webviews/`
- Create package-local `vite.config.mts` for the 4 kept entry points
  (playbook generation, role generation, explanation, training matches)
- Port `webviewMessageHandlers.ts` and status bar logic
- Drop LLM provider settings and explorer webviews

### Phase 6: Extension shim + integration

- Write `src/features/lightspeed/register.ts`
- Wire into `extension.ts` with `registerLightspeed(context)`
- Add `package.json` contributes entries
- Default `ansible.lightspeed.enabled` to `false`

### Phase 7: Tests as dedicated suite

- Port unit tests into `packages/lightspeed/test/unit/`
- Port WDIO tests + mock server into `packages/lightspeed/test/wdio/`
- Port test fixtures
- Create package-local vitest and WDIO configs
- Validate isolation: root test runs unaffected

## Removal checklist

When Lightspeed is deprecated:

1. `rm -rf packages/lightspeed/`
2. Remove `"@ansible/lightspeed": "*"` from root `package.json` deps
3. Remove `{ "path": "packages/lightspeed" }` from root `tsconfig.json`
4. Remove `"test:lightspeed"` script alias from root `package.json`
5. Delete `src/features/lightspeed/` shim
6. Remove `registerLightspeed()` call from `src/extension.ts`
7. Remove Lightspeed contributes from `package.json` (commands,
   settings, auth, menus, keybindings)
8. Remove lightspeed media files
9. Remove this plan document
10. Update ADR-015 status to `Deprecated`
11. `npm install && npm run compile && npm run build`

No changes needed to root `vitest.config.mts` or root WDIO config.
No refactoring of core extension code required.

## Key risks

- **Two UI frameworks.** Vue + React coexist temporarily. Acceptable
  for a feature with a planned removal date.
- **OAuth coupling to VS Code API.** Package accepts `vscode` as a
  peer dep, same pattern as `@ansible/language-server`.
- **Content creator cross-dependency.** On `main`, content creator
  reuses Lightspeed's `WebviewMessageHandlers`. Must not recreate this
  coupling on `next`.
- **Telemetry integration.** Package should export telemetry hooks the
  extension subscribes to, not call telemetry directly.
