# ADR-010: Shared UI Component Layer (`@ansible/ui`)

## Status

Accepted

## Date

2026-06-10

## Context

The VS Code extension and Navita Electron app both need to render
content views for execution environments, plugin docs, playbook
progress, and ansible-creator forms. Today the extension uses inline
HTML strings with embedded CSS/JS in webview panels, while Navita uses
React 19 components. This duplication means:

- Bugs fixed in one surface are not fixed in the other
- Schema-driven `ansible-creator` forms diverge in argument-building
  logic
- A future consumer (e.g., Backstage plugin) would need a third
  implementation

Since neither product has shipped yet, now is the right time to
consolidate domain content rendering into a shared React component
library.

## Decision

### 1. Create `packages/ui` with shared React components

A new `@ansible/ui` package provides all domain content views as
React components. It is published as an ES module library and
consumed by both the VS Code extension webviews and Navita.

### 2. Introduce a HostBridge abstraction

Components never import host-specific APIs. Instead, each host
environment provides a bridge implementation that satisfies a typed
interface:

```typescript
interface HostBridgeCore {
    openFile(path: string): Promise<void>;
    showToast(message: string): void;
    getResolvedTheme(): 'light' | 'dark';
    saveViewSettings(settings: { zoom?: number; theme?: string }): Promise<void>;
}

interface EEBridge extends HostBridgeCore {
    getInfo(eeName: string): Promise<EEInfo>;
    getCollections(eeName: string): Promise<EECollection[]>;
    getPythonPackages(eeName: string): Promise<EEPythonPackage[]>;
    getSystemPackages(eeName: string): Promise<EEPackage[]>;
}
```

VS Code webviews use `postMessage` RPC, Navita uses Electron IPC,
and a future Backstage plugin could use REST/GraphQL.

### 3. Semantic CSS token layer

Shared components reference `--ui-*` CSS custom properties. Each host
provides a mapping layer (`--host-*` -> `--ui-*`):

- **VS Code**: Maps `--vscode-*` theme variables to `--host-*`
- **Navita**: Maps its own theme to `--host-*`
- **Backstage**: Would map PatternFly tokens to `--host-*`

### 4. Webview bundling via esbuild

The extension's existing esbuild-based build (`scripts/build.mjs`)
gains a `webview` target that bundles React + `@ansible/ui` components
into a single IIFE (`dist/webview.js`) loaded by webview panels.

### 5. Schema-driven forms consolidate in `@ansible/ui`

The `CreatorFormPanel` (extension) and Navita's creator views both
need to render dynamic forms from `SchemaNode` JSON. The shared
`SchemaForm` component lives in `@ansible/ui`; argument-building
logic is consolidated in `@ansible/core`.

## Consequences

### Positive

- Single source of truth for domain content rendering
- Bug fixes and enhancements apply to all consumers simultaneously
- New consumers (Backstage, CLI TUI) only need a bridge adapter
- Consistent UX across VS Code, Navita, and future surfaces
- Schema-driven forms cannot diverge in argument building

### Negative

- React becomes a required dependency for all UI consumers
- Additional build complexity (webview bundling alongside Node bundles)
- Bridge abstraction adds a layer of indirection

### Neutral

- The package boundary is enforced by the monorepo workspace;
  `@ansible/ui` can only depend on `@ansible/core` and React
- This decision supersedes the current inline HTML approach in the
  extension but does not require removing existing panels immediately

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md): Service-based
  architecture -- domain logic in `@ansible/core`, UI is presentation
- [ADR-005](ADR-005-architectural-invariants.md): Architectural
  invariants (adds invariants 9, 10)

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-06-10 | AI-assisted | Initial decision |
