# Product Skills

These are the built-in AI agent skills distributed to end users via the
Ansible DevTools plugin. Each subdirectory contains a `SKILL.md` file
following the [Agent Skills specification](https://agentskills.io/specification).

Skills are discoverable by:

- **68+ coding agents** via `npx skills add ansible/vscode-ansible`
- **Open Plugin hosts** (Cursor, Claude Code, Codex) via the plugin package
- **The MCP server** via `skill_list` / `skill_search` / `skill_get` tools
- **The VS Code extension** via sparkle buttons and the Skills sidebar

## Adding a new skill

1. Create `skills/{name}/SKILL.md` with YAML frontmatter (`name`, `description`, `tags`, `category`, `triggers`)
2. Run `node scripts/generate-skill-content.mjs` to regenerate `.content.ts` sidecars
3. Add the import to `packages/common/src/skills/index.ts`
4. If the skill backs a prompt builder, update the relevant file in `packages/common/src/prompts/`

See [ADR-014](/.sdlc/adrs/ADR-014-internal-skills-as-prompt-source.md) for the architecture decision.
