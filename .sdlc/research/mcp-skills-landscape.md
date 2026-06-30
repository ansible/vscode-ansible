# MCP and Skills: Synthesis and Landscape

**Date:** 2026-06-23
**Scope:** Synthesizes MCP best practices, anti-patterns, the Skills Over MCP
Working Group direction (SEP-2640), and emerging techniques into a single
reference for the Ansible Developer Tools team.

---

## 1. Executive Summary

MCP is evolving from a tool protocol into a **context protocol**. Tools tell an
agent _what_ it can do; skills tell it _how to orchestrate_ multiple tools to
achieve a goal. Progressive disclosure controls _when_ tool definitions and skill
content enter the model's context window. And programmatic tool calling controls
_how_ tools are invoked — letting the model write sandbox code that chains tools
without passing intermediate results through context. Together these three axes
— what, when, how — define the emerging MCP stack. The industry is converging on
a layered architecture: specialized servers with intent-based tools, skills as
structured "how-to" knowledge served alongside those tools, and progressive
discovery to keep context focused. Security, observability, and error handling
are not afterthoughts but structural properties of each layer.

---

## 2. Good Practices

Distilled from the MCP Dev Summit NA 2026 (100 sessions, 57 practices) and the
server code-review guide (22 practices), organized by theme.

### Tool Design

- **Design around user intent, not API endpoints.** A tool named
  `process_refund` is better than separate `post_orders`, `patch_refund`,
  `get_status` tools. Apollo demonstrated 70% fewer tool calls and 50% fewer
  tool tokens with intent-based design.
- **Minimize per-tool context footprint.** Each tool consumes ~500 tokens when
  loaded. Keep descriptions concise, parameter docs brief, and the total tool
  count per server under ~15–20. If higher, split into domain-specific servers.
- **Annotate tools with behavioral hints.** Use `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, and `openWorldHint` so clients can
  auto-approve reads, gate writes behind confirmation, and reason about
  idempotency.
- **Provide valid `inputSchema` for every tool.** 19% of tools in the wild have
  broken schemas (null, empty, or missing `type: "object"`). Validate generated
  schemas; frameworks silently produce invalid output (Python defaults untyped
  params to `string`, Zod drops discriminated unions, Go emits uninitialized
  structs).
- **Implement structured output schemas.** `outputSchema` enables code-mode
  composability — models can reason about return types and chain tool calls
  programmatically.

### Security

- **Implement RBAC at tool and data layers.** Prompt-based access control
  ("only use tools X, Y, Z") has bypass rates of 25–92%. Enforce access in
  code: middleware, decorators, guards. Access to a server must not imply access
  to all its tools.
- **Require distinct agent identities.** Each agent authenticates as its own
  principal, not a shared service account. Audit logs record which agent (not
  just which user) made each call.
- **Validate all tool inputs server-side.** Treat inputs as untrusted — they
  come from an LLM influenced by prompt injection, poisoned context, or
  hallucination. Sanitize for injection (SQL, command, path traversal), bounds-
  check numerics, validate enums.
- **Implement data-level access controls.** Read-only is not a security
  boundary. An agent with SELECT access can still extract PII, credentials,
  and salary data. Apply column masking, row-level security, and PII redaction
  before data enters tool responses.
- **Use OAuth 2.1, not API keys.** Only ~22% of MCP v2+ servers use OAuth
  despite it being the spec-recommended mechanism. API keys give full access
  without scopes, can't be time-limited, and aren't in the spec.
- **Validate Origin headers.** Over 80% of MCP servers fail Origin header
  validation. DNS rebinding attacks bypass same-origin policy in ~3 seconds on
  Chrome. CVE-2025-11249 affected the official TypeScript SDK.

### Context Management

- **Implement progressive tool discovery.** Defer loading tool definitions into
  context. Provide a lightweight `search_tools` meta-tool. Threshold: switch
  to progressive discovery when tool definitions exceed 1–5% of the context
  window.
- **Cache tool definitions host-side.** Memoize after the first `tools/list`
  call. Re-index when a server sends `notifications/tools/list_changed`.
- **Group tools by server.** Present tools organized by source server so the
  model can reason about related capabilities.
- **Use `structuredContent`, `content`, and `_meta` correctly.** `content` is
  for model explanations, `structuredContent` for typed data the model may see,
  `_meta` for internal IDs the model never needs.

### Observability

- **Log every tool call structurally.** Include tool name, parameters, caller
  identity, timestamp, and outcome. Use structured JSON, not freeform text.
  Redact sensitive parameters (don't omit the call entirely).
- **Integrate with tracing.** OpenTelemetry or equivalent. Agents have a larger
  blast radius than humans — more calls, faster, across more tools. Without
  observability, you cannot reconstruct incidents.

### Error Handling

- **Return machine-readable recovery contracts.** Every error response should
  include: a machine-readable error code, a recoverability signal (`retry`,
  `escalate`, or `fail`), and a suggested next action. Ambiguous errors trigger
  retry storms.
- **Design for safe retries by probabilistic callers.** LLMs don't send the
  same payload twice — they generate a structurally different request with the
  same semantic intent. Use server-side deduplication via natural keys, not
  caller-provided idempotency tokens.
- **Gate destructive operations behind human approval.** Use elicitations,
  confirmation prompts, or external approval workflows for write/update/delete
  operations.

---

## 3. Anti-Patterns

### Critical

| Anti-Pattern                          | Impact                                                                     | Fix                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Loading all tool schemas upfront**  | A server with ~100 tools consumes ~60,000 tokens before the user's message | Progressive discovery / tool search                    |
| **God server / unconstrained sprawl** | 80 tools = 72% of context consumed; wider security blast radius            | Split into domain-specific servers (<15–20 tools each) |
| **Prompt-based access control**       | Bypass rates 25–92%; creates false sense of security                       | RBAC in server code                                    |
| **1:1 API endpoint-to-tool mapping**  | Forces the LLM to become an integration engineer; widens attack surface    | Design around outcomes, not endpoints                  |

### High

| Anti-Pattern                                  | Impact                                                       | Fix                                                    |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| **Shared service account credentials**        | Impossible to audit which agent did what                     | Distinct identity per agent                            |
| **Treating read-only as a security boundary** | Agent can still SELECT secrets, PII, credentials             | Column masking, row-level security                     |
| **Framework-silent schema failures**          | 19% of tools have broken schemas; agents guess at parameters | Explicitly type all params; validate generated schemas |
| **Loading all tool results into context**     | Massive output bloat from intermediate results               | Programmatic tool calling / code mode                  |
| **Expecting users to self-configure**         | Even "one click to copy config" had low adoption (Duolingo)  | Bring tools to where users already work                |
| **Standalone playgrounds**                    | Ungoverned; Uber deprecated all of them                      | Everything centrally committed in code                 |

---

## 4. Skills and Their Relationship to MCP Tools

### The Gap Between Tools and Know-How

MCP tools tell an agent _what_ it can do. Tool descriptions explain parameters
and return values. But tools alone are insufficient for complex workflows — they
don't explain _how to orchestrate_ multiple tools together. Skills bridge this
gap. They are structured "how-to" knowledge: multi-step workflows, conditional
logic, domain-specific patterns, and orchestration instructions that can run to
hundreds of lines.

The mcpGraph toolkit illustrates the problem: its MCP server is effectively
unusable without an accompanying 875-line SKILL.md that teaches agents how to
build directed graphs of MCP tool calls.

### Skills Are Context, MCP Is a Context Protocol

Skills are not a competing paradigm to MCP tools — they are complementary:

| Paradigm      | Role                                  | Strength                   |
| ------------- | ------------------------------------- | -------------------------- |
| **MCP Tools** | Connectors that expose capabilities   | What an agent _can_ do     |
| **Skills**    | Recipes that instruct the model       | How to _orchestrate_ tools |
| **CLI**       | Token-efficient progressive discovery | Composable via `--help`    |

The MCP Dev Summit consensus: "These paradigms are complementary, not competing.
MCP Tools are the connectors that expose new capabilities, while Skills are the
recipes that instruct the model on how to use those capabilities." Supabase
demonstrated that MCP+Skill beat MCP-only in all 6 scenarios, preventing
security vulnerabilities that the tool-only approach missed.

### How Skills Are Served Over MCP (SEP-2640)

The Skills Over MCP Working Group (converted from Interest Group in April 2026)
is pursuing **SEP-2640**, an Extensions Track specification that serves skills
over MCP using the existing **Resources** primitive. Key design decisions:

**Format:** Skills conform to the [Agent Skills specification](https://agentskills.io/specification).
A skill is a directory containing at minimum a `SKILL.md` with YAML frontmatter
(`name`, `description`). It may contain additional files (references, scripts,
examples). The format is delegated entirely to agentskills.io — the SEP is
purely a transport binding.

**URI scheme:** `skill://<skill-path>/SKILL.md`. Four independent
implementations converged on `skill://` without coordination — a strong signal.
The final path segment must equal the skill's frontmatter `name`. Preceding
segments are server-chosen organizational prefixes.

```text
skill://git-workflow/SKILL.md
skill://acme/billing/refunds/SKILL.md
skill://pdf-processing/references/FORMS.md
```

**Discovery:** Three mechanisms, layered:

1. **Direct read** — a `skill://` URI is always readable via `resources/read`,
   whether or not it appears in any index.
2. **Index resource** — servers SHOULD expose `skill://index.json` enumerating
   concrete skills and parameterized templates.
3. **Server instructions** — servers MAY point the agent at specific skill URIs
   from their `instructions` field.

**Capability declaration:**

```json
{
    "capabilities": {
        "extensions": {
            "io.modelcontextprotocol/skills": {}
        }
    }
}
```

**Key principle:** no new protocol methods or capabilities are required. Hosts
that already treat MCP resources as a virtual filesystem can consume MCP-served
skills identically to local filesystem skills.

### Security Model for Skills

- Skills are **untrusted input** — hosts must treat MCP-served skill content
  with the same prompt-injection defenses applied to any server-provided text.
- Skills are **data, not directives** — hosts must not treat skill resources as
  higher-authority than other context.
- **No implicit local execution** — hosts must not honor shell commands,
  hook declarations, or scripts embedded in skill frontmatter when the skill
  arrives over MCP. Gate behind explicit per-skill user approval.
- Connecting a server already extends the trust boundary — a malicious server
  can do as much harm via tools as via a skill document.

---

## 5. Progressive Disclosure

Progressive disclosure is a cross-cutting theme that applies to both tools and
skills. The core principle: load context on demand, not upfront.

### For Tools: Three-Layer Pattern

```text
Layer 1: Catalog    → search_tools({ query: "..." })
                      Returns names + one-line descriptions only

Layer 2: Inspect    → get_tool_details({ name: "..." })
                      Returns full inputSchema for one tool

Layer 3: Execute    → call the tool with full knowledge of its interface
```

This reduces token usage dramatically. Claude Code went from 22% of its 200k
context window consumed by MCP tools to having them fully deferred.

### For Skills: Three-Level Loading

The Agent Skills specification defines a parallel three-level disclosure model:

```text
Level 1: Frontmatter  → name + description (always in context)
                         Lets the model judge relevance

Level 2: SKILL.md body → Full orchestration instructions
                          Loaded when the model decides the skill applies

Level 3: Reference files → Supporting docs, scripts, examples
                            Loaded on demand as the workflow progresses
```

### Dynamic Server Management

Progressive disclosure extends to entire servers:

1. Maintain a registry of available servers with high-level descriptions.
2. Connect to a server only when the model determines it needs that server's
   capabilities.
3. Disconnect servers no longer relevant, freeing context.

Skills can declare which MCP servers they need — the host connects them only
when that skill is invoked.

### Interaction with Prompt Caching

Most providers cache the prompt prefix, including the `tools` array. Adding or
removing tool definitions mid-conversation invalidates that cache. To preserve
caching:

- Append newly discovered definitions **after** the cache breakpoint rather
  than re-sorting the `tools` array.
- Route every call through a single stable `call_tool({name, args})` meta-tool
  so the array never changes.
- Treat server disconnection as a conversation-boundary operation, not per-turn.

---

## 6. Emerging Techniques

### Programmatic Tool Calling (Code Mode)

Instead of round-tripping every tool result through the model, the model writes
code that calls tools in a sandbox. Only the final result returns to context.

```text
Model → writes script → Sandbox executes → function calls routed to MCP servers
                                          → only console output returns to model
```

Effective when tool chains produce large intermediate results. A "find all error
logs and file tickets" workflow that would pass thousands of log entries through
context instead runs as a ~200-token script returning a one-line summary.

Requires a sandbox (Deno, `isolated-vm`, Wasmtime, or Monty for Python). The
host acts as broker — intercepts function calls, routes to MCP servers, returns
results to the sandbox. Credentials stay on the host.

### Skills + MCP Server Plugins

Coding assistants are converging on plugin capabilities that bundle skills and
MCP servers into a single installable unit. Kiro calls them "powers and steering
files"; Claude Code has plugins; AWS ships Agent SOPs alongside its MCP server.
The pattern: one-click install of tools + the know-how to use them.

### Version-Adaptive Skill Content

Skills that dynamically adapt based on the platform version at runtime. Example:
Apache Airflow 2.x vs 3.x have substantially different APIs — a version-adaptive
skill detects which version is running and returns only the relevant guidance.
Serving wrong-version guidance is worse than no guidance at all.

### `resources/directory/read` (SEP-2640)

A new protocol method for listing the children of a directory-like resource.
Directories identified by `mimeType: "inode/directory"`. Returns metadata only
(URIs, names, mimeTypes — like `ls`, not a recursive read). Introduced as a
skills-extension-scoped capability; expected to promote to core MCP.

### Decoupled Index Schema

The WG is decoupling `skill://index.json` from the upstream `.well-known`
Agent Skills discovery format (which has implementations but no governance
momentum). The WG-owned schema carries: `url`, `digest` (SHA-256 for caching),
a verbatim `frontmatter` object (full copy of SKILL.md frontmatter), and an
`archives` array for bundled distribution.

### Skill Reliability Challenges

A known problem across the ecosystem: models do not reliably load or follow
skill instructions, even when preloaded in context.

- Adherence is "time-decaying" — models follow instructions initially but lose
  adherence as context grows and compaction occurs.
- Behavior is model-specific; weaker models show lower success rates.
- Most effective workaround observed: wrapping skills in a subagent whose name
  or description mentions the skill topic.
- Server instructions telling the agent to "read the SKILL.md before using
  tools" reliably trigger initial loading.

---

## 7. Relevance to This Project

### What We Already Do Well

- **Intent-based tool design.** Our `@ansible/mcp-server` exposes 15 static
  tools plus dynamic `ac_*` (creator) and `skill_*` tools. Tools are named
  after outcomes (`generate_ansible_task`, `search_ansible_plugins`) not API
  endpoints.
- **Skills infrastructure.** `SkillRegistry` in `@ansible/developer-services` loads
  skills from multiple sources (builtin, GitHub, local). `SkillToolGenerator`
  in `@ansible/mcp-server` dynamically generates `skill_*` MCP tools. Prompt
  builders (`buildSkillLoadPrompt`, `buildSkillClipboardPrompt`) in
  `@ansible/common` produce properly structured prompts.
- **Progressive loading.** Skills have frontmatter summaries loaded upfront;
  full content loaded via `skill_get` on demand.

### Opportunities

- **Adopt `skill://` URI scheme.** Align our skill resources with SEP-2640 so
  our MCP server is interoperable with any conformant host. Expose skills as
  `skill://<name>/SKILL.md` resources alongside the existing `skill_*` tools.
- **Expose `skill://index.json`.** Enumerate our skill catalog as a well-known
  resource, enabling host-side discovery without tool invocation.
- **Progressive tool discovery.** As our tool count grows (15 static + dynamic
  creator + dynamic skill tools), implement the search_tools meta-tool pattern
  to defer loading definitions into context.
- **Tool annotations.** Add `readOnlyHint`, `destructiveHint`, and
  `idempotentHint` to our tool definitions so hosts can auto-approve reads and
  gate writes like `install_ansible_collection`.
- **Structured output schemas.** Add `outputSchema` to tool definitions to
  enable code-mode composability.
- **Error recovery contracts.** Standardize error responses with machine-
  readable codes and recoverability signals.

---

## Sources

| Document                                                                                                | Provenance                                                                                                                                                                                                                                                    | Date       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [MCP Client Best Practices](https://modelcontextprotocol.io/docs/develop/clients/client-best-practices) | modelcontextprotocol.io                                                                                                                                                                                                                                       | 2026       |
| [Skills Over MCP WG Charter](https://modelcontextprotocol.io/community/working-groups/skills-over-mcp)  | modelcontextprotocol.io                                                                                                                                                                                                                                       | 2026-04-25 |
| MCP Best Practices and Anti-Patterns Report                                                             | `.sdlc/research/mcp-best-practices-and-anti-patterns.md` — synthesized from 100 sessions, MCP Dev Summit NA 2026                                                                                                                                              | 2026-04-20 |
| MCP Server Recommended Practices for Code Review                                                        | `.sdlc/research/mcp-server-recommended-practices.md` — 22 practices, 8 anti-patterns                                                                                                                                                                          | 2026-04-23 |
| Skills Over MCP Experimental Repository                                                                 | [modelcontextprotocol/experimental-ext-skills](https://github.com/modelcontextprotocol/experimental-ext-skills) — SEP-2640 draft, problem statement, approaches, decisions, use cases, experimental findings, related work, URI scheme proposal, `_meta` keys | 2026-06    |
