# ADR-008: Strict ESLint Configuration with Type-Checked Presets

## Status

Implemented

## Date

2026-06-10

## Context

The `next` branch inherited a minimal `.eslintrc.json` (legacy format) from
`main` that only covered a subset of files and relied on basic recommended
rules. Meanwhile, the `main` branch had migrated to ESLint flat config
(`eslint.config.mjs`) with stricter settings. The `next` branch needed
parity or better.

### Problems with the legacy configuration

- **Legacy format**: `.eslintrc.json` is deprecated in ESLint 9+ and
  removed in ESLint 10. The flat config (`eslint.config.mjs`) is the only
  supported format going forward.
- **Weak type safety**: The old config used `tseslint.configs.recommended`,
  which catches basic errors but misses entire categories of bugs:
  floating promises, unsafe `any` propagation, unbound methods, and
  unnecessary `await` on non-thenable values.
- **No Prettier integration**: Formatting was not enforced by the linter,
  leading to inconsistent style across contributors.
- **No import restrictions**: Developers could freely use relative imports
  (`../../../services/Foo`) and import banned packages (e.g., `chai` in
  production code) without lint errors.

### What `main` had

The `main` branch had already adopted flat config with
`eslint-plugin-prettier`, `eslint-plugin-import`, and a custom local
plugin for Node.js deprecation warnings. It used
`tseslint.configs.recommendedTypeChecked` — a step above `recommended`
but still not the strictest available preset.

## Decision

Adopt the strictest available `typescript-eslint` presets for the `next`
branch, exceeding `main`'s coverage:

### Presets

- **`tseslint.configs.strictTypeChecked`**: Enables all recommended
  type-checked rules plus stricter variants. This catches:
  - Floating promises (`no-floating-promises`)
  - Unsafe `any` propagation (`no-unsafe-argument`, `no-unsafe-return`,
      `no-unsafe-member-access`)
  - Unnecessary type assertions (`no-unnecessary-type-assertion`)
  - Non-null assertions (`no-non-null-assertion`)
  - Unbound methods (`unbound-method`)
  - Awaiting non-thenables (`await-thenable`)
  - Functions marked `async` that don't `await` (`require-await`)
- **`tseslint.configs.stylisticTypeChecked`**: Enforces consistent type
  syntax (e.g., `Record<K, V>` over `{ [key: K]: V }`, `interface` over
  `type` for object shapes).

### Additional rules

| Rule                                    | Rationale                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@typescript-eslint/no-require-imports` | Enforce ESM; `require()` is only allowed in the conditional `try { require('vscode') } catch {}` pattern via inline disable comments. |
| `@typescript-eslint/require-await`      | Prevent `async` functions that never `await`, which hide performance issues and mislead callers.                                      |
| `no-restricted-imports` (src/)          | Ban relative imports in `src/` — enforce `@src/` path aliases (see ADR-006). Ban `chai` — use `vitest` or `node:assert`.              |
| `local/node-DEP0190`                    | Custom plugin catching Node.js DEP0190 deprecation patterns.                                                                          |
| `eqeqeq: smart`                         | Require `===`/`!==` except for `null` checks.                                                                                         |

### Integrations

- **Prettier** (`eslint-plugin-prettier/recommended`): Formatting errors
  are lint errors — no separate formatter step needed.
- **Import plugin** (`eslint-plugin-import`): Detects unresolvable imports
  and enforces import hygiene. The `import/no-unresolved` rule is disabled
  for TypeScript files since `tsc` already handles module resolution.

### Test file relaxations

Test files (`**/test/**`) relax a subset of strict rules where test
ergonomics outweigh strictness:

- `unbound-method`: off (common in mock/spy patterns)
- `no-base-to-string`: off (test assertions often stringify values)
- `no-unsafe-return`: off (test helpers may return `any` from mocks)
- `no-unsafe-member-access`: off (accessing mock/stub properties)

## Alternatives Considered

### Match `main` exactly (`recommendedTypeChecked`)

Would provide parity but miss the stricter rules that catch real bugs.
Since `next` is a fresh start, there's no legacy code to grandfather in —
better to start strict.

### `recommended` (non-type-checked)

Faster lint runs (no type information needed) but misses the most
valuable rules: floating promises, unsafe `any`, and `require-await`.
These are the rules that catch production bugs.

### Per-rule cherry-picking without presets

Maximum control but high maintenance burden. The `strictTypeChecked`
preset is maintained by the `typescript-eslint` team and automatically
picks up new rules in minor versions. Cherry-picking means manually
tracking upstream changes.

## Consequences

### Positive

- **Catches real bugs at lint time**: Floating promises, `any` leaks, and
  unbound methods are common sources of production bugs in TypeScript
  projects. These are now caught before code review.
- **Consistent formatting**: Prettier integration means no style debates
  in reviews.
- **Import hygiene**: Path alias enforcement and banned imports keep the
  codebase modular and prevent accidental dependencies.
- **Exceeds `main`**: Contributors working across both branches get
  stricter checking on `next`, catching issues that `main` would miss.

### Negative

- **Slower lint runs**: Type-checked rules require `tsc` to run during
  linting, adding several seconds. Mitigated by `projectService` which
  reuses the TypeScript project graph.
- **Inline disable comments**: The conditional `require('vscode')` pattern
  used by `@ansible/core` services requires `eslint-disable` comments for
  `no-require-imports` and `no-unsafe-assignment`. This is acceptable —
  the pattern is architectural (ADR-001) and the disable comments make the
  exception explicit.
- **Learning curve**: Contributors unfamiliar with strict TypeScript
  linting may encounter unfamiliar errors. The rules have clear
  documentation at <https://typescript-eslint.io/rules/>.

### Neutral

- The ESLint flat config format is now the only supported format in
  ESLint 10+, so this migration was inevitable regardless of strictness.
- `eslint-plugin-import` has a peer dependency mismatch with ESLint 10,
  requiring `legacy-peer-deps=true` in `.npmrc`. This is a known
  upstream issue and will resolve when the plugin releases a compatible
  version.

## Implementation Notes

- Configuration lives in `eslint.config.mjs` at the repository root.
- The `projectService.allowDefaultProject` array lists files outside
  `tsconfig.json` project references that need type information (config
  files, test configs).
- `import/no-unresolved` is globally disabled for TypeScript files
  because `tsc` already validates module resolution and the import
  plugin cannot resolve workspace package aliases.

## Related Decisions

- [ADR-001](ADR-001-service-based-architecture.md) — Service-based
  architecture (explains the `require('vscode')` pattern that needs
  inline disable comments)
- [ADR-006](ADR-006-esbuild-bundler.md) — esbuild bundler (enables
  `@src/` path aliases enforced by `no-restricted-imports`)
- [ADR-007](ADR-007-npm-exec-over-npx.md) — `npm exec` over `npx`
  (quality gate commands updated to match)
