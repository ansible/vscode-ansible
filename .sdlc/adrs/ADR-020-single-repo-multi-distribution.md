# ADR-020: Single Repository, Multiple Distribution Formats

## Status

Implemented

## Date

2026-06-26

## Context

The Ansible DevTools project produces capabilities that serve multiple
audiences via different consumption models:

1. **VS Code / Cursor extension users** — want a rich IDE experience
   with tree views, webviews, language server, and AI features.
2. **Agent-only users** (Claude Code, Codex, Cursor without extension)
   — want MCP tools and skills without IDE chrome.
3. **Editor users outside VS Code** (Neovim, Zed, Helix, Emacs) —
   want the language server for completion and diagnostics.
4. **Universal agent users** (68+ coding agents) — want skills only,
   no server infrastructure.

Previously, the project produced a single artifact: the `.vsix`
extension package. Users outside VS Code had no supported path. The
MCP server existed but had no distribution mechanism beyond "clone the
repo and build it." Skills were compiled into TypeScript and invisible
to agents outside the extension.

### Forces in tension

- **Reach**: We want Ansible development tooling available everywhere,
  not locked to one editor.
- **Maintenance cost**: Multiple repositories or packages multiply the
  CI, versioning, and release burden.
- **Consistency**: All distribution formats must reflect the same
  source of truth — the same skills, same MCP tools, same language
  server behavior.
- **Testability**: Reviewers need to test any distribution format from
  a PR without waiting for a release.
- **Standards alignment**: The Open Plugin spec, Agent Skills spec,
  MCP spec, and LSP spec each define conventions for discovery and
  packaging.

## Decision

**We will produce five distribution formats from a single repository,
four built as CI artifacts on every pull request and one consumed
directly from the repository source.**

| Format                    | Artifact                    | Audience                                        |
| ------------------------- | --------------------------- | ----------------------------------------------- |
| VSIX                      | VS Code extension package   | VS Code / Cursor extension users                |
| Plugin zip                | Open Plugin Spec v1 package | Cursor, Claude Code, Codex plugin users         |
| MCP server                | Single-file Node.js bundle  | Any MCP client (manual config)                  |
| Language server           | Single-file Node.js bundle  | Any LSP editor (manual config)                  |
| Skills (via `npx skills`) | Git repo source             | 68+ coding agents (Copilot, Cline, Aider, etc.) |

The fifth format — `npx skills add` — requires no build step. The
`skills/*/SKILL.md` layout at the repo root is itself a distribution
point, consumed directly from GitHub by the
[vercel-labs/skills](https://github.com/vercel-labs/skills) CLI.

Additionally, `.plugin/plugin.json`, `.mcp.json`, and `.lsp.json` at
the repo root enable `claude --plugin-dir .` for development-time
testing.

### Key invariants

1. **One source of truth for skills.** Skills live as `SKILL.md` files
   at `skills/{name}/SKILL.md`. A codegen step produces `.content.ts`
   sidecars for compile-time embedding in the extension and MCP server.

2. **One source of truth for servers.** The MCP server
   (`packages/mcp-server/`) and language server
   (`packages/language-server/`) are built by esbuild into single-file
   bundles. The VSIX, plugin zip, and standalone downloads all use
   these same bundles.

3. **No publish-time dependencies.** The plugin zip and standalone
   server downloads are self-contained. They require only Node.js on
   the PATH — no `npm install`, no network fetch, no registry access.

4. **PR-testable.** Every PR produces all four built artifacts.
   Reviewers can test the plugin via `claude --plugin-url` (from
   artifact URL) or by extracting to `~/.cursor/plugins/local/`. The
   fifth format (skills via `npx skills`) is testable directly from
   the branch.

### Shared codebase architecture

Multi-distribution works because the internal packages form a layered
dependency graph where capabilities are built once and consumed by all
distribution formats (see [ADR-011](ADR-011-package-architecture.md)
for full details):

```text
                  ┌─────────────────────┐
                  │   skills/*/SKILL.md  │  ← Markdown source of truth
                  └──────────┬──────────┘
                             │ generate-skill-content.mjs
                             ▼
                  ┌─────────────────────┐
                  │   @ansible/common    │  ← Types, prompts, parsers,
                  │                     │     *.content.ts skill embeds
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │  @ansible/services   │  ← SkillRegistry, CommandService,
                  │                     │     CollectionsService, etc.
                  └──────┬───┬───┬──────┘
                         │   │   │
            ┌────────────┘   │   └────────────┐
            ▼                ▼                 ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  @ansible/   │  │  @ansible/   │  │  Extension   │
  │  mcp-server  │  │  language-   │  │  (src/)      │
  │              │  │  server      │  │              │
  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
         │                  │                  │
         ▼                  ▼                  ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ dist/        │  │ dist/        │  │ *.vsix       │
  │ mcp-server.js│  │ language-    │  │              │
  │              │  │ server.js    │  │              │
  └──────┬───┬───┘  └───┬───┬─────┘  └──────────────┘
         │   │           │   │                ▲
         │   │           │   │                │ (embeds both servers)
         │   └───────┐   │   └──────────┐     │
         │           ▼   │              ▼     │
         │    ┌────────────────┐   ┌──────────┴──┐
         │    │  Plugin zip    │   │    VSIX     │
         │    │  (servers/ +   │   │  (contains  │
         │    │   skills/)     │   │   all three)│
         │    └────────────────┘   └─────────────┘
         ▼
  ┌──────────────┐
  │  Standalone  │
  │  download    │
  └──────────────┘
```

The critical linkages:

| Layer                      | What it provides                                                           | Who consumes it                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `skills/*/SKILL.md`        | Prompt instructions, behavioral contracts                                  | All five formats (compiled into servers via `@ansible/common`, copied raw into plugin, consumed directly via `npx skills`) |
| `@ansible/common`          | Types, skill content embeds, prompt builders, parsers                      | `@ansible/services`, `@ansible/ui`, extension                                                                              |
| `@ansible/services`        | `SkillRegistry`, `CommandService`, collection discovery, container runtime | MCP server, language server, extension                                                                                     |
| `@ansible/mcp-server`      | MCP tool handlers (skill_search, playbook_run, etc.)                       | Plugin zip, standalone MCP artifact, VSIX                                                                                  |
| `@ansible/language-server` | LSP handlers (completion, diagnostics, hover)                              | Plugin zip, standalone LSP artifact, VSIX                                                                                  |

This means a bug fix in `@ansible/services` (e.g., improving
collection discovery) automatically propagates to **all five
distribution formats** in the next build — no separate PRs, no
cross-repo sync, no version coordination. Similarly, adding a new
skill to `skills/` makes it available everywhere: embedded in the MCP
server's `SkillRegistry`, visible to `npx skills add`, present in
the plugin zip's `skills/` directory, and used by the extension's AI
features.

## Alternatives Considered

### Alternative 1: Separate repository for the plugin

**Description**: Maintain a dedicated `ansible-devtools-plugin` repo
that imports from the main repo and assembles the plugin package.

**Pros**:

- Clean separation of concerns
- Independent release cadence
- No clutter in the main repo root

**Cons**:

- Two repos to keep in sync
- Skills must be duplicated or submoduled
- CI complexity increases (cross-repo artifact dependencies)
- Contributors must understand two build systems

**Why not chosen**: The skills and servers already exist in this repo.
Adding metadata files (`.plugin/plugin.json`, `.mcp.json`) is trivial
compared to maintaining cross-repo synchronization. The "one source of
truth" principle is violated by extraction to a separate repo.

### Alternative 2: Publish to npm and reference via npx

**Description**: Publish `@ansible/mcp-server` to npm. The plugin's
`.mcp.json` uses `npx -y @ansible/mcp-server` instead of bundling.

**Pros**:

- Smaller plugin zip (no server binary)
- Automatic updates when npm package is bumped

**Cons**:

- Requires npm registry access at runtime (breaks air-gapped envs)
- Untestable from PRs (package not published yet)
- Version skew between plugin and server
- `npx` startup latency on every MCP connection

**Why not chosen**: Self-contained bundles are faster, work offline,
and are testable from CI artifacts. The `next` branch is pre-release
(v0.0.1) so nothing is published yet anyway.

### Alternative 3: Plugin as a separate package in the monorepo

**Description**: Add `packages/plugin/` as a workspace package that
assembles the plugin from other packages.

**Pros**:

- Fits the existing monorepo package model
- Could have its own tests and build config

**Cons**:

- Over-engineering for what is essentially a file-copy step
- The plugin is not a library — it has no importable API
- Adds a package.json, tsconfig, and test file for no code

**Why not chosen**: A 50-line shell script (`scripts/build-plugin.sh`)
accomplishes the same thing without package ceremony. The plugin is a
distribution format, not a software component.

## Consequences

### Positive

- **Universal reach.** Ansible development tools are available to any
  coding agent or editor, not just VS Code.
- **Single source of truth.** All formats are built from the same
  commit — no version skew between extension and plugin.
- **PR-testable.** Reviewers can validate any distribution format
  before merge.
- **Standards-aligned.** The repo simultaneously conforms to the Open
  Plugin spec, Agent Skills spec, MCP spec, and LSP spec.
- **Leo's proposal is addressed.** The `npx skills add` path and
  plugin skill directory provide the interop surface that
  `ansible-skill-mcp` needs to contribute generated skills.

### Negative

- **Root directory clutter.** `.plugin/`, `.cursor-plugin/`,
  `.claude-plugin/`, `.mcp.json`, `.lsp.json`, `mcp.json`, and
  `skills/` add visible entries to the repo root.
- **Multiple specs to track.** Changes to Open Plugin, Agent Skills,
  or MCP specs may require updating the packaging layout.
- **Build script maintenance.** `scripts/build-plugin.sh` is simple
  today but may grow as the plugin format evolves (hooks, agents,
  rules).

### Neutral

- This does not change the extension's VS Code marketplace
  distribution. The VSIX continues to be built and uploaded as before.
- The `.content.ts` sidecar pattern (ADR-014) is unchanged — the
  codegen script just reads from a different input path.
- The CI workflow gains 3 additional upload steps in the existing
  `package` job. No new jobs are required.

## Implementation Notes

### Build pipeline

```text
skills/*/SKILL.md  ──┐
                     ├──→ scripts/generate-skill-content.mjs
                     │         │
                     │         ▼
                     │    packages/common/src/skills/*.content.ts
                     │         │
                     │         ▼
                     │    npm run build (esbuild)
                     │         │
                     │         ├──→ dist/mcp-server.js (950KB)
                     │         ├──→ dist/language-server.js (1.3MB)
                     │         └──→ dist/extension.js (VSIX source)
                     │
                     └──→ scripts/build-plugin.sh
                               │
                               ▼
                          dist/ansible-devtools-plugin.zip (440KB)
                               ├── .plugin/plugin.json
                               ├── skills/*/SKILL.md
                               ├── servers/mcp-server.js
                               ├── servers/language-server.js
                               ├── .mcp.json
                               └── .lsp.json
```

### Key files

| File                                 | Purpose                                            |
| ------------------------------------ | -------------------------------------------------- |
| `skills/*/SKILL.md`                  | Source of truth for all skills                     |
| `.plugin/plugin.json`                | Open Plugin manifest (vendor-neutral)              |
| `.cursor-plugin/plugin.json`         | Cursor-preferred manifest                          |
| `.claude-plugin/plugin.json`         | Claude Code-preferred manifest                     |
| `.mcp.json` / `mcp.json`             | MCP server config (dev: `dist/`, prod: `servers/`) |
| `.lsp.json`                          | Language server config                             |
| `scripts/build-plugin.sh`            | Assembles the plugin zip from build outputs        |
| `scripts/generate-skill-content.mjs` | Generates `.content.ts` from `SKILL.md`            |

### Distribution discovery

| Channel             | Discovery mechanism                                                         |
| ------------------- | --------------------------------------------------------------------------- |
| `npx skills add`    | Scans `skills/` at repo root                                                |
| Open Plugin hosts   | Reads `.plugin/plugin.json` → discovers `skills/`, `.mcp.json`, `.lsp.json` |
| Manual MCP config   | User points config at `mcp-server.js`                                       |
| Manual LSP config   | User points editor at `language-server.js --stdio`                          |
| VS Code Marketplace | Standard VSIX packaging via `vsce`                                          |

## Related Decisions

- [ADR-011](ADR-011-package-architecture.md): Package Architecture —
  defines the `@ansible/common` → `@ansible/services` → server/extension
  dependency graph that makes multi-distribution possible from shared code
- [ADR-012](ADR-012-mcp-tool-parity.md): MCP Tool Parity — ensures
  the MCP server distribution is functionally equivalent to the UI
- [ADR-014](ADR-014-internal-skills-as-prompt-source.md): Internal
  Skills — defines the skill file format and dual-consumption pattern
- [ADR-016](ADR-016-docs-as-ecosystem-hub.md): Docs as Ecosystem Hub
  — the "AI & Agents" documentation section covers all distribution
  formats
- [ADR-018](ADR-018-mcp-skills-compliance.md): MCP/Skills Compliance
  — governs quality standards for the distributed tools and skills

## References

- [Open Plugin Specification v1.0.0](https://github.com/vercel-labs/open-plugin-spec)
- [Agent Skills Specification](https://agentskills.io/specification)
- [`npx skills` CLI](https://github.com/vercel-labs/skills) (23.6k stars, 68+ agents)
- [Cursor Plugin Docs](https://cursor.com/docs/plugins)
- [Claude Code Plugin Docs](https://code.claude.com/docs/en/plugins)

---

## Revision History

| Date       | Author                         | Change           |
| ---------- | ------------------------------ | ---------------- |
| 2026-06-26 | Bradley Thornton (AI-assisted) | Initial decision |
