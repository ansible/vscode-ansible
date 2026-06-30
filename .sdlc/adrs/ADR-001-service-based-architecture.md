# ADR-001: Service-Based Architecture with VS Code-Independent Core

## Status

Implemented

## Date

2026-05-26

## Context

The original `vscode-ansible` extension was built as a monolithic VS Code extension where domain logic, UI code, and editor integration were deeply interleaved. Key problems:

### Tight coupling to VS Code APIs

Services like collection discovery, command execution, and environment management directly imported `vscode` throughout. This made the code impossible to reuse outside VS Code — for example, in a standalone language server, CLI tool, or MCP server for AI assistants.

### Monolithic language server

The language server (`packages/ansible-language-server/`) was its own npm package but carried its own copy of domain logic (e.g., `DocsLibrary` for module documentation, `AnsibleConfig` for configuration parsing). This duplicated concepts that the extension also maintained separately, leading to divergent behavior between the sidebar views and the editor's hover/completion providers.

### No standalone consumption path

Growing demand for Ansible tooling in non-VS Code contexts — Neovim LSP clients, MCP-aware AI assistants, CI pipelines — required the core functionality to work without a VS Code runtime. The monolithic architecture made this structurally impossible without forking.

### Forces

- The VS Code extension must remain the primary consumer and provide a first-class editing experience.
- The language server must be usable by any LSP-compatible editor, not just VS Code.
- AI assistants (GitHub Copilot, Claude, etc.) need Ansible-aware tools via MCP — these run as standalone Node processes with no VS Code dependency.
- Shared services (collection discovery, command execution, environment detection) must behave identically regardless of the consumer.
- The `vscode` module is only available at runtime inside VS Code's extension host. Code that `import`s it unconditionally cannot run outside VS Code.

## Decision

**We will organize the codebase as a pnpm monorepo with three packages — `@ansible/core`, `@ansible/language-server`, and `@ansible/mcp-server` — where `@ansible/core` contains all VS Code-independent domain logic and the other packages are thin consumer shells.**

```text
packages/
  core/             → @ansible/core
  language-server/  → @ansible/language-server
  mcp-server/       → @ansible/mcp-server
src/
  extension.ts      → VS Code extension entry point
  panels/           → Webview panels
  views/            → TreeView providers
  services/         → VS Code-specific services
```

### `@ansible/core` — the domain layer

- Contains all services: `CollectionsService`, `CommandService`, `CreatorService`, `DevToolsService`, `ExecutionEnvService`, `EnvironmentCache`, and collection cache implementations.
- Has **zero** hard dependencies on `vscode`. Where VS Code APIs are beneficial (e.g., `workspace.workspaceFolders`, `window.setStatusBarMessage`), the service uses a conditional `require('vscode')` wrapped in a try/catch. When `vscode` is unavailable, the service falls back to `process.cwd()`, console logging, or no-ops.
- Only dependency: `js-yaml`.
- Consumable by any Node.js process — VS Code extension, language server, MCP server, CLI, or test harness.

### `@ansible/language-server` — the LSP consumer

- Depends on `@ansible/core` and `vscode-languageserver`.
- Provides completion, hover, diagnostics, semantic tokens, and validation for Ansible YAML files.
- Runnable standalone via `node cli.js` using stdio or IPC transport — editors connect over the standard LSP protocol.

### `@ansible/mcp-server` — the AI tools consumer

- Depends on `@ansible/core` and `@modelcontextprotocol/sdk`.
- Exposes Ansible development tools (collection search, plugin docs, linting) to AI assistants via the Model Context Protocol.
- Runnable standalone via `ansible-environments-mcp` binary using stdio transport.

### VS Code extension (`src/`)

- The extension entry point (`extension.ts`) and UI code (panels, views, services) live in the root `src/` directory, outside the packages.
- UI code imports from `@ansible/core` for domain operations and spawns the language server as a child process.
- VS Code-specific integrations (Python environment API, terminal service, webview panels) live here — they are never imported by the packages.

## Alternatives Considered

### Alternative 1: Keep the monolithic architecture

**Description**: Continue with domain logic embedded in the extension and language server, with no shared package.

**Pros**:

- No structural changes needed
- Simpler build configuration

**Cons**:

- MCP server would need to duplicate or fork domain logic
- Language server and extension maintain parallel implementations of the same concepts
- Standalone consumption (Neovim, CI) remains impossible

**Why not chosen**: The duplication was already causing behavioral divergence, and the MCP server requirement made it untenable.

### Alternative 2: Extract core as a separate repository

**Description**: Publish `@ansible/core` as an independent npm package in its own git repository.

**Pros**:

- Clean separation of concerns
- Independent versioning

**Cons**:

- Cross-repo development friction (change core, publish, update consumers, test)
- Harder to make atomic changes that span core and consumers
- Additional CI/CD pipeline to maintain

**Why not chosen**: The packages evolve together and benefit from atomic commits. A monorepo with workspace dependencies provides the same separation without the coordination overhead.

### Alternative 3: Dependency injection for VS Code APIs

**Description**: Instead of conditional `require('vscode')`, pass VS Code APIs into services via constructor injection.

**Pros**:

- Explicit dependencies, easier to test with mocks
- No runtime `require` magic

**Cons**:

- Requires threading API objects through the entire call graph
- Every service constructor gains parameters that are `undefined` in standalone mode
- Clutters the public API for non-VS Code consumers who must pass `undefined` for every VS Code parameter

**Why not chosen**: The conditional require pattern is simpler and self-contained — each service decides internally how to degrade. The try/catch is a one-liner at module scope and doesn't leak into the public API.

## Consequences

### Positive

- **Standalone language server**: `@ansible/language-server` works with any LSP client (Neovim, Helix, Emacs) without modification. Editors connect via stdio.
- **Standalone MCP server**: `@ansible/mcp-server` gives AI assistants access to collection search, plugin docs, and linting without VS Code running.
- **Single source of truth**: `CollectionsService`, `CommandService`, and other domain services exist in exactly one place. The extension, language server, and MCP server all use the same implementation.
- **Testability**: Core services can be unit-tested in plain Node.js without mocking VS Code APIs. The test suite runs fast (`vitest run --project core` completes in under 1 second).
- **Clean dependency graph**: `core` has no upstream dependencies on consumers. Consumers depend on `core`. No circular references.

### Negative

- **Conditional require pattern**: The `try { vscode = require('vscode') } catch {}` pattern is unconventional and can surprise contributors unfamiliar with the codebase.
- **Monorepo tooling**: pnpm workspaces add build configuration complexity (workspace protocol, TypeScript project references, coordinated compilation).
- **Degraded standalone behavior**: Some features (e.g., status bar messages, Python environment discovery via the `ms-python.vscode-python-envs` extension) are only available inside VS Code. Standalone consumers get functional but reduced behavior.

### Neutral

- Domain content rendering (EE details, plugin docs, creator forms) moves to `@ansible/ui` as shared React components ([ADR-010](ADR-010-shared-ui-component-layer.md)). VS Code-specific panel boilerplate (lifecycle, webview setup) remains in `src/panels/`.
- Build tooling (`tsc -b` with project references) is standard TypeScript. No custom bundler is required for the packages.

## Implementation Notes

- All `@ansible/core` service files follow the same pattern for optional VS Code access:

    ```typescript
    let vscode: typeof import('vscode') | undefined;
    try {
        vscode = require('vscode');
    } catch {}
    ```

- Services use the singleton pattern (`getInstance()`) to ensure a single instance is shared across all consumers within the same process.
- The `SimpleEventEmitter` utility provides a VS Code `EventEmitter`-compatible API for standalone mode, so services can fire events without checking which environment they're in at every call site.

## Related Decisions

- [ADR-002](ADR-002-centralized-plugin-doc-cache.md): Centralized plugin doc cache — builds on the `@ansible/core` service layer

---

## Revision History

| Date       | Author      | Change                                                                  |
| ---------- | ----------- | ----------------------------------------------------------------------- |
| 2026-05-26 | AI-assisted | Initial proposal (Implemented status — documents existing architecture) |
