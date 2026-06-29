# ADR-021: npm Scripts Over External Task Runners

## Status

Accepted

## Date

2026-06-29

## Context

As the project grows, contributors have noted that npm scripts have
poor UX compared to dedicated task runners:

- **No built-in docs** — `package.json` doesn't support comments,
  so script purpose must be documented externally
- **No discoverability** — `npm run` lists scripts but without
  descriptions, making it hard to find the right command
- **No dependency graph** — scripts chain with `&&`, which is
  sequential and fragile. There's no way to express "run B only
  after A succeeds" or "run A and B in parallel" declaratively
- **Painful chaining** — long `&&` chains are hard to read, offer
  no error recovery, and break across platforms (bash vs cmd)

Several external task runners address these issues:

- **Task** (taskfile.dev) — Go binary, YAML config, dependency
  graph, parallel execution, file-change detection
- **just** — Rust binary, Makefile-like syntax, cross-platform
- **Makefile** — ubiquitous but not cross-platform, arcane syntax
- **Turborepo / Nx** — monorepo-oriented, heavy, opinionated

The question: should we adopt an external task runner now, or stay
with npm scripts and mitigate the UX gaps?

## Decision

**We will continue using npm scripts as the sole build orchestrator,
with targeted UX improvements, and revisit when complexity exceeds
the mitigations.**

The mitigations are:

1. **`npm run help`** — a categorized, described script listing
   maintained in `scripts/help.mjs`
2. **`audit-npm-scripts` agent skill** — an AI skill that detects
   drift between scripts, `help.mjs`, and documentation (CLAUDE.md,
   README), then fixes it automatically
3. **prek for linting orchestration** — pre-commit hooks absorb
   linting complexity that would otherwise require multiple npm
   scripts

## Alternatives Considered

### Alternative 1: Task (taskfile.dev)

**Description**: Replace npm scripts with a `Taskfile.yml` that
defines tasks with dependencies, descriptions, and parallel execution.

**Pros**:

- Built-in `task --list` with descriptions
- Dependency graph between tasks
- Parallel execution with `deps:`
- File-change detection (`sources:` / `generates:`)
- Cross-platform (Go binary)

**Cons**:

- Adds a Go binary dependency — not installable via npm
- Every contributor must install it (`go install` or `brew`)
- CI workflows need an extra setup step
- Two config systems to maintain (Taskfile + package.json scripts
  that VS Code and npm lifecycle hooks still need)
- The project already added `prek` and `uv` as non-npm prerequisites;
  each additional tool adds friction

**Why not chosen**: The project has ~27 scripts — manageable without
a DAG. The `prek` integration already absorbed linting complexity.
Adding another binary dependency compounds the contributor onboarding
cost. The `npm run help` + audit skill mitigations close the
discoverability gap without adding infrastructure.

### Alternative 2: npm-run-all2 (run-s / run-p)

**Description**: Install `npm-run-all2` to replace `&&` chains with
`run-s` (sequential) and `run-p` (parallel) commands.

**Pros**:

- Pure npm dependency — no external binary
- Cleaner sequential chains: `run-s compile lint test`
- Enables safe parallel execution: `run-p lint:* test`
- Cross-platform (no shell dependency)

**Cons**:

- Adds a runtime dependency for build orchestration
- Marginal improvement over `&&` for the current script count
- Still no descriptions, dependency graph, or file detection

**Why not chosen**: The improvement is marginal for ~27 scripts.
If `&&` chains grow beyond 4-5 steps or parallel execution becomes
necessary, this is the lowest-friction next step.

### Alternative 3: Turborepo / Nx

**Description**: Adopt a monorepo build system with caching,
dependency-aware task scheduling, and remote caching.

**Pros**:

- Understands package dependency graph
- Intelligent caching (skip unchanged packages)
- Remote cache for CI speedup
- Built for monorepos

**Cons**:

- Significant setup and learning curve
- Opinionated about project structure
- Overkill for 6 packages with a simple build order
- Heavy dependency tree

**Why not chosen**: The monorepo has 6 packages with a
straightforward build order. Turborepo/Nx solve problems at a scale
we haven't reached. Revisit if the package count exceeds 10 or
cross-package build dependencies become complex.

## Consequences

### Positive

- Zero new dependencies or binary prerequisites
- Contributors use familiar `npm run` commands
- The `help` script and audit skill close the discoverability and
  drift gaps that motivated the discussion
- The decision is explicitly documented, preventing repeated debates

### Negative

- `&&` chains remain fragile for long pipelines
- No file-change detection (every `npm run ci` rebuilds everything)
- No parallel execution within a single script

### Neutral

- The decision has a clear re-evaluation trigger: if the script count
  exceeds ~40, if `&&` chains exceed 5 steps, or if build times
  exceed 5 minutes due to unnecessary rebuilds, revisit this ADR

## Implementation Notes

- `scripts/help.mjs` maintains a categorized description map that
  must stay in sync with `package.json`
- The `audit-npm-scripts` agent skill automates drift detection
  between `help.mjs`, `package.json`, `CLAUDE.md`, and `README.md`
- If `npm-run-all2` is adopted later, it replaces `&&` chains without
  changing the overall approach — this ADR remains valid

## Related Decisions

- ADR-007: npm exec over npx (established npm as the canonical tool)
- ADR-006: esbuild bundler (build system choice)

## References

- [Task (taskfile.dev)](https://taskfile.dev)
- [npm-run-all2](https://github.com/bcomnes/npm-run-all2)
- [Turborepo](https://turbo.build/repo)
- [just](https://github.com/casey/just)

---

## Revision History

| Date       | Author          | Change           |
| ---------- | --------------- | ---------------- |
| 2026-06-29 | Bradley Thornton | Initial proposal |
