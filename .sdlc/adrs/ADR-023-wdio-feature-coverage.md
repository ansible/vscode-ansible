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
- **Existing assets**: The PRD defines 19 user stories across 8
  capability areas. The `ux-walkthrough` skill maintains a curated
  workflow catalog. Both describe user-facing functionality from
  different angles.

## Decision

**We will retire V8 line coverage for WDIO tests and adopt a
user-story-driven feature coverage model that measures the percentage
of user-facing stories with E2E validation.**

### 1. Retire V8 line coverage upload

Remove the WDIO coverage upload to Codecov from CI. Remove the
`wdio` flag from `codecov.yml`. Revert `wdio-vscode-service` from
the fork to upstream v8 (which removes the coverage feature). This
data must not be merged into aggregate coverage metrics.

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

### 3. User-story-grain feature catalog

The canonical catalog of user-facing capabilities lives in
`.sdlc/user-stories.yaml`. Each entry is a user story written
from the user's perspective — not a command or view, but an
outcome the user can achieve:

| Prefix | Area | Example story |
|--------|------|---------------|
| `ENV-` | Environment management | "I want to create a virtual environment from the sidebar" |
| `LSP-` | Editor & language server | "I want auto-completion for module options" |
| `COL-` | Collections | "I want to install a collection from Galaxy with one click" |
| `SCF-` | Content scaffolding | "I want to see the exact CLI command before scaffolding" |
| `PLB-` | Playbook execution | "I want an AI explanation of why a task failed" |
| `EE-`  | Execution environments | "I want to drill into an EE to see its contents" |
| `AI-`  | AI authoring & MCP | "I want to describe what I need and get a generated role" |
| `LS-`  | Lightspeed | "I want to generate a playbook via Lightspeed" |
| `XC-`  | Cross-cutting UX | "I want helpful guidance when tools are missing" |

Each story includes acceptance criteria that map directly to
WDIO `it()` blocks, PRD traceability (`prd_refs`), and an
`requires_ai` flag. The initial catalog contains ~54 stories
derived from the PRD capability tables, the `ux-walkthrough`
catalog, and existing WDIO tests.

The `ux-walkthrough` catalog remains useful for dogfooding
sessions but is no longer the coverage source of truth.

### 4. Traceability via test tags

WDIO spec files declare which stories they cover via `@covers`
JSDoc annotations on `describe` blocks:

```typescript
/**
 * @covers LSP-001
 * @covers LSP-002
 */
describe('Ansible Language Server e2e', () => { ... });
```

The CI script `scripts/story-coverage.mjs` loads the story
catalog, scans WDIO specs for `@covers` tags, cross-references
them, and reports:

```text
Coverage: 13/54 stories (24%)
  Covered:   ENV-002, ENV-005, COL-007, LSP-001, LSP-002, LSP-003,
             LSP-004, LS-001, LS-002, LS-003, LS-004, LS-006, XC-001
  Uncovered: ENV-001, ENV-003, ..., PLB-005 (AI failure analysis), ...
```

The script exits non-zero if coverage drops below a configurable
threshold (initially 20%, ratcheted up as tests are added).

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

**Why not chosen**: The user-story catalog in
`.sdlc/user-stories.yaml` combined with `@covers` JSDoc tags on
Mocha `describe` blocks achieves the same traceability with less
migration effort.

## Consequences

### Positive

- Codecov reports honest aggregate coverage based solely on unit
  tests — no inflation from incidental code loading
- Feature coverage becomes a visible, actionable metric — the team
  can prioritize which user stories to add WDIO tests for
- User stories are the natural language developers use for planning
  work; adding a story is lower friction than updating a walkthrough
- The `define-user-story` skill and submit-pr integration ensure
  new functionality is tracked automatically
- The coverage model makes gaps explicit rather than hidden behind
  a misleading line percentage

### Negative

- Codecov aggregate coverage will drop to the real unit-test number
  (~44%). This may look like a regression to anyone reading the
  badge without context.
- The feature coverage metric requires a custom CI script — there
  is no off-the-shelf WDIO plugin for this
- Maintaining the story catalog requires discipline: new features
  must add a user story, or they will appear as "uncovered" even
  if WDIO tests exist. The submit-pr skill mitigates this by
  detecting new user-facing functionality and prompting for a story

### Neutral

- The `wdio-vscode-service` dependency reverted to upstream v8;
  the fork's coverage feature
  ([PR #164](https://github.com/webdriverio-community/wdio-vscode-service/pull/164))
  was closed as the V8 coverage approach is fundamentally unsuitable
  for bundled extensions

## Implementation Notes

### Phase 1: Retire V8 upload (done)

1. Removed WDIO coverage upload steps from `.github/workflows/ci.yml`
2. Removed the `wdio` flag from `codecov.yml` flag_management
3. Removed `coverage/wdio/lcov.info` from `sonar-project.properties`
4. Reverted `wdio-vscode-service` from the fork to upstream v8
5. Removed `coverage` config from `wdio.conf.ts` and `wdio.conf.wsl.ts`
6. Closed wdio-vscode-service
   [PR #164](https://github.com/webdriverio-community/wdio-vscode-service/pull/164)
   with an explanation of why V8 coverage on bundled code is unsuitable

### Phase 2: User-story coverage infrastructure (done)

1. Derived ~54 user stories from the PRD capability tables, the
   `ux-walkthrough` catalog, and existing WDIO tests. Stories live
   in `.sdlc/user-stories.yaml`
2. Added `@covers` JSDoc tags to all 4 existing WDIO spec files,
   mapping each `describe` block to the stories it validates
3. Created `scripts/story-coverage.mjs` that:
   - Loads `.sdlc/user-stories.yaml`
   - Scans `test/ui/**/*.spec.ts` and `packages/*/test/wdio/**/*.spec.ts`
     for `@covers` tags
   - Cross-references to compute coverage per story
   - Emits a markdown summary table
   - Exits non-zero if coverage drops below a configurable threshold
4. Added a CI step in the `ui` job that runs the story coverage
   script after WDIO tests complete

### Phase 3: Developer workflow integration (done)

1. Created the `define-user-story` agent skill
   (`.agents/skills/define-user-story/SKILL.md`) that walks
   developers through defining a user story and optionally
   scaffolding a WDIO test skeleton
2. Added question 10 to the `submit-pr` skill's self-review
   checklist: detects new user-facing functionality in the PR diff
   and prompts the developer to define a story if none exists

### Story maintenance rule

When adding a new user-facing feature (command, view, panel, editor
capability), add a corresponding user story to
`.sdlc/user-stories.yaml`. This is analogous to ADR-012's
requirement that every UI capability has an MCP tool equivalent —
every UI capability must also have a user story.

The `submit-pr` skill's self-review (question 10) detects new
user-facing functionality in the diff and prompts the developer to
define a story via the `define-user-story` skill. The CI story
coverage script flags any `@covers` tags that reference unknown
story IDs.

## Related Decisions

- [ADR-006](ADR-006-esbuild-bundler.md): esbuild bundling creates
  the single-file bundles that make V8 coverage unreliable
- [ADR-012](ADR-012-mcp-tool-parity.md): MCP tool parity for
  extension capabilities — this ADR applies the same "catalog
  completeness" principle to E2E test coverage
- [ADR-014](ADR-014-internal-skills-as-prompt-source.md): Internal
  skills as AI prompt source of truth — the `define-user-story`
  skill follows this framework

## References

- [wdio-vscode-service V8 coverage PR](https://github.com/webdriverio-community/wdio-vscode-service/pull/164)
- [V8 code coverage documentation](https://v8.dev/blog/javascript-code-coverage)
- [c8 — V8-to-Istanbul](https://github.com/bcoe/c8)
- [Codecov flag management](https://docs.codecov.com/docs/flags)
- [User story catalog](../user-stories.yaml)
- [Story coverage script](../../scripts/story-coverage.mjs)
- [define-user-story skill](../../.agents/skills/define-user-story/SKILL.md)

---

## Revision History

| Date       | Author          | Change           |
| ---------- | --------------- | ---------------- |
| 2026-06-30 | Bradley Thornton | Initial proposal |
| 2026-06-30 | Bradley Thornton | Replace walkthrough-based model with user-story-based model |
