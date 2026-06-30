# ADR-006: esbuild Bundler for Extension and Packages

## Status

Accepted

## Date

2026-06-10

## Context

The `next` branch compiles all TypeScript via `tsc -b` (composite project
references) and ships the raw `out/` tree alongside `node_modules/` inside
the `.vsix` package. This approach has several limitations:

### No path alias support at runtime

TypeScript's `paths` compiler option (e.g., `@src/* → ./src/*`) resolves
aliases during type checking but does **not** rewrite import paths in the
emitted JavaScript. As a result:

```typescript
// src/views/CollectionsProvider.ts
import { CollectionsService } from '@src/services/CollectionsService';
// Compiles to:
const { CollectionsService } = require('@src/services/CollectionsService');
// Node.js cannot resolve "@src/services/CollectionsService" → runtime crash
```

Without a bundler, path aliases are unusable, which prevents enforcing
`no-restricted-imports` against relative imports — a quality bar the `main`
branch already enforces.

### Large extension package

The `.vsix` ships hundreds of individual `.js` files in `out/` plus the
full `node_modules/` tree. This increases download size, install time,
and extension activation latency compared to a single bundled file.

### No tree shaking

Dead code from dependencies (e.g., unused exports from `js-yaml`,
`lodash`, MCP SDK) is included in the package. A bundler can eliminate
unreachable code paths.

### Industry standard

The VS Code team recommends bundling extensions with esbuild or webpack.
The `yo code` generator has used esbuild by default since 2023. Major
extensions (Pylance, ESLint, GitLens, Prettier) all ship bundled output.

### Forces

- The extension's `main` entry point must be a single CommonJS file for
  VS Code to load.
- `vscode` must be marked as `external` — it is provided by the runtime.
- The three sub-packages (`@ansible/core`, `@ansible/language-server`,
  `@ansible/mcp-server`) use TypeScript project references and must
  continue to compile independently for type checking.
- The language server runs as a standalone Node process; its entry point
  must also be bundled.
- The MCP server runs standalone via `ansible-environments-mcp`; its
  entry point must also be bundled.
- Vitest must continue to work for unit tests without bundling.
- Source maps should be preserved for debugging.

## Decision

**We will adopt esbuild as the build-time bundler for the extension, language
server, and MCP server entry points, while retaining `tsc -b` for type
checking.**

### Build pipeline

```text
tsc -b            → type-check all packages (errors, declarations)
esbuild (ext)     → bundle src/extension.ts → dist/extension.js
esbuild (ls)      → bundle packages/language-server/src/cli.ts → dist/language-server.js
esbuild (mcp)     → bundle packages/mcp-server/src/server.ts → dist/mcp-server.js
```

### Configuration

Each bundle target uses:

- `--bundle --format=cjs --platform=node --target=es2022`
- `--external:vscode` (extension only)
- `--alias:@src=./src` (root extension), per-package aliases for packages
- `--sourcemap` for debuggability

### Path aliases

With esbuild resolving aliases at bundle time, `tsconfig.json` `paths`
become safe to use:

| Alias    | Resolves to | Scope          |
| -------- | ----------- | -------------- |
| `@src/*` | `./src/*`   | Root extension |

A `@test/*` alias for test files may be added in a follow-up if needed.
Packages use their own `tsconfig.json` `paths` scoped to their directory.

### Package.json changes

```jsonc
{
    "main": "./dist/extension.js", // was: "./out/extension.js"
    "scripts": {
        "compile": "tsc -b",
        "build": "node scripts/build.mjs",
        "vscode:prepublish": "pnpm run compile && pnpm run build",
        "watch": "tsc -b -w",
    },
}
```

## Alternatives Considered

### Alternative 1: tsc-alias post-compilation rewriter

**Description**: Run `tsc-alias` after `tsc -b` to rewrite alias paths
in the emitted `.js` files to relative paths. No bundling.

**Pros**:

- Minimal change to the build pipeline
- No new bundler concept to understand
- Keeps the `out/` directory structure unchanged

**Cons**:

- Adds an extra build step per package
- Still ships `node_modules/` (no tree shaking)
- Still ships hundreds of individual `.js` files (no activation speedup)
- `tsc-alias` is a smaller community project with less long-term support
  than esbuild

**Why not chosen**: Solves only the alias problem without addressing
package size, activation performance, or tree shaking. Misses the larger
opportunity.

### Alternative 2: webpack

**Description**: Use webpack as the bundler instead of esbuild.

**Pros**:

- Mature ecosystem with many plugins
- First-party VS Code extension documentation
- Extensive configuration flexibility

**Cons**:

- Significantly slower build times than esbuild
- Complex configuration (`webpack.config.js` files per target)
- The `main` branch already chose esbuild; matching reduces divergence

**Why not chosen**: esbuild is 10–100x faster and the configuration is
simpler. The `main` branch already validates the esbuild approach.

### Alternative 3: Node.js subpath imports (`#src/*`)

**Description**: Use Node.js native `imports` field in `package.json` to
map `#src/*` to `./src/*`. Node resolves these without a bundler.

**Pros**:

- Zero external tooling — built into Node.js
- Works at runtime without compilation

**Cons**:

- Uses `#` prefix (unconventional in TypeScript projects)
- Requires Node.js 16+ (met, but adds a constraint)
- Still ships `node_modules/` and individual `.js` files
- TypeScript support for `imports` mapping requires `moduleResolution:
"bundler"` or `"node16"`, which conflicts with `"commonjs"` module
  setting

**Why not chosen**: Requires changing the module resolution strategy
across all packages, introduces an unusual import syntax, and doesn't
provide bundling benefits.

## Consequences

### Positive

- **Path aliases work at runtime**: `@src/*` imports are resolved during
  bundling. This enables enforcing `no-restricted-imports` against relative
  imports via ESLint.
- **Smaller `.vsix`**: Bundling eliminates `node_modules/` from the
  package. Extension size drops significantly (typically 10x+ reduction).
- **Faster activation**: VS Code loads one file instead of traversing
  hundreds of `require()` calls at startup.
- **Tree shaking**: Unused exports from dependencies are eliminated.
- **Alignment with `main`**: Reduces structural divergence between
  branches.

### Negative

- **Build complexity**: The build pipeline gains an esbuild step. Contributors
  must understand both `tsc -b` (type checking) and esbuild (bundling).
- **Debugging indirection**: Bundled output is a single file. Source maps
  must work correctly for breakpoint debugging in VS Code.
- **Native module handling**: If any future dependency uses native Node
  addons (`.node` files), those must be marked `external` in esbuild.
- **Watch mode coordination**: Development watch mode must coordinate
  `tsc -b -w` (type errors) with esbuild rebuild (testable output).

### Neutral

- `tsc -b` remains the type checker and declaration emitter. esbuild
  does not type-check; it only bundles.
- Vitest continues to run against TypeScript source directly (via its
  own transform), not against bundled output.
- The `out/` directory remains for `tsc -b` output (declarations, type
  checking). The `dist/` directory contains bundled output.

## Implementation Notes

- Create `scripts/build.mjs` with esbuild configuration for all three
  targets (extension, language server, MCP server).
- Update `package.json` `main` from `./out/extension.js` to
  `./dist/extension.js`.
- Update `package.json` `bin.ansible-environments-mcp` from
  `./packages/mcp-server/out/server.js` to `./dist/mcp-server.js`.
- Add `dist/` to `.gitignore` and `.vscodeignore`.
- Update `.vscodeignore` to exclude `out/`, `src/`, `packages/*/src/`,
  and `node_modules/` — the `.vsix` should only contain `dist/`.
- Add `@src/*` path alias to root `tsconfig.json`.
- The esbuild migration (this ADR) ships in PR 1. The relative import
  conversion and `no-restricted-imports` enforcement ships in PR 2.
  Additional aliases (e.g., `@test/*`) and `vitest.config.ts` updates
  can be added in follow-ups as needed.

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md): Service-based
  architecture — the package structure that esbuild must bundle correctly.
- [ADR-005](ADR-005-architectural-invariants.md): Architectural
  invariants — `@ansible/core` has zero hard `vscode` dependencies,
  which simplifies bundling (only the extension bundle needs
  `--external:vscode`).

## References

- [VS Code — Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [esbuild — Getting Started](https://esbuild.github.io/getting-started/)
- [TypeScript — paths](https://www.typescriptlang.org/tsconfig#paths)

---

## Revision History

| Date       | Author                         | Change           |
| ---------- | ------------------------------ | ---------------- |
| 2026-06-10 | Bradley Thornton (AI-assisted) | Initial proposal |
