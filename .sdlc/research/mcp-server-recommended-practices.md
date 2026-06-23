# MCP Server Recommended Practices for Code Review

## How to Use This Document

This document is designed to be provided as context to AI agents conducting code reviews of MCP server implementations. Each practice and anti-pattern includes what to look for in the code and why it matters.

The document covers only practices that can be assessed by reading MCP server source code. Recommendations about external infrastructure (gateways, registries, hosting platforms, organizational governance models) are excluded. RBAC and security controls implemented within server code are in scope.

Practices are rated by importance:

- **CRITICAL** — High-severity risk with strong consensus and quantitative evidence. Address first.
- **HIGH** — Significant risk or quality impact backed by multiple independent sources.
- **MEDIUM** — Meaningful improvement with moderate evidence.
- **LOW** — Good practice with limited supporting evidence.

This document was synthesized from dozens of sessions at MCP Dev Summit North America 2026. All practices cite their contributing sessions and presenters.

---

## Recommended Practices

### Spec Compliance & Protocol Conformance

#### Validate Origin Headers and Protect Against DNS Rebinding — CRITICAL

**What it is**: Every HTTP-based MCP server must validate the `Origin` header on incoming requests and reject requests with invalid or missing origins. This is the primary defense against DNS rebinding attacks, which allow malicious websites to send requests to locally-running MCP servers.

**Why it matters**: Over 80% of MCP servers fail Origin header validation (analysis of 41,924 servers). DNS rebinding attacks bypass same-origin policy by re-resolving a domain from an attacker's IP to `127.0.0.1`, giving a malicious webpage full access to localhost MCP servers. Live exploits demonstrated bypass in approximately 3 seconds on Chrome. CVE-2025-11249 affected the official TypeScript SDK, which shipped with DNS rebinding protection disabled by default. Multiple servers from Google, Docker, and Apollo were confirmed vulnerable. Firefox and Safari remain fully exploitable with no protection.

**What to look for in code**:
- Server validates the `Origin` header on every request and returns HTTP 403 for unrecognized origins
- Server validates the `Host` header to reject requests where Host doesn't match expected values
- DNS rebinding protection is enabled by default, not opt-in
- For servers using the TypeScript SDK: verify rebinding protection is explicitly enabled if using an older version
- Test: `curl` the server with a spoofed `Host` header — if it responds normally, the server is vulnerable

**Sources**: "Rules Are Not Suggestions: A History of MCP Non-Compliance" (Sterling Dreyer, Arcade); "MCPwned: Hacking MCP Servers With One Skeleton Key Vulnerability" (Jonathan Leitschuh); MCP Specification 2.0.1 Security Considerations

---

#### Implement OAuth 2.1 Authorization — CRITICAL

**What it is**: MCP servers that handle authenticated requests should implement OAuth 2.1 with Dynamic Client Registration (DCR) rather than static API keys.

**Why it matters**: Only approximately 22% of MCP v2+ servers use OAuth despite it being the spec-recommended authentication mechanism. API keys are not part of the MCP specification, give full access without scopes, require users to manually mint and manage keys, and cannot be narrowed or time-limited. OAuth 2.1 enables scoped access, short-lived tokens, and delegated authorization — all essential for multi-agent environments where tokens may be exchanged between services.

**What to look for in code**:
- Server implements OAuth 2.1 authorization flow, not just API key validation
- Server supports Dynamic Client Registration (DCR)
- Tokens are short-lived with refresh capability
- Scopes are defined and enforced per tool or operation
- If API keys are used as a fallback, verify they are scoped and documented as a temporary measure

**Sources**: "Rules Are Not Suggestions" (Sterling Dreyer, Arcade); "MCP: The Integration Protocol" (David Soria Parra, Anthropic); "Securing MCP at Scale" (Peter Smulovics, Morgan Stanley)

---

#### Provide Valid inputSchema for Every Tool — HIGH

**What it is**: Every tool's `inputSchema` must be a valid JSON Schema object with `"type": "object"` and accurate property definitions. Invalid or missing schemas cause unpredictable agent behavior.

**Why it matters**: 19% of all MCP tools (across 218,410 analyzed) have broken input schemas — 8.9% have null or empty schemas, and 10.9% have empty objects missing the required `type: "object"` field. Broken schemas cause agents to guess at parameters, leading to failed tool calls, hallucinated inputs, and wasted tokens.

**What to look for in code**:
- Every tool definition includes a non-empty `inputSchema` with `"type": "object"`
- Required parameters are listed in the `required` array
- Parameter types are explicitly specified (not relying on framework defaults)
- For Python: check that all parameters have explicit type annotations (untyped parameters default to `{"type": "string"}`)
- For TypeScript with Zod: check for discriminated unions, which Zod silently drops to empty objects
- For Go: check for uninitialized struct fields that produce invalid schema output

**Sources**: "Rules Are Not Suggestions" (Sterling Dreyer, Arcade)

---

#### Support PRM Discovery and Return Proper Auth Error Responses — HIGH

**What it is**: Servers using OAuth must expose a Protected Resource Metadata (PRM) endpoint for clients to discover authorization requirements, and must return proper HTTP 401 status codes with `WWW-Authenticate` headers when authentication fails.

**Why it matters**: 67% of servers fail PRM endpoint discovery (SHOULD in MCP V3, MUST in V4). 22% fail to return proper 401 status codes and 24% fail to return the `WWW-Authenticate` header — both MUST requirements in the spec. Without PRM, clients cannot automatically discover how to authenticate. Without proper 401 responses, clients cannot distinguish auth failures from other errors.

**What to look for in code**:
- Server exposes a `/.well-known/oauth-protected-resource` endpoint returning valid PRM metadata
- Authentication failures return HTTP 401 (not 403 or 500)
- 401 responses include a `WWW-Authenticate` header with the appropriate scheme
- PRM metadata correctly references the authorization server

**Sources**: "Rules Are Not Suggestions" (Sterling Dreyer, Arcade)

---

### Tool Design & Context Efficiency

#### Design Tools Around User Intent, Not API Endpoints — CRITICAL

**What it is**: Tools should be designed around what a user wants to accomplish (the outcome), not around the shape of backend APIs. Bundle multi-step workflows into single tools scoped to specific use cases rather than exposing individual CRUD operations.

**Why it matters**: Naive 1:1 mapping of API endpoints to MCP tools forces the LLM to become an integration engineer — managing API plumbing, sequencing calls, and reasoning about system identifiers rather than focusing on user intent. Every additional parameter is a value the LLM must reason about, and every exposed system identifier is a potential exfiltration surface. Apollo demonstrated that design-first tools achieved 70% fewer tool calls and 50% fewer tool tokens with the same output quality. Prompt-based access control bypass rates range from 25% to 92%, making tool boundary design a security concern, not just a UX concern.

**What to look for in code**:
- Tools are named after outcomes (e.g., `process_refund`, `deploy_to_staging`) rather than API operations (e.g., `post_orders`, `patch_deployment`)
- A single tool handles a complete workflow rather than requiring the agent to chain multiple tool calls
- Tools abstract away system identifiers, pagination, and API-specific patterns
- Parameters reflect user-meaningful choices, not backend implementation details
- The tool count is justified by distinct user intents, not by the number of backend endpoints

**Sources**: "When MCP Becomes a Product" (Gautam Baghel & Roy Derks, HashiCorp/IBM); "Enterprise MCP — The Data Plane for Autonomous Agents" (Adam Seligman & Zayne Turner, Workato); "Building Docs That Work for Agents and Humans" (Daniel Abdel Samid, Apollo GraphQL)

---

#### Minimize Per-Tool Context Footprint — CRITICAL

**What it is**: Keep tool descriptions concise, tool counts per server manageable, and tool results minimal. Each tool consumes approximately 500 tokens of context window when loaded, and every additional tool increases the agent's decision space, token costs, and hallucination risk.

**Why it matters**: Loading 80 tools consumes 72% of the context window before the user provides any input. A server with approximately 100 tools consumes roughly 60,000 tokens just for tool schemas. Apollo found that their first-generation MCP server (using generic search/read tools) burned approximately 25,000 tokens per response in wasteful search-read loops, while a redesigned tool backed by semantic chunking and vector retrieval cut tool calls by 70% and tool tokens by 50%. "Context is courtesy" — minimizing the token burden on the model is the single most important quality factor for an MCP server.

**What to look for in code**:
- Tool descriptions are concise and directly explain what the tool does and when to use it
- Each tool's parameter descriptions are brief but clear
- The server does not expose more than approximately 15-20 tools (consider splitting into specialized servers if higher)
- Tools do not return excessively large results — apply server-side filtering, pagination, or summarization
- For documentation or search tools: use semantic chunking and relevance scoring rather than returning full pages
- Server instructions tell the model how to use tools effectively, not just what they are

**Sources**: "MCP: The Integration Protocol" (David Soria Parra, Anthropic); "Building Docs That Work for Agents and Humans" (Daniel Abdel Samid, Apollo GraphQL); "MCP vs. Code Mode vs. Skills" (Nikolay Rodionov, Alpic); "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake)

---

#### Annotate Tools with Behavioral Hints — HIGH

**What it is**: Use MCP tool annotations to declare each tool's behavioral properties: `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`. These annotations help clients make better UX and safety decisions.

**Why it matters**: Clients use these annotations to determine whether to auto-approve tool calls, show confirmation dialogs, or flag destructive operations for human review. Without annotations, clients must treat every tool as potentially destructive, which either degrades the user experience through excessive confirmations or compromises safety by auto-approving everything.

**What to look for in code**:
- Every tool includes an `annotations` object with appropriate hint values
- Read-only tools are annotated with `readOnlyHint: true`
- Tools that modify state are annotated with `destructiveHint: true`
- Idempotent tools are annotated with `idempotentHint: true`
- Annotations accurately reflect the tool's actual behavior

**Sources**: "Human in the Loop, Agent in the Flow" (Harald Kirschner & Connor Peet, Microsoft); "MCP: The Integration Protocol" (David Soria Parra, Anthropic)

---

#### Implement Structured Output Schemas — MEDIUM

**What it is**: Define output schemas for tools so that models can reason about return types and compose tool calls programmatically.

**Why it matters**: Structured outputs enable "code mode" composability — where models write code that chains tool calls together using a REPL or interpreter. Without output schemas, models must parse unstructured text, which reduces reliability and prevents programmatic composition.

**What to look for in code**:
- Tools define output schemas in their tool definitions
- Return types are consistent and predictable across invocations
- Complex return values use structured formats (JSON objects with typed fields) rather than plain text

**Sources**: "MCP: The Integration Protocol" (David Soria Parra, Anthropic)

---

### Security & Access Control

#### Implement Role-Based Access Control at Tool and Data Layers — CRITICAL

**What it is**: Access control must be enforced in server code at both the tool layer (which tools a caller can invoke) and the data layer (what data is returned), based on the caller's authenticated identity and role.

**Why it matters**: Prompts are suggestions, not constraints — instructing an agent to "only use tools X, Y, Z" provides zero enforcement. Prompt-based access control bypass rates range from 25% to 92%. Access to a server should not automatically grant access to all its tools. Each tool should require its own privilege grant, and data returned by tools should be filtered by the caller's role. Without tool-level RBAC, a compromised or prompt-injected agent has access to every tool on every connected server.

**What to look for in code**:
- Tool invocations check the caller's authenticated identity and role before executing
- Different roles have access to different subsets of tools
- Server access does not automatically imply access to all tools
- Access decisions are made in code (middleware, decorators, guards), not in prompt instructions
- Data returned by tools is filtered based on the caller's authorization level
- Access denials produce clear error responses, not silent failures

**Sources**: "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake); "Enterprise MCP — The Data Plane for Autonomous Agents" (Adam Seligman & Zayne Turner, Workato); "Securing MCP at Scale" (Peter Smulovics, Morgan Stanley); "Hooks, Not Hacks" (Ian Molloy & Fred Araujo, IBM Research)

---

#### Specialize Servers by Domain with Least Privilege — HIGH

**What it is**: Each MCP server should be scoped to a specific domain with the minimum access needed for its tools. Avoid building monolithic servers that expose all capabilities through a single endpoint.

**Why it matters**: More tools on a single server means a larger decision space for the agent (more hallucinations), higher token costs, and a wider security blast radius. A sprawled agent with broad access gives prompt injection attacks an exfiltration surface proportional to the number of available tools. Specialization contains failure — a misbehaving agent using a specialized server cannot access tools outside its domain.

**What to look for in code**:
- Server tools are cohesive — they relate to a single domain or use case
- Server credentials and API access are scoped to only what its tools require
- The server does not access systems or data beyond what its declared tools need
- If a server has more than approximately 15-20 tools, consider whether it should be split

**Sources**: "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake); "MCP @ Amazon Scale" (James Hood, AWS); "Securing MCP at Scale" (Peter Smulovics, Morgan Stanley)

---

#### Validate All Tool Inputs Server-Side — HIGH

**What it is**: Treat all tool inputs as untrusted. Validate, sanitize, and bounds-check every parameter server-side before processing, regardless of what the inputSchema declares.

**Why it matters**: Tool inputs come from an LLM, which may be influenced by prompt injection, poisoned context, or hallucination. An agent can be steered through a malicious document, calendar invite, or PR description to call tools with attacker-chosen parameters. MCP servers should be treated as handling input from an insider threat, not a trusted caller. Real-world incidents include agents deleting production databases and being hijacked via poisoned calendar invites.

**What to look for in code**:
- Input validation occurs in server code, not just in schema declarations
- String parameters are sanitized for injection (SQL, command, path traversal)
- Numeric parameters are bounds-checked
- Enum parameters are validated against allowed values
- File paths are validated against allowed directories (use `roots` for scoping)
- The server does not blindly pass tool inputs to backend systems without validation

**Sources**: "Securing MCP at Scale" (Peter Smulovics, Morgan Stanley); "Hooks, Not Hacks" (Ian Molloy & Fred Araujo, IBM Research); "Threat Modeling Authorization in MCP" (Sarah Cecchetti, OpenID Foundation)

---

#### Implement Data-Level Access Controls — HIGH

**What it is**: Apply column-level masking, row-level security, and PII redaction at the data access layer within the server, so that tool responses never contain data the caller is not authorized to see.

**Why it matters**: Read-only access is not a security boundary. An agent with SELECT access can still extract SSNs, salary data, credentials, and PII. Tool output gets summarized back into the model's context, where prompt injection can direct it to exfiltration tools. A sprawled agent with read-only access to HR, finance, infrastructure, and customer data gives attacks 50+ tools worth of data exfiltration paths.

**What to look for in code**:
- Sensitive columns (SSN, salary, PII, credentials) are masked or omitted based on caller role
- Row-level filtering limits results to the caller's authorized scope
- Database queries use parameterized queries with role-based WHERE clauses
- Tool results do not include internal identifiers, system credentials, or infrastructure details
- PII redaction happens before data enters the tool response, not after

**Sources**: "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake); "Hooks, Not Hacks" (Ian Molloy & Fred Araujo, IBM Research)

---

#### Require Distinct Agent Identity — HIGH

**What it is**: Each agent connecting to the server should authenticate as a distinct principal with its own identity, not share a service account or run under the end user's full credentials.

**Why it matters**: When all agents use one service account, auditing becomes impossible — you cannot trace which agent performed which action. Shared credentials also violate least privilege: every agent gets the same access regardless of its actual needs. Running agents under the end user's full identity gives agents more access than they need and breaks the principle that an agent should have a second, narrower level of access control beyond the user's permissions.

**What to look for in code**:
- Server authentication distinguishes between different agent callers
- Audit logs record which specific agent (not just which user) made each tool call
- Server does not accept a single shared token for all callers
- If token delegation is used, downstream tokens are narrowed in scope

**Sources**: "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake); "Threat Modeling Authorization in MCP" (Sarah Cecchetti, OpenID Foundation); "MCP @ Amazon Scale" (James Hood, AWS)

---

### Interaction Patterns

#### Gate Destructive Operations Behind Human Approval — HIGH

**What it is**: Tools that create, update, or delete resources should implement explicit human approval mechanisms before executing the mutation — via elicitations, confirmation prompts, or external approval workflows.

**Why it matters**: AI-initiated actions that change infrastructure state, create tickets, send messages, or modify data carry real-world consequences that may be irreversible. Agents hallucinate, get prompt-injected, and make reasoning errors. Gating write operations behind approval is a trust and safety requirement, not a nice-to-have.

**What to look for in code**:
- Write, update, and delete tools include a confirmation step before execution
- Tools are annotated with `destructiveHint: true` where appropriate
- The server supports elicitation-based confirmation for destructive actions
- Alternatively, the server returns a proposed action for client-side approval before execution
- Tools that bypass approval are documented and justified

**Conflicting Evidence**: The Threat Modeling Authorization session (Sarah Cecchetti, OpenID Foundation) proposed removing elicitation entirely from the spec, arguing MCP should be "a one-way street" where servers never prompt users — because elicitation can be weaponized for phishing (servers requesting passwords, MFA codes, or PII with the credibility of an AI assistant). The Human in the Loop session (Microsoft) and Duolingo's implementation promote elicitations as the mechanism for confirmation. This tension is unresolved in the spec.

**Sources**: "Duolingo's AI Slack Bot" (Aaron Wang, Duolingo); "Human in the Loop, Agent in the Flow" (Harald Kirschner & Connor Peet, Microsoft); "Threat Modeling Authorization in MCP" (Sarah Cecchetti, OpenID Foundation)

---

#### Use Elicitations for Structured User Input — MEDIUM

**What it is**: Use MCP elicitations (in-band form inputs) to gather structured configuration, selection, or authentication data from users rather than relying on the LLM to extract this information from freeform conversation.

**Why it matters**: Elicitations provide structured, validated input directly from the user, bypassing the LLM's interpretation. This is more reliable for configuration parameters, enum selections, and authentication handoffs. Four design patterns apply: configuration (settings at connection time), confirmation (gating destructive actions), selection (enums instead of guesses), and auth handoff (URL mode for OAuth redirects).

**What to look for in code**:
- Server uses `elicitation/create` with JSON Schema for structured inputs
- Elicitation schemas define proper validation (required fields, enums, formats)
- Server checks client capability for elicitation support and degrades gracefully to text fallback
- URL-mode elicitations are used for OAuth flows (credentials go to provider, never to MCP server)

**Conflicting Evidence**: See note under "Gate Destructive Operations" — the Threat Modeling session proposes eliminating elicitation entirely due to phishing risk.

**Sources**: "Human in the Loop, Agent in the Flow" (Harald Kirschner & Connor Peet, Microsoft); "Threat Modeling Authorization in MCP" (Sarah Cecchetti, OpenID Foundation)

---

#### Implement Tasks for Long-Running Operations — MEDIUM

**What it is**: For operations that take more than a few seconds, return a Task ID immediately and emit real-time status updates rather than blocking the connection.

**Why it matters**: Long-running operations (deployments, data processing, report generation) can block the agent-server connection and fail silently on timeout. The Tasks primitive supports a five-state machine (working, input_required, completed, failed, cancelled) and enables human checkpoints mid-operation via the `input_required` state — which most implementations miss.

**What to look for in code**:
- Long-running operations return a `CreateTaskResult` with a task ID immediately
- Server emits `notifications/tasks/status` updates during execution
- Task results persist and survive client disconnections
- The `input_required` state is implemented for operations needing human checkpoints
- Tasks have timeout and expiry policies

**Sources**: "Human in the Loop, Agent in the Flow" (Harald Kirschner & Connor Peet, Microsoft); "MCP: The Integration Protocol" (David Soria Parra, Anthropic)

---

#### Use MCP Apps Result Fields Correctly — MEDIUM

**What it is**: When implementing MCP Apps (interactive UI responses), use the three result fields — `content`, `structuredContent`, and `_meta` — according to their intended semantics.

**Why it matters**: Incorrect field usage leads to data leaking to the model that should be hidden (wasting tokens and creating security risk), or model-needed context being suppressed (breaking downstream reasoning).

**What to look for in code**:
- `content`: Contains explanations for the model about what the app already displayed to the user
- `structuredContent`: Contains typed data that the model may need for reasoning
- `_meta`: Contains internal IDs, routing info, and implementation details that the model should never see
- App-only tools are hidden from the model using `Tool._meta.ui.visibility = ["app"]`
- `updateModelContext` is used to provide important context (screenshots, selections) to the model for the next turn

**Sources**: "MCP Apps Best Practices" (Olivier Chafik & Anton Pidkuiko, Anthropic)

---

#### Implement CSP and CORS for MCP Apps — MEDIUM

**What it is**: MCP Apps that access external data must declare Content Security Policy (CSP) and CORS domains in their metadata to control what resources the app can load and connect to.

**Why it matters**: Without CSP/CORS restrictions, MCP Apps can load arbitrary external resources, creating data exfiltration vectors and violating the principle of least privilege for network access.

**What to look for in code**:
- Non-authenticated data access uses `fetch()` or WebSocket with CSP/CORS controls
- CSP allowlists are declared in `_meta.ui.csp.resourceDomains` and `_meta.ui.csp.connectDomains`
- `ui.domain` is set for CORS restriction to a known origin
- Authenticated data access uses `App.callServerTool()` to reuse auth infrastructure rather than direct API calls

**Sources**: "MCP Apps Best Practices" (Olivier Chafik & Anton Pidkuiko, Anthropic)

---

### Error Handling & Resilience

#### Return Machine-Readable Recovery Contracts — HIGH

**What it is**: Every tool invocation should return a structured response that includes the outcome, a machine-readable error code, a recoverability signal (retry, escalate, or fail), and a suggested next action.

**Why it matters**: Ambiguous error responses trigger retry storms. When a tool returns a vague error like "operation failed," the LLM cannot determine whether to retry, try a different approach, or escalate to the user. This wastes tokens, amplifies API calls, and can cause cascading failures. Clear recovery contracts let agents make informed decisions about what to do next.

**What to look for in code**:
- Error responses include a machine-readable error code (not just human-readable messages)
- Responses include a recoverability signal: `retry` (transient failure), `escalate` (needs human), or `fail` (permanent)
- When applicable, responses suggest a next action
- Success responses include a clear outcome field
- Error responses do not expose internal stack traces or system details

**Sources**: "Enterprise MCP — The Data Plane for Autonomous Agents" (Adam Seligman & Zayne Turner, Workato)

---

#### Design for Safe Retries by Probabilistic Callers — HIGH

**What it is**: Assume that the caller (an LLM) will retry failed operations by generating a new request that is semantically equivalent but structurally different. Traditional idempotency mechanisms (idempotency keys) do not work because the LLM generates fresh parameters on each attempt.

**Why it matters**: When an LLM retries a "create user" operation, it will not send the same JSON payload with the same idempotency token — it will generate a structurally different request with the same semantic intent. If the server cannot distinguish a retry from a genuinely new request, it may create duplicate records, trigger duplicate workflows, or apply mutations twice. This is especially critical for infrastructure automation where duplicate operations have real consequences.

**What to look for in code**:
- Mutation tools have server-side deduplication logic (e.g., check for existing matching records before creating)
- The server can detect semantically equivalent requests even if parameters differ in structure
- Tool results clearly indicate whether the operation was performed or was already completed
- For operations where duplicates are dangerous, the server uses natural keys or business logic constraints rather than relying on caller-provided idempotency tokens

**Sources**: "Enterprise MCP — The Data Plane for Autonomous Agents" (Adam Seligman & Zayne Turner, Workato)

---

### Observability

#### Build Structural Observability into Server Code — HIGH

**What it is**: Log every tool invocation with full parameters, caller identity, timestamps, data flows, and outcomes as a structural property of the server, not an afterthought.

**Why it matters**: Agents have a larger blast radius than human users — they can make more calls, faster, across more tools. Without observability, you cannot trace what agents are doing, detect anomalies, or reconstruct incidents. Observability should be an emergent property of correct architecture — produced at invocation time by the server performing the operation — not a separate system you bolt on later. LLMs are black boxes; observability must be enforced in the deterministic layer (the server).

**What to look for in code**:
- Every tool call is logged with: tool name, parameters, caller identity, timestamp, outcome
- Sensitive parameters are redacted in logs (not omitted entirely — the call itself should still be logged)
- Logs are structured (JSON) rather than freeform text
- The server implements or integrates with tracing (OpenTelemetry or equivalent)
- Audit trails are immutable and include enough context to reconstruct what happened

**Sources**: "Enterprise MCP — The Data Plane for Autonomous Agents" (Adam Seligman & Zayne Turner, Workato); "Operating MCP at Enterprise Scale" (Meghana Somasundara & Rush Tehrani, Uber); "Securing MCP at Scale" (Peter Smulovics, Morgan Stanley)

---

### Supply Chain Security

#### Verify Package Integrity and Minimize Attack Surface — HIGH

**What it is**: MCP servers should use minimal dependencies, pin versions, scan for vulnerabilities, and be packaged with verifiable provenance (signing, SBOMs).

**Why it matters**: Real-world supply chain attacks have already hit the MCP ecosystem. The postmark-mcp package (approximately 1,600 downloads) exfiltrated all emails via BCC after working flawlessly for 15 versions. The mcp-remote package (437K+ downloads, CVSS 9.6) had command injection. The LiteLLM compromise reached MCP servers as a transitive dependency through a Cursor MCP plugin. The Axios RAT (100M weekly downloads) used a self-erasing phantom dependency. Every dependency is an attack surface.

**What to look for in code**:
- Dependencies are pinned to specific versions (not ranges)
- `package.json` or `requirements.txt` is auditable with no unnecessary dependencies
- npm post-install scripts are disabled or audited (`ignore-scripts` setting)
- Base images for containerized servers are minimal (distroless or slim images rather than full OS images)
- SBOM (Software Bill of Materials) is generated as part of the build process
- Package integrity is verifiable via checksums or code signing

**Sources**: "The Boring Attack That Will Actually Get You" (Craig Jellick, Obot AI); "OCI Images as MCP Packaging" (Juan Antonio Osorio, Stacklok)

---

## Anti-Patterns

### Tool Design

#### 1:1 API Endpoint-to-Tool Mapping — CRITICAL

**What it is**: Exposing each backend API endpoint as a separate MCP tool, creating a tool surface that mirrors the API rather than serving user intent.

**Why it's a problem**: This forces the LLM to become an integration engineer — managing pagination, sequencing CRUD operations, handling API-specific identifiers, and reasoning about implementation details instead of user outcomes. Every unnecessary parameter widens the attack surface and adds reasoning burden. Every extra parameter adds cost and unnecessarily widens the attack surface. A "deploy application" workflow exposed as separate "create job template," "set inventory," "launch job," "check status" tools requires the agent to understand API plumbing that should be hidden.

**What it looks like in code**:
- Tool names mirror HTTP methods and resource paths (e.g., `post_users`, `get_orders_by_id`, `patch_deployment`)
- Tools expose internal system identifiers, pagination tokens, or API-specific parameters
- Multiple tools exist for what is conceptually a single user workflow
- Tool parameters include implementation details the user would never specify (e.g., `content-type`, `api-version`)

**What to do instead**: Design tools around outcomes. Bundle multi-step workflows into single tools. Use names like `process_refund`, `deploy_to_staging`, `onboard_employee`. Abstract away pagination, sequencing, and system identifiers.

**Sources**: "When MCP Becomes a Product" (Gautam Baghel & Roy Derks, HashiCorp/IBM); "Enterprise MCP — The Data Plane for Autonomous Agents" (Adam Seligman & Zayne Turner, Workato)

---

#### God Server / Unconstrained Tool Sprawl — CRITICAL

**What it is**: Building a single MCP server that exposes every available capability, resulting in dozens or hundreds of tools on one server.

**Why it's a problem**: More tools equals less predictable agent behavior. Each additional tool increases the context window consumption (approximately 500 tokens per tool), token costs, hallucination risk, and security blast radius. A sprawled agent with tools from multiple domains gives prompt injection attacks an exfiltration surface proportional to the number of available tools. Loading 80 tools consumes 72% of the context window before the user provides input.

**What it looks like in code**:
- A single server file defines 30+ tools spanning multiple unrelated domains
- Tools cover both read and write operations across different backend systems
- One set of credentials grants access to everything
- Adding new functionality means adding more tools to the same server

**What to do instead**: Split into domain-specific servers with cohesive tool sets. Each server should have its own credentials scoped to its domain. Aim for fewer than approximately 15-20 tools per server. Group tools by the use cases they serve, not the systems they access.

**Sources**: "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake); "MCP @ Amazon Scale" (James Hood, AWS); "Building Docs That Work for Agents and Humans" (Daniel Abdel Samid, Apollo GraphQL)

---

### Security

#### Prompt-Based Access Control — CRITICAL

**What it is**: Relying on system prompt instructions like "only use tools X, Y, Z" or "do not access sensitive data" to enforce security policies.

**Why it's a problem**: Prompts are suggestions, not constraints. They provide zero technical enforcement. Research shows prompt-based access control bypass rates of 25% to 92%. A prompt telling an agent to "only use read-only tools" can be overridden by prompt injection from a malicious document, email, or calendar invite. Worse, prompt-based controls create a false sense of security — teams believe they have access control when they have none. Prompt-based access control is worse than no access control because it masks the absence of real enforcement.

**What it looks like in code**:
- Access restrictions exist only in system prompts or prompt templates, not in server-side code
- No middleware, decorators, or guards check caller permissions before tool execution
- The server exposes all tools to all callers regardless of identity or role
- Security documentation references prompt instructions as access controls

**What to do instead**: Implement RBAC in server code. Use authentication middleware to validate caller identity. Gate tool access on roles and permissions. Enforce data access controls at the query layer. Prompts can guide the agent's behavior, but security enforcement must be in code.

**Sources**: "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake); "Enterprise MCP — The Data Plane for Autonomous Agents" (Adam Seligman & Zayne Turner, Workato); "Hooks, Not Hacks" (Ian Molloy & Fred Araujo, IBM Research)

---

#### Shared Service Account Credentials — HIGH

**What it is**: All agents authenticate to the MCP server using the same service account or shared token, with no way to distinguish which agent performed which action.

**Why it's a problem**: Shared credentials make auditing impossible — you cannot trace actions back to specific agents. They violate least privilege because every agent gets identical access regardless of its actual needs. If one agent's token is compromised, all agents are compromised.

**What it looks like in code**:
- Server authentication accepts a single hardcoded token or API key
- No mechanism exists to distinguish between different callers
- Audit logs show a generic service account name for all operations
- Token validation checks only "is this the right token?" not "who is calling?"

**What to do instead**: Issue distinct credentials per agent. Implement token-based authentication that identifies the specific caller. Log the agent identity on every tool call. Scope credentials to each agent's required access level.

**Sources**: "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake)

---

#### Treating Read-Only Access as a Security Boundary — HIGH

**What it is**: Assuming that restricting an agent to read-only tools prevents security breaches.

**Why it's a problem**: An agent with read access can still SELECT secrets, PII, credentials, salary data, and any other sensitive information in the database. Tool output gets summarized back into the model's context, where prompt injection can direct it to exfiltration vectors (external APIs, email, Slack). A sprawled agent with read-only access to HR, finance, infrastructure, and customer databases gives attacks 50+ tools worth of data exfiltration paths.

**What it looks like in code**:
- Server implements write restrictions but no data-level access controls
- Database queries return all columns without masking sensitive fields
- Tool results include PII, credentials, or internal system details
- Security review considers the server "safe" because it only does reads

**What to do instead**: Implement column-level masking for sensitive data. Apply row-level security to limit query scope. Redact PII before it enters tool responses. Treat data access controls as a separate, required security layer on top of read/write restrictions.

**Sources**: "Declarative MCP Servers" (Josh Reini & Reetika Roy, Snowflake)

---

### Spec Compliance

#### Framework-Silent Schema Failures — HIGH

**What it is**: Relying on framework defaults for tool schema generation without verifying the output, resulting in invalid or misleading schemas that pass silently.

**Why it's a problem**: Each major MCP SDK framework has known silent failure modes: Python defaults untyped parameters to `{"type": "string"}`; TypeScript's Zod silently drops discriminated unions to empty objects; Go's uninitialized struct fields produce invalid schema output. 19% of all MCP tools have broken schemas due to these framework behaviors, and developers typically don't discover the problem because frameworks don't warn.

**What it looks like in code**:
- Tool parameters lack explicit type annotations (relying on framework inference)
- Complex types (unions, discriminated unions, optional fields) are used without verifying the generated schema
- No tests validate the actual JSON Schema output of tool definitions
- The generated schema has not been inspected using validation tools

**What to do instead**: Explicitly type all parameters. Validate the generated `inputSchema` against the JSON Schema specification. Add tests that check the actual schema output. Use validation tools (mcpdebugger.dev for live testing, toolbench.arcade.dev for static analysis) to verify compliance.

**Sources**: "Rules Are Not Suggestions" (Sterling Dreyer, Arcade)

---

### Error Handling

#### Ambiguous or Missing Error Recovery Signals — HIGH

**What it is**: Returning vague, unstructured error messages without indicating whether the error is transient (retry), permanent (fail), or requires human intervention (escalate).

**Why it's a problem**: When a tool returns "operation failed" or a raw exception message, the LLM cannot determine the correct recovery action. This triggers retry storms (wasting tokens and API calls), cascading failures (when the LLM tries creative workarounds), or silent abandonment (when the LLM gives up without informing the user). Ambiguous errors compound because each retry generates a fresh, structurally different request.

**What it looks like in code**:
- Error responses contain only human-readable strings with no error codes
- No distinction between transient and permanent errors
- Raw exceptions or stack traces are returned to the caller
- Error responses lack suggested next actions

**What to do instead**: Return structured error responses with a machine-readable error code, a recoverability signal (`retry`, `escalate`, or `fail`), and a suggested next action. Keep human-readable messages for context but make the recovery path machine-parseable.

**Sources**: "Enterprise MCP — The Data Plane for Autonomous Agents" (Adam Seligman & Zayne Turner, Workato)

---

## Summary

This document contains **22 recommended practices** and **8 anti-patterns** across seven categories:

| Importance | Practices | Anti-Patterns | Total |
|------------|-----------|---------------|-------|
| CRITICAL   | 5         | 3             | 8     |
| HIGH       | 12        | 5             | 17    |
| MEDIUM     | 5         | 0             | 5     |
| **Total**  | **22**    | **8**         | **30** |

**Key themes across all sources**:

1. **Spec compliance has hard numbers**: 94% of servers fail at least one compliance check, 19% have broken schemas, and 80%+ fail Origin header validation. These are measurable, fixable issues.

2. **Security cannot be enforced through prompts**: This is the strongest consensus finding across all sessions. RBAC must be implemented in code. Prompt-based access control bypass rates reach 92%.

3. **Tool design directly impacts security, cost, and accuracy**: Intent-based design reduces tool calls by 70%, cuts token usage by 50%, and shrinks the attack surface. This is not just a UX concern.

4. **Context is courtesy**: Every token matters. Minimizing tool footprint, returning filtered results, and keeping descriptions concise improves agent performance while reducing costs.

5. **Supply chain attacks are active and real**: Multiple incidents in the past 7 months have compromised MCP packages in the wild. Package integrity is not theoretical.

6. **Agents need distinct identities and narrowed access**: The industry is converging on agents as first-class identities with access controlled at four layers: agent, server, tool, and data.

**When prioritizing a review**, start with the 8 CRITICAL items: Origin/DNS rebinding validation, OAuth 2.1, intent-based tool design, context footprint, RBAC, and the three critical anti-patterns (1:1 API mapping, God server, prompt-based access control). These have the strongest evidence, highest consensus, and greatest impact.

---

Anthropic | Claude Opus 4.6 | Apr-23-2026 GMT
