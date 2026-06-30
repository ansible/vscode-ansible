# ADR-018: MCP and Skills Compliance Policy

## Status

Accepted

## Date

2026-06-23

## Context

The `@ansible/mcp-server` package exposes 15 static MCP tools plus
dynamic `ac_*` (creator) and `skill_*` tools. The `SkillRegistry` in
`@ansible/developer-services` loads skills from multiple sources (builtin,
GitHub, local) and the `SkillToolGenerator` in `@ansible/mcp-server`
dynamically generates `skill_*` MCP tools. This infrastructure was
built before the MCP community codified best practices at scale:

- The MCP Dev Summit NA 2026 produced 57 practices and a set of
  critical anti-patterns from 100 industry sessions.
- A server code-review guide documented 22 practices and 8
  anti-patterns distilled from production deployments.
- The Skills Over MCP Working Group (converted from Interest Group,
  April 2026) is pursuing SEP-2640, an Extensions Track specification
  for serving skills over MCP using the Resources primitive.
- The Agent Skills specification (agentskills.io) defines the
  canonical format for skill files.

Our existing tools follow intent-based naming and our skills use
frontmatter-based progressive disclosure — both aligned with the
emerging consensus. However, without a standing compliance gate, drift
is likely as new tools and skills are added. Tool annotations
(`readOnlyHint`, `destructiveHint`, `idempotentHint`) are not yet
applied. Error responses lack machine-readable recoverability signals.
Skill files do not yet use the `skill://` URI scheme.

ADR-012 ensures every capability has an MCP tool equivalent. ADR-014
establishes skills as the prompt source of truth. This ADR complements
both by governing the **quality and spec-conformance** of those tools
and skills.

## Decision

**We will require that all MCP tools and skills conform to documented
best practices and the emerging MCP specification. Compliance is
verified during code review using the checklist below.**

### Tool Design

1. **Intent-based naming.** Tools are named after user outcomes
   (`generate_ansible_task`, `search_ansible_plugins`), not after API
   endpoints or internal methods.

2. **Behavioral annotations.** Every tool definition must include
   `readOnlyHint`, `destructiveHint`, and `idempotentHint`. Hosts use
   these to auto-approve reads, gate writes behind confirmation, and
   reason about retry safety.

3. **Valid `inputSchema`.** Every tool must have an `inputSchema` with
   `type: "object"` and explicitly typed parameters. Never rely on
   framework defaults — 19% of tools in the wild have broken schemas
   due to silent framework failures.

4. **Structured `outputSchema`.** Tools whose output is consumed by
   downstream tool calls or programmatic composability should declare
   an `outputSchema`. This enables code-mode tool chaining.

5. **Context footprint.** Keep tool descriptions concise. Each tool
   consumes ~500 tokens when loaded. If the total tool count per
   server exceeds ~15–20, implement progressive discovery (see
   Context Management below).

### Security

1. **Server-side input validation.** Treat all tool inputs as
   untrusted — they originate from an LLM influenced by prompt
   injection, poisoned context, or hallucination. Validate types,
   bounds-check numerics, sanitize for injection (command, path
   traversal), and validate enums. Never rely on the LLM to
   self-constrain.

2. **No prompt-based access control.** Access control must be enforced
   in code (middleware, guards, decorators). Prompt-based restrictions
   ("only use tools X, Y, Z") have bypass rates of 25–92%.

3. **No read-only-as-security-boundary.** Read access to a tool does
   not imply the data it returns is safe to surface. Apply data-level
   controls (redaction, masking) before sensitive data enters tool
   responses.

### Error Handling

1. **Machine-readable error responses.** Every error response must
   include:
    - A machine-readable error code (not just a human string)
    - A recoverability signal: `retry`, `escalate`, or `fail`
    - A suggested next action when applicable

    Ambiguous errors trigger retry storms from probabilistic callers.

2. **Destructive operations gated.** Tools that modify state
    (`install_ansible_collection`, creator scaffold tools) must be
    annotated with `destructiveHint: true` so hosts can interpose
    confirmation. Where the MCP spec supports elicitations, prefer
    them over silent execution.

### Skill Compliance

1. **agentskills.io frontmatter.** Every skill file must have YAML
    frontmatter with at minimum `name` and `description`, conforming
    to the Agent Skills specification. Additional keys (`tags`,
    `triggers`, `category`, `domain`) are recommended.

2. **Three-level progressive disclosure.** Skills must support:
    - Level 1: Frontmatter (name + description) — always in context
    - Level 2: SKILL.md body — loaded when the model decides to apply
    - Level 3: Reference files — loaded on demand during the workflow

3. **`skill://` URI alignment.** When SEP-2640 is ratified, skill
    resources must be addressable via the `skill://` URI scheme.
    Until ratification, skill URIs should be structured so migration
    is a rename, not a redesign.

4. **Skills are data, not directives.** Skill content served over
    MCP must be treated as untrusted input. Hosts must not
    automatically execute scripts or hooks embedded in skill
    frontmatter from remote sources.

### Context Management

1. **Progressive discovery.** When the total tool definitions served
    by `@ansible/mcp-server` exceed 1–5% of a typical context window
    (~200k tokens), implement a `search_tools` meta-tool pattern to
    defer loading full schemas into context.

2. **Cache-friendly tool arrays.** Append newly discovered tool
    definitions after the cache breakpoint rather than re-sorting the
    `tools` array, to preserve prompt caching.

3. **`skill://index.json`.** When the skill catalog is served over
    MCP, expose a `skill://index.json` resource enumerating available
    skills with frontmatter summaries and content digests.

### PR Compliance Checklist

PRs that touch `packages/mcp-server/` or skill files must answer:

- [ ] Does every new/modified tool have `readOnlyHint`,
      `destructiveHint`, and `idempotentHint` annotations?
- [ ] Does every tool have a valid `inputSchema` with
      `type: "object"` and explicitly typed parameters?
- [ ] Are error responses machine-readable with a recoverability
      signal (`retry` / `escalate` / `fail`)?
- [ ] Are tool inputs validated server-side?
- [ ] Do new/modified skills have valid agentskills.io frontmatter
      (`name`, `description` at minimum)?
- [ ] Does the skill support three-level progressive disclosure?
- [ ] Is the tool description under ~500 tokens?

## Alternatives Considered

### Alternative 1: Best-effort compliance without a gate

**Description**: Document best practices in the landscape research
document and trust contributors to follow them voluntarily.

**Pros**:

- No additional process overhead
- Flexible — contributors adapt practices case-by-case

**Cons**:

- Drift is inevitable without a review gate
- No way to audit compliance across the tool surface
- New contributors have no clear checklist

**Why not chosen**: The Dev Summit findings show that even experienced
teams produce broken schemas (19% failure rate) and prompt-based
access control (25–92% bypass) without enforcement. Best-effort is
insufficient.

### Alternative 2: Automated schema validation in CI

**Description**: Build a CI check that validates every tool definition
against a JSON Schema for annotations, inputSchema, and error format.

**Pros**:

- Mechanical enforcement — no human review needed for schema quality
- Catches regressions automatically

**Cons**:

- Cannot validate semantic properties (intent-based naming, adequate
  descriptions, correct recoverability signals)
- Significant upfront tooling investment
- Doesn't cover skill file quality

**Why not chosen**: Automated validation is a future enhancement (see
Consequences), not a replacement for the code review checklist. The
checklist covers semantic properties that automation cannot assess.

## Consequences

### Positive

- Tools and skills stay aligned with the MCP specification and
  community best practices as both evolve
- Behavioral annotations enable hosts to auto-approve reads and gate
  destructive operations — better agent UX
- Machine-readable errors reduce token waste from retry storms
- Skill compliance positions us for seamless SEP-2640 adoption
- The checklist is objective — reviewers can verify compliance
  mechanically

### Negative

- Every new tool requires annotation and schema work, increasing
  per-tool authoring cost by an estimated 10–15%
- The compliance requirements may need updating as the MCP
  specification evolves — the ADR must be revisited periodically
- Some existing tools will need retrofitting (tracked separately)

### Neutral

- This ADR does not mandate retroactive compliance for existing tools;
  however, a backlog of existing gaps should be tracked
- Automated CI enforcement is a natural follow-on but is not required
  by this decision

## Implementation Notes

### Current Compliance Gaps (to be tracked separately)

| Gap                               | Scope               |
| --------------------------------- | ------------------- |
| Missing behavioral annotations    | All 15 static tools |
| No `outputSchema`                 | All tools           |
| Error responses are human strings | Most tool handlers  |
| No `skill://` URI scheme          | All skills          |
| No `skill://index.json` resource  | MCP server          |

### Key Files

| File                                     | Relevance                              |
| ---------------------------------------- | -------------------------------------- |
| `packages/mcp-server/src/tools.ts`       | Tool definitions — annotations go here |
| `packages/mcp-server/src/handlers.ts`    | Tool handlers — error format changes   |
| `packages/mcp-server/src/server.ts`      | Server setup — progressive discovery   |
| `packages/mcp-server/src/skillTools.ts`  | Skill tool generation                  |
| `packages/common/src/skills/*.md`        | Internal skill files                   |
| `packages/services/src/SkillRegistry.ts` | Skill loading and registry             |

## References

| Document                                | Location                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| MCP and Skills: Synthesis and Landscape | `.sdlc/research/mcp-skills-landscape.md`                                                              |
| MCP Client Best Practices               | [modelcontextprotocol.io](https://modelcontextprotocol.io/docs/develop/clients/client-best-practices) |
| Skills Over MCP WG Charter (SEP-2640)   | [modelcontextprotocol.io](https://modelcontextprotocol.io/community/working-groups/skills-over-mcp)   |
| Agent Skills Specification              | [agentskills.io](https://agentskills.io/specification)                                                |
| MCP Best Practices and Anti-Patterns    | `.sdlc/research/mcp-best-practices-and-anti-patterns.md`                                              |
| MCP Server Recommended Practices        | `.sdlc/research/mcp-server-recommended-practices.md`                                                  |

## Related Decisions

- [ADR-005](ADR-005-architectural-invariants.md): Architectural
  invariants — this ADR adds invariant 12
- [ADR-012](ADR-012-mcp-tool-parity.md): MCP tool parity — ADR-018
  governs quality; ADR-012 governs coverage
- [ADR-014](ADR-014-internal-skills-as-prompt-source.md): Internal
  skills as prompt source — ADR-018 governs the format and spec
  conformance of those skill files

---

## Revision History

| Date       | Author      | Change           |
| ---------- | ----------- | ---------------- |
| 2026-06-23 | AI-assisted | Initial decision |
