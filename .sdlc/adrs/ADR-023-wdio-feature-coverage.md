# ADR-023: WDIO Feature Coverage Model

## Status

Proposed

## Date

2026-06-30

## Context

The extension ships with two categories of automated tests:

- **Unit tests** (Vitest) — exercise individual functions and classes
  with assertions against expected behavior. Coverage is measured in
  lines/branches/functions via V8 instrumentation and reported to
  Codecov and SonarCloud.
- **E2E tests** (WebDriverIO) — launch a real VS Code instance and
  exercise user-facing workflows through the UI: opening files,
  triggering completions, verifying panels render, checking error
  resilience.

PR [#2954](https://github.com/ansible/vscode-ansible/pull/2954)
added V8 code coverage support to `wdio-vscode-service`
([PR #164](https://github.com/webdriverio-community/wdio-vscode-service/pull/164))
and wired it into CI to upload WDIO coverage to Codecov alongside
unit test coverage. The intent was to measure what code paths WDIO
tests exercise.

### The 100% problem

The extension is bundled by esbuild into `dist/extension.js` — a
single 47K-line CJS file with a source map pointing back to 324
original source files. When V8 coverage is collected from the
extension host process, it reports coverage against the bundle.
Because CJS module initialization executes all top-level code when
the bundle is loaded, V8 marks the entire bundle as covered. When
`c8` source-maps this back to original files, every file reports
100% coverage across all metrics (statements, branches, functions,
lines).

This inflated the Codecov aggregate from an honest **44.62%**
(unit tests alone, with `all: true`) to a misleading **87.67%**
(unit + WDIO merged). The WDIO data wasn't just unhelpful — it
actively masked the real unit coverage gap.

### Line coverage is the wrong metric for E2E tests

Even if the V8 coverage were accurate, line coverage answers the
wrong question for E2E tests:

| Test type | Right question | Wrong question |
|-----------|----------------|----------------|
| Unit | Which code paths have behavioral assertions? | — |
| E2E | Which user workflows have end-to-end validation? | Which lines were incidentally executed? |

A WDIO test for "trigger autocomplete in a playbook" exercises the
completion provider, the language server connection, YAML parsing,
collection service, and plugin doc cache — but it is not testing any
of those subsystems. It is testing whether the user sees completions.
The fact that loading the extension bundle "touches" 324 source files
says nothing about whether those files are tested. It says they were
loaded.

The extension exposes approximately 72 commands, 10 tree views, 13+
webview panels, and multiple editor features (hover, completion,
diagnostics, semantic tokens, vault). Today's 18 WDIO scenarios cover
roughly 5–15% of that surface. The real gap is in untested workflows,
not in uncovered lines.

### Forces in tension

- **Honesty**: Aggregate coverage metrics must reflect actual test
  quality, not incidental code loading.
- **Completeness**: We need a way to know which user-facing
  capabilities lack any automated E2E validation.
- **Effort**: Building a custom feature-coverage system costs
  engineering time; the value depends on it being maintainable.
- **Existing assets**: The `ux-walkthrough` skill already maintains a
  curated workflow catalog with 12 modules and ~50 steps in
  `walkthrough-modules.json`.

## Decision

**We will retire V8 line coverage for WDIO tests and adopt a
workflow-level feature coverage model that measures the percentage
of user-facing workflows with E2E validation.**

### 1. Retire V8 line coverage upload

Remove the WDIO coverage upload to Codecov from CI. Remove the
`wdio` flag from `codecov.yml`. Remove the `WDIO_COVERAGE`
environment variable from CI and the `coverage` blocks from
`wdio.conf.ts` / `wdio.conf.wsl.ts` — the upstream
`wdio-vscode-service@8` package does not support this option.
V8 line-coverage data from bundled E2E tests must not be merged
into aggregate coverage metrics.

### 2. Three-tier coverage model

| Tier | Source | What it proves |
|------|--------|----------------|
| **E2E** | WDIO spec exercises the full workflow | User can complete the journey |
| **Smoke** | Integration test verifies registration | Command exists and doesn't crash |
| **Uncovered** | No automated validation | Unknown user experience |

A workflow is considered E2E-covered when at least one WDIO scenario
exercises the primary user journey for that capability. Smoke
coverage (from integration tests like `activation.test.ts`) confirms
structural correctness but not behavioral quality.

### 3. Workflow-grain feature catalog

The canonical catalog of user-facing workflows lives in
`.agents/skills/ux-walkthrough/walkthrough-modules.json`. Each
module represents a user journey — not an individual command:

| Module ID | Workflow | Example commands involved |
|-----------|----------|--------------------------|
| `setup` | Setup & first impressions | Activity bar, output channel |
| `environment` | Environment & tool management | `create`, `select`, `install` |
| `editor-lsp` | Editor & language server | Completion, hover, diagnostics, vault |
| `collections-installed` | Installed collections & plugin docs | `search`, `showPluginDoc` |
| `collections-remote` | Collection sources & installation | `filterGalaxy`, `install` |
| `creator` | Content scaffolding | `openForm`, scaffold submit |
| `playbooks` | Playbook execution & visualization | `run`, `runWithProgress`, `editConfig` |
| `execution-envs` | Execution environment inspection | `showDetail`, `showPackageDetail` |
| `ai-authoring` | AI-assisted content authoring | AI summary commands |
| `mcp-skills` | MCP tools & AI skills | `useInChat`, `showMcpStatus` |
| `lightspeed` | Ansible Lightspeed | Generation, explanation, inline suggest |
| `cross-cutting` | Cross-cutting UX | Non-AI path, empty states, settings |

This is approximately 12 modules with ~50 testable steps. The
catalog already exists — this ADR promotes it from a dogfooding
guide to the source of truth for E2E coverage measurement.

### 4. Traceability via test tags

WDIO spec files declare which workflows they cover. The mechanism
is a `@covers` annotation or equivalent metadata that maps each
`describe`/`it` block to one or more module IDs from the catalog.

A CI script (future implementation) loads the catalog, scans WDIO
specs for coverage tags, and reports:

```text
Feature coverage: 4/12 modules (33%)
  E2E:       setup, editor-lsp, lightspeed, cross-cutting
  Smoke:     environment, collections-installed
  Uncovered: collections-remote, creator, playbooks, execution-envs,
             ai-authoring, mcp-skills
```

### 5. Registration parity as a separate concern

Verifying that every `contributes.commands` entry has a matching
`registerCommand()` call (and vice versa) is a structural
correctness check, not a feature coverage metric. This is handled
by integration tests and optionally by a future lint rule. It
answers "does the command exist?" not "does the workflow work?"

## Alternatives Considered

### Alternative 1: Fix V8 coverage accuracy on bundled code

**Description**: Improve the `wdio-vscode-service` coverage
implementation to produce accurate line-level data from esbuild
bundles — potentially using `v8.coverage.startPreciseCoverage()`,
switching to Istanbul instrumentation, or using monocart-coverage-
reports for better source-map handling.

**Pros**:

- Keeps a single unified coverage metric (unit + E2E)
- Uses existing Codecov/SonarCloud infrastructure

**Cons**:

- V8 coverage on bundled code is fundamentally imprecise —
  improving accuracy requires unbundled test builds or build-time
  instrumentation, both of which add complexity
- Even if accurate, line coverage from E2E tests conflates "code
  was executed" with "behavior was tested"
- High effort with diminishing returns

**Why not chosen**: Solving the accuracy problem doesn't solve the
conceptual problem. Line coverage is the wrong metric for E2E tests
regardless of its accuracy.

### Alternative 2: Command-level coverage tracking

**Description**: Track coverage at the individual command level
(~72+ items from `contributes.commands`), requiring each command to
have at least one E2E test that invokes it.

**Pros**:

- Precise and mechanically verifiable
- Maps directly to `package.json` manifest

**Cons**:

- A command is not a user workflow — `ansiblePlaybooks.editConfig`
  and `ansiblePlaybooks.runWithProgress` are separate commands but
  part of one user journey ("run a playbook")
- Encourages shallow tests (invoke command, assert no crash) rather
  than meaningful workflow validation
- Many commands are thin wrappers or internal-only (tree item
  click handlers, refresh commands)

**Why not chosen**: The user doesn't think in commands — they think
in workflows. Testing "can I run a playbook and see progress?" is
more valuable than testing 5 individual commands in isolation.

### Alternative 3: Cucumber/Gherkin BDD rewrite

**Description**: Rewrite WDIO specs as Gherkin `.feature` files
where feature files themselves serve as the catalog. Use
`@wdio/cucumber-framework` and tag scenarios with feature
identifiers.

**Pros**:

- Feature files are self-documenting and serve as the catalog
- Cucumber has mature tooling for gap analysis
- Tags provide built-in traceability

**Cons**:

- Requires rewriting all existing Mocha specs
- Gherkin step definitions add boilerplate for no functional gain
  when the test audience is developers, not product managers
- Introduces a framework migration in the E2E test layer

**Why not chosen**: The catalog already exists in
`walkthrough-modules.json`. A Mocha tag helper achieves the same
traceability with less migration effort.

## Consequences

### Positive

- Codecov reports honest aggregate coverage based solely on unit
  tests — no inflation from incidental code loading
- Feature coverage becomes a visible, actionable metric — the team
  can prioritize which workflows to add WDIO tests for
- The `ux-walkthrough` catalog gains a dual purpose: dogfooding
  guide and E2E coverage manifest
- The three-tier model makes coverage gaps explicit rather than
  hidden behind a misleading line percentage

### Negative

- Codecov aggregate coverage will drop to the real unit-test number
  (~44%). This may look like a regression to anyone reading the
  badge without context.
- The feature coverage metric requires a custom CI script — there
  is no off-the-shelf WDIO plugin for this
- Maintaining the catalog requires discipline: new features must
  add a walkthrough module or step, or they will appear as
  "uncovered" even if WDIO tests exist

### Neutral

- The `WDIO_COVERAGE` local debugging capability is preserved — a
  developer can still run `WDIO_COVERAGE=1` to see which extension
  code paths a test hits, for investigative purposes
- The `wdio-vscode-service` fork's coverage feature
  ([PR #164](https://github.com/webdriverio-community/wdio-vscode-service/pull/164))
  remains useful for projects that don't bundle their extensions,
  where V8 coverage on source files would be accurate

## Implementation Notes

### Phase 1: Retire V8 upload (immediate)

1. Remove the "Upload WDIO coverage to Codecov" step from the
   `unit` job in `.github/workflows/ci.yml`
2. Remove the `wdio` flag from `codecov.yml` flag_management
3. Update `codecov.yml` `after_n_builds` from 5 to 4 (three
   unit-node runs + one wsl-fedora)
4. Comment on wdio-vscode-service
   [PR #164](https://github.com/webdriverio-community/wdio-vscode-service/pull/164)
   explaining that V8 coverage on bundled code produces unreliable
   results and linking to this ADR

### Phase 2: Feature coverage infrastructure (future)

1. Add a stable `coverage` field to each module in
   `walkthrough-modules.json` with possible values: `e2e`, `smoke`,
   `none`
2. Add `@covers('module-id')` metadata to WDIO spec `describe`
   blocks
3. Create `scripts/feature-coverage.mjs` that:
   - Loads `walkthrough-modules.json`
   - Scans `test/ui/**/*.spec.ts` for `@covers` tags
   - Cross-references integration tests for smoke tier
   - Emits a markdown summary and exits non-zero if coverage drops
     below a configured threshold
4. Add a CI step that runs the feature coverage script and posts
   the summary as a PR comment

### Catalog maintenance rule

When adding a new user-facing feature (command, view, panel, editor
capability), add a corresponding module or step to
`walkthrough-modules.json`. This is analogous to ADR-012's
requirement that every UI capability has an MCP tool equivalent —
every UI capability must also have a catalog entry.

## Related Decisions

- [ADR-006](ADR-006-esbuild-bundler.md): esbuild bundling creates
  the single-file bundles that make V8 coverage unreliable
- [ADR-012](ADR-012-mcp-tool-parity.md): MCP tool parity for
  extension capabilities — this ADR applies the same "catalog
  completeness" principle to E2E test coverage
- [ADR-014](ADR-014-internal-skills-as-prompt-source.md): Internal
  skills as AI prompt source of truth — the `ux-walkthrough` skill
  was built under this framework and is now promoted to E2E
  coverage manifest

## References

- [wdio-vscode-service V8 coverage PR](https://github.com/webdriverio-community/wdio-vscode-service/pull/164)
- [V8 code coverage documentation](https://v8.dev/blog/javascript-code-coverage)
- [c8 — V8-to-Istanbul](https://github.com/bcoe/c8)
- [Codecov flag management](https://docs.codecov.com/docs/flags)
- [ux-walkthrough skill catalog](.agents/skills/ux-walkthrough/walkthrough-modules.json)

---

## Revision History

| Date       | Author          | Change           |
| ---------- | --------------- | ---------------- |
| 2026-06-30 | Bradley Thornton | Initial proposal |
