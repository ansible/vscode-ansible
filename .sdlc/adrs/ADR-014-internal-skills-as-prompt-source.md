# ADR-014: Internal Skills as AI Prompt Source of Truth

## Status

Accepted

## Date

2026-06-18

## Context

The extension injects AI prompts at several touch points — sparkle
buttons on tree nodes, "Analyze with AI" actions in webviews, and MCP
tool example prompts. These prompts live as TypeScript template strings
in `packages/common/src/prompts/` (18 builder functions across 7
files). Each builder constructs a multi-paragraph markdown instruction
string that tells the AI which MCP tools to call, what format to use,
and how to present the result.

Separately, the `SkillRegistry` service (`packages/services/`) and MCP
skill tools (`skill_list`, `skill_search`, `skill_get`) expose a skill
discovery and loading system. Skills are markdown files (SKILL.md) with
YAML frontmatter, hosted on GitHub (default: `ansible-community/ai-forge`)
or in local directories. The Skills sidebar and MCP tools allow agents
to discover and follow these skill instructions.

### The tension

1. **Prompt builders duplicate skill-like knowledge.** A builder like
   `buildGalaxyPluginExplanationPrompt` is effectively an inline skill:
   it says "use this MCP tool with these args, produce this format."
   But it's buried in TypeScript string interpolation, invisible to
   agents outside the extension.

2. **Agents outside the extension can't discover prompt instructions.**
   An agent using the MCP server standalone (Claude Desktop, Cursor,
   any MCP client) has access to `skill_get` for community skills but
   cannot discover the extension's prompt patterns. It must guess which
   MCP tools to call and how to compose them.

3. **Prompt text is hard to author and review.** Multi-paragraph
   markdown inside template literals with escaped backticks is painful
   to maintain. Reviewers can't use markdown preview tooling.

4. **No single source of truth.** If the MCP tool schema changes
   (e.g., a parameter is renamed), the prompt text, the skill
   instructions, and the MCP tool handler must all be updated
   independently.

### Forces

- The extension UI path (sparkle click) needs prompts synchronously at
  build time — no async SkillRegistry lookup.
- The MCP agent path needs skills discoverable via `skill_list` /
  `skill_get` at runtime.
- `@ansible/common` must remain browser-safe (ADR-011) — no filesystem
  access or Node.js builtins.
- Prompt builders need dynamic parameters (plugin name, collection
  FQCN, org, repo) that vary per invocation.
- Skills should be readable as standalone markdown by human developers
  and AI agents browsing the source tree.

## Decision

**We will store AI prompt instructions as markdown files in
`packages/common/src/skills/` and consume them via two parallel paths
from one source.**

### Skill file convention

Each skill is a `.md` file with YAML frontmatter and a context-append
separator:

```markdown
---
name: Explain Ansible Plugin
description: Explain a plugin with practical examples and parameter guidance
tags: [collections, plugins, documentation]
---

# Explain Ansible Plugin

Brief description.

## Instructions

Step-by-step instructions including which MCP tools to use.

## Context

If plugin details are provided below the separator, use them directly.
Otherwise, ask the user which plugin they want to learn about.

---
```

### Path 1: Prompt builders (synchronous, direct import)

Prompt builders in `packages/common/src/prompts/` import the `.md` file
as a string via esbuild's `text` loader. A `*.md` module declaration in
`globals.d.ts` satisfies TypeScript. The builder strips YAML frontmatter,
appends dynamic context after the `---` separator, and returns the
composed string:

```typescript
import explainPluginSkill from '../skills/explain-plugin.md';
import { stripFrontmatter } from '../utils/skillHelpers';

export function buildGalaxyPluginExplanationPrompt(
    collectionFqcn: string,
    pluginName: string,
    pluginType: string,
): string {
    return (
        stripFrontmatter(explainPluginSkill) +
        `\nPlugin: ${pluginName}\n` +
        `Type: ${pluginType}\n` +
        `Collection: ${collectionFqcn}\n` +
        `Source: Galaxy\n` +
        `MCP Tool: get_galaxy_plugin_doc`
    );
}
```

### Path 2: SkillRegistry builtin source (async, MCP tools)

SkillRegistry gains a new `builtin` source type. This source:

- Is always registered automatically — not configurable or removable
  by the user
- Imports skill `.md` content from `@ansible/common` at bundle time
- Parses YAML frontmatter for `skill_list` / `skill_search` metadata
- Returns skill bodies via `skill_get` like any other source
- Appears alongside community skills in the Skills sidebar and MCP
  tool results

When an agent calls `skill_get` for a builtin skill, it receives the
instructions but no appended context — the skill's "ask the user"
clause activates.

### Skill mapping

Approximately 13 skill files replace the instruction text from 15 of
the 18 existing builders (3 meta-prompt builders — `buildSkillLoadPrompt`,
`buildSkillClipboardPrompt`, `buildMcpToolExamplePrompt` — remain as-is
since they are launchers, not instruction bodies):

| Skill File                       | Replaces Builders                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `explain-plugin.md`              | `buildPluginExplanationPrompt`, `buildGalaxyPluginExplanationPrompt`, `buildScmPluginExplanationPrompt` |
| `summarize-collections.md`       | `buildCollectionsSummaryPrompt`                                                                         |
| `summarize-collection.md`        | `buildCollectionSummaryPrompt`                                                                          |
| `overview-collection-sources.md` | `buildCollectionSourcesOverviewPrompt`                                                                  |
| `summarize-galaxy-source.md`     | `buildGalaxySourceSummaryPrompt`                                                                        |
| `summarize-github-source.md`     | `buildGithubOrgSourceSummaryPrompt`                                                                     |
| `summarize-execution-envs.md`    | `buildEESummaryPrompt`                                                                                  |
| `detail-execution-env.md`        | `buildEEDetailPrompt`                                                                                   |
| `overview-creator.md`            | `buildCreatorOverviewPrompt`                                                                            |
| `walkthrough-creator-command.md` | `buildCreatorCommandWalkthroughPrompt`                                                                  |
| `build-task.md`                  | `buildTaskBuilderPrompt`                                                                                |
| `analyze-task-result.md`         | `buildTaskAnalysisPrompt`                                                                               |
| `summarize-playbook.md`          | `buildPlaybookSummaryPrompt`                                                                            |

## Alternatives Considered

### Alternative 1: Skills in `.agents/skills/` loaded by SkillRegistry at runtime

**Description**: Store skills as `.agents/skills/internal/*/SKILL.md`
files. SkillRegistry reads them from disk at runtime as a local source.

**Pros**:

- Skills live alongside repo-local SDLC skills — consistent directory
  convention
- No build-time import required

**Cons**:

- `.agents/skills/` is for Cursor IDE agent skills, not product skills
  — mixing concerns
- Requires filesystem access at runtime — `@ansible/common` cannot
  import them (ADR-011 browser-safe constraint)
- The MCP server standalone would need the source tree on disk
- Prompt builders would need async SkillRegistry access, adding
  complexity and latency to the synchronous sparkle-click path

**Why not chosen**: The browser-safe constraint on `@ansible/common`
makes runtime filesystem access impossible for prompt builders. The
`.agents/skills/` directory serves a different purpose (IDE agent
workflow skills).

### Alternative 2: Keep prompts as TypeScript, expose via SkillRegistry adapter

**Description**: Keep prompt text in TypeScript template strings.
Create an adapter in `@ansible/services` that registers each prompt
builder's output as a synthetic skill in SkillRegistry.

**Pros**:

- No new file format or build tooling
- Prompt builders unchanged

**Cons**:

- Skill content is generated dynamically — no stable markdown to
  review or browse
- Dual maintenance remains (TypeScript strings + adapter wiring)
- Authors still write markdown inside template literals
- No "ask the user" fallback — builders require parameters

**Why not chosen**: Doesn't solve the authoring, readability, or
agent discoverability problems.

### Alternative 3: Skills as TypeScript exported string constants

**Description**: Store skill text as `export const skillText = \`...\``in`.ts`files instead of`.md` files.

**Pros**:

- No build tooling changes (standard TypeScript imports)
- Works in all environments

**Cons**:

- Markdown in template literals is the problem we're solving
- No markdown preview tooling, no syntax highlighting
- Authors must escape backticks inside instructions
- Not browsable as standalone markdown

**Why not chosen**: Trades one form of the readability problem for
another. The `.md` file approach with a thin build integration is
worth the small build-tooling cost.

## Consequences

### Positive

- **Single source of truth**: One `.md` file per skill, consumed by
  both prompt builders and SkillRegistry
- **MCP agent discoverability**: Agents using the MCP server standalone
  can find and follow the same instructions the extension injects
- **Readable, reviewable skills**: Authors write plain markdown with
  YAML frontmatter — standard tooling (preview, linting, diff) works
- **Extension / MCP parity** (ADR-012): Skills complete the parity
  loop — agents know how to compose MCP tools, not just that they exist
- **Graceful degradation**: When invoked without context, skills prompt
  the agent to ask the user — no dead-end behavior

### Negative

- **Build tooling change**: esbuild needs a `.md` text loader;
  TypeScript needs a `*.md` module declaration shim
- **New abstraction**: Contributors must understand the skill file
  convention (frontmatter, context separator, "ask the user" clause)
- **SkillRegistry expansion**: A new `builtin` source type adds code
  to SkillRegistry and its tests
- **Frontmatter stripping**: Prompt builders must strip YAML frontmatter
  before composing — a small utility function, but one more thing to
  get right

### Neutral

- The 3 meta-prompt builders (`buildSkillLoadPrompt`,
  `buildSkillClipboardPrompt`, `buildMcpToolExamplePrompt`) remain
  unchanged — they are skill launchers, not instruction bodies
- Existing prompt builder function signatures and exports are preserved
  for backward compatibility — only the internal implementation changes
- Test coverage expectations are unchanged; existing prompt tests verify
  the composed output

## Implementation Notes

### Build integration

1. **esbuild**: Add `loader: { '.md': 'text' }` to the `shared` and
   `webviewShared` build options in `scripts/build.mjs`.

2. **TypeScript**: Add a `*.md` module declaration to
   `packages/common/src/globals.d.ts`:

    ```typescript
    declare module '*.md' {
        const content: string;
        export default content;
    }
    ```

3. **vitest**: Verify `.md` imports work in tests (vitest's esbuild
   transform should handle this automatically).

### Utility function

A `stripFrontmatter(raw: string): string` helper in
`packages/common/src/utils/` removes YAML frontmatter fences, returning
only the body text. This is used by prompt builders; SkillRegistry uses
its existing `_parseSkillMd` method.

### SkillRegistry changes

1. Add `'builtin'` to the `SkillSource.type` union.
2. Add a `_loadBuiltinSource()` method that imports bundled skill
   content from `@ansible/common`.
3. In `_loadAll()`, always prepend the builtin source before iterating
   user-configured sources.
4. Builtin skills appear with `source: 'builtin'` and
   `trust: 'certified'`.

### Key files

| File                                        | Change                           |
| ------------------------------------------- | -------------------------------- |
| `packages/common/src/skills/*.md`           | New skill files (13)             |
| `packages/common/src/prompts/*.ts`          | Refactored to import skills      |
| `packages/common/src/utils/skillHelpers.ts` | New: `stripFrontmatter`          |
| `packages/common/src/globals.d.ts`          | Add `*.md` module declaration    |
| `packages/services/src/SkillRegistry.ts`    | Add `builtin` source type        |
| `scripts/build.mjs`                         | Add `.md` text loader            |
| `AGENTS.md`                                 | Document internal skills pattern |

## Related Decisions

- [ADR-011](ADR-011-package-architecture.md): Package architecture —
  skills in `@ansible/common` respect the browser-safe constraint
- [ADR-012](ADR-012-mcp-tool-parity.md): MCP tool parity — internal
  skills complete the parity loop by teaching agents how to use tools
- [ADR-005](ADR-005-architectural-invariants.md): Architectural
  invariants — `@ansible/common` remains free of Node.js builtins

---

## Revision History

| Date       | Author                         | Change           |
| ---------- | ------------------------------ | ---------------- |
| 2026-06-18 | Bradley Thornton (AI-assisted) | Initial decision |
