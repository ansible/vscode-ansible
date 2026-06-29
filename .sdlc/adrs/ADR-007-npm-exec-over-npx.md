# ADR-007: Use `npm exec` Instead of `npx`

## Status

Implemented

## Date

2026-06-10

## Context

The project's CI workflows, documentation, and agent skill files use `npx`
to run locally installed CLI tools (`tsc`, `eslint`, `vitest`, `vsce`,
`wdio`). While `npx` works, it has behaviors that conflict with the
project's security and reproducibility requirements:

### Silent remote package execution

`npx` was designed for ad-hoc execution. When a package is not installed
locally, `npx` downloads and runs it from the npm registry — potentially
without prompting (behavior varies across npm versions). This creates a
supply-chain attack vector: a typo like `npx eslitn` could execute a <!-- cspell:disable-line -->
malicious package.

### Inconsistent prompting across npm versions

The `--yes`/`--no` flags and interactive prompts around remote packages
have changed behavior across npm 7, 8, 9, and 10. CI environments that
pin different Node/npm versions may behave differently.

### Ambiguous intent

`npx <tool>` does not make it clear whether the intent is to run a local
devDependency or to fetch something from the registry. `npm exec` makes
the intent explicit: run the tool from the project's `node_modules/.bin`.

## Decision

Replace all `npx` usage with `npm exec` across the project:

- CI workflows (`.github/workflows/*.yml`)
- Documentation (`AGENTS.md`, `README.md`)
- Agent skills (`.agents/skills/`)
- Source code comments

### Syntax mapping

| Before               | After                        |
| -------------------- | ---------------------------- |
| `npx tsc -b`         | `npm exec tsc -- -b`         |
| `npx eslint .`       | `npm exec eslint -- .`       |
| `npx eslint . --fix` | `npm exec eslint -- . --fix` |
| `npx vitest run`     | `npm exec vitest -- run`     |
| `npx vsce package`   | `npm exec vsce -- package`   |
| `npx wdio run ...`   | `npm exec wdio -- run ...`   |

The `--` separator is required when passing arguments to the tool (as
opposed to `npm exec` itself).

## Alternatives Considered

### Keep `npx` with `--no-install` flag

`npx --no-install tsc -b` would prevent remote fetching. However, the
flag name changed to `--no` in newer npm versions, the syntax is verbose,
and it still signals the wrong intent.

### Use `node_modules/.bin/` paths directly

`./node_modules/.bin/tsc -b` is explicit and safe, but verbose and
fragile (breaks on Windows without cross-platform scripting).

### Use npm scripts for everything

Define every tool invocation as an npm script (`npm run lint`, `npm run
typecheck`). This works for CI but is too rigid for documentation and
ad-hoc developer workflows where arguments vary.

## Consequences

### Positive

- **Eliminates remote execution risk**: `npm exec` will not silently
  download and run packages from the registry.
- **Consistent behavior**: Works the same across npm 7+ regardless of
  version-specific prompt changes.
- **Clear intent**: Signals "run the locally installed tool" rather than
  "run something, maybe from the internet."
- **Aligns with npm team guidance**: The npm team recommends `npm exec`
  for project-local tooling.

### Negative

- **Slightly more verbose**: `npm exec tsc -- -b` vs `npx tsc -b`.
  The `--` separator is an extra token developers must remember.
- **Requires npm 7+**: Not a concern for this project (Node 20+ is the
  minimum), but could affect contributors with very old setups.

### Neutral

- No runtime or build behavior changes — both commands resolve to the
  same `node_modules/.bin/` binaries.
- Existing npm scripts (`npm run compile`, `npm run build`) are
  unaffected.

## Implementation Notes

- All changes are in documentation, CI YAML, and source comments.
- No functional code changes.
- Agent skill files are updated so AI agents use the correct command
  syntax when running quality gates.

## Related Decisions

- [ADR-005](ADR-005-architectural-invariants.md) — Architectural
  invariants (quality gates reference these commands)
- [ADR-006](ADR-006-esbuild-bundler.md) — esbuild bundler (build
  pipeline context)
