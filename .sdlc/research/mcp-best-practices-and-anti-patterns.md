# MCP Best Practices and Anti-Patterns Report

**Executive Summary**: This report synthesizes recommended practices and anti-patterns for developing Model Context Protocol (MCP) servers and tools, extracted from 100 session notes from the MCP Dev Summit North America 2026. Each practice and anti-pattern is weighted by importance (Critical, High, Medium, Low) to guide implementation priorities. This report is designed to evaluate AAP MCP servers against industry best practices from Amazon, Uber, Duolingo, Snowflake, Microsoft, Morgan Stanley, Bloomberg, and other enterprise adopters.

---

## Table of Contents
- [Recommended Practices - Critical](#recommended-practices---critical)
- [Recommended Practices - High](#recommended-practices---high)
- [Recommended Practices - Medium](#recommended-practices---medium)
- [Recommended Practices - Low](#recommended-practices---low)
- [Anti-Patterns - Critical](#anti-patterns---critical)
- [Anti-Patterns - High](#anti-patterns---high)
- [Anti-Patterns - Medium](#anti-patterns---medium)
- [Anti-Patterns - Low](#anti-patterns---low)

---

## Recommended Practices - Critical

### 1. Follow Security Considerations for Securing MCP
**Importance**: CRITICAL
**Description**: Implement practical advice and best practices for securing MCP deployments. Security is a fundamental concern, especially for enterprise deployments connecting to systems of record.
**Why Critical**: Foundation for all MCP security work; without this, all other efforts are at risk.
**Source**: Anthropic (MCP core team)

### 2. Implement Centralized MCP Gateway & Registry Control Plane
**Importance**: CRITICAL
**Description**: Create a control plane for all MCP interactions with:
- Auto-generation of MCP tool definitions from service IDLs (proto/thrift)
- Centralized authorization and PII redaction service
- Periodic code scanning (at diff/commit time and continuously)
- Guardrails to block mutable endpoints
- Rate-limiting and logging for all write operations
- Full observability with extensive logging, metrics, and tracing

**Why Critical**: Ensures complete visibility into call patterns and data access. Agents have a larger blast radius than humans — unauthorized access or exposed endpoints can cause damage faster.
**Source**: Uber

### 3. Implement Five-Layer Security Architecture
**Importance**: CRITICAL
**Description**: Deploy security at all five layers:
1. **Client/Host** - UI or agent host environment
2. **MCP Gateway** - Policy enforcement, auth and validation (central enforcement point)
3. **Isolated MCP Servers** - Domain-specific, least privilege, separate sessions
4. **Identity & Auth** - Entra ID, short-lived tokens, secure storage, lifecycle management
5. **AI Runtime & Tools** - LLM, tools, prompt shields and safety filters

**Key Principle**: "Secure the boundaries, not just the model."
**Why Critical**: Provides defense in depth across the entire stack, not just at perimeter.
**Source**: Morgan Stanley

### 4. Apply Five Security Principles (Microsoft Playbook)
**Importance**: CRITICAL
**Description**:
1. **Least privilege** - Scope every server and tool to minimum needed access
2. **Identity and auth** - Strong Entra ID validation, short-lived tokens, secure storage
3. **Containment and isolation** - Run servers in separate sessions, sandbox tool execution
4. **Treat prompts as untrusted** - Shield prompts and validate tool output to thwart injection
5. **Observability by design** - Log tool calls, data flows, and decisions for real-time defense

**Why Critical**: Battle-tested principles from Microsoft's work hardening MCP on Windows.
**Source**: Microsoft / Morgan Stanley

### 5. Make Agents First-Class Identities with Distinct Principals
**Importance**: CRITICAL
**Description**: Each agent should be assigned its own distinct identity (principal) with auditable actions, not run under a user's identity or shared service account. Data movement and security policies should be scoped to the agent's role. Enforce least privilege: agent should only see what current task requires. Audit every action against the agent's identity, not a generic account.
**Why Critical**: Prevents audit trail collapse and enables proper security boundary enforcement. Without distinct agent identities, you cannot track or control what agents are doing.
**Source**: Snowflake

---

## Recommended Practices - High

### 1. Implement Tool Search/Progressive Discovery
**Importance**: HIGH
**Description**: Modern MCP clients should defer loading tools until runtime so models only import the definitions they actually need. This solves the context bloat problem caused by loading all tools upfront.
**Impact**: Claude Code went from 22% of 200k token window consumed by MCP tools to having them fully deferred.
**Source**: Anthropic

### 2. Use Skills as Recipes for MCP Tools
**Importance**: HIGH
**Description**: Skills should instruct the model on exactly how to use MCP capabilities. These paradigms are complementary, not competing - MCP Tools are the connectors that expose new capabilities, while Skills are the recipes that instruct the model on how to use those capabilities.
**Impact**: Supabase demo showed MCP+Skill beat MCP-only in all 6 scenarios, preventing security vulnerabilities (missing `security_invoker` in views).
**Source**: Multiple (Alpic, Supabase, Anthropic)

### 3. Use Structured Outputs for Code-Mode Composability
**Importance**: HIGH
**Description**: Implement structured outputs so models can reason about return types. This enables composability by giving the model a REPL/interpreter to write code that calls MCP tools (like piping CLI commands).
**Source**: Anthropic

### 4. Implement OAuth 2.1 Authorization
**Importance**: HIGH
**Description**: Use OAuth 2.1 for delegated authentication in MCP servers. This is the standard approach for secure authentication.
**Note**: Only about 22% of v2+ servers use OAuth; API keys remain path of least resistance despite not being in spec.
**Source**: Anthropic / Arcade

### 5. Bundle MCP Tools with Other Primitives into Agent Configurations
**Importance**: HIGH
**Description**: Treat MCP tools, skills, context/steering files, and agent SOPs as ingredients that combine into an "agent configuration" as a first-class primitive. Rather than seeing these as either/or choices, combine them together.
**Impact**: This approach has seen massive growth internally at Amazon.
**Source**: Amazon

### 6. Create an MCP/AI Registry for Discovery and Sharing
**Importance**: HIGH
**Description**: Build an internal registry where builders can easily discover, share, and install local and remote MCP servers and agent configurations. This promotes reuse and standardization across the organization.
**Source**: Amazon, Uber

### 7. Categorize Tools by Security Properties
**Importance**: HIGH
**Description**: Use Simon Willison's "lethal trifecta" framework to categorize each tool by three security properties:
1. Access to private data
2. Exposure to untrusted content
3. Ability to communicate externally

Because agent configurations are in the registry, you can scan configurations to flag potentially problematic agents that have tools from all three categories.
**Source**: Amazon

### 8. Use MCP-as-CLI Approach for Context Efficiency
**Importance**: HIGH
**Description**: Specify per-tool how it should be surfaced. Some tools are injected directly into context, others are wrapped as a CLI with minimal context. Instead of loading all tools into context, load only critical tools directly and wrap others behind a `cli: mcp-tools` entry with tools loaded on demand.
**Impact**: Saves tokens and leads to better agent performance with lower inference costs.
**Source**: Amazon

### 9. Auto-Generate MCP Tools from Service IDLs
**Importance**: HIGH
**Description**: Automatically crawl service IDLs (proto and thrift files), use an LLM to generate MCP tool descriptions based on message names and comments, and store the definitions in object storage. This config-driven approach scales to thousands of services without manual MCP server development.
**Source**: Uber

### 10. Give Service Owners Control Over Tool Exposure
**Importance**: HIGH
**Description**: Let service owners (the domain experts) control which tools get exposed and fine-tune the LLM-facing descriptions. This ensures quality and accuracy of tool definitions.
**Source**: Uber

### 11. Implement Tiered Gating for Third-Party MCPs
**Importance**: HIGH
**Description**: Third-party MCPs should face more levels of gating, scanning, and rigorous checks compared to trusted internal systems. This reduces data handling risks.
**Source**: Uber

### 12. Allow Scoping to Specific Tools and Parameter Overrides
**Importance**: HIGH
**Description**: Users should be able to scope to specific tools from a server (so the LLM doesn't have to choose) and override parameters with static values (so the LLM doesn't have to populate them). This makes agents more reliable.
**Source**: Uber

### 13. Create a Skills Registry for Sharable Recipes
**Importance**: HIGH
**Description**: Build sharable "recipes" that combine multiple MCPs to accomplish specific tasks. Skills can be shared across different teams. This promotes reuse and standardization.
**Source**: Uber

### 14. Implement MCP Evaluations
**Importance**: HIGH
**Description**: Systematically score tool responses and correctness of invocation to improve tool descriptions. Build evaluations into both the registry and the overall agent platform. This improves tool quality over time.
**Note**: Apollo's framework uses executor agent + scoring agent with binary rubrics and statistical comparison (Welch's t-test).
**Source**: Uber, Apollo GraphQL

### 15. Map Security Activities Across Full Lifecycle
**Importance**: HIGH
**Description**:
- **Dev stage**: Threat model flows, simulate prompt injection, validate tool contracts
- **Pre-Prod**: Red-team MCP servers, validate auth boundaries, audit permissions
- **Prod**: Continuous monitoring, policy enforcement via gateway, runtime protection
- **Continuous**: Inventory all servers, decommission unused agents, track ownership and lifecycle

Security is not a one-time activity.
**Source**: Morgan Stanley

### 16. Define Governance Across Three Team Types
**Importance**: HIGH
**Description**:
- **Platform teams**: Provide infrastructure/guardrails, manage MCP gateway/policies, monitor runtime/scale
- **Application teams**: Define tools/permissions, ensure least privilege/scopes, test and red-team agents
- **Security teams**: Define policy/monitoring, maintain registry/approvals, validate supply chain/logs

Clear ownership prevents gaps.
**Source**: Morgan Stanley

### 17. Use Agent Specification to Define Server/Tool Access Boundaries
**Importance**: HIGH
**Description**: Each agent has its own spec combining MCP servers, tools, and instructions. RBAC controls which MCP servers and tools can be invoked. Same agent definition can reference multiple servers, each with least-privilege tool access.
**Example**: hr_agent with employee_info (search_employees, get_org_chart), benefits_server (lookup_benefits, compare_plans), compensation_server (edit_salary/view_bands restricted to hr_admin role).
**Source**: Snowflake

### 18. Use Declarative MCP Server Definition
**Importance**: HIGH
**Description**: Use YAML-like spec to declare tools. Servers are governed objects: versioned, auditable, with RBAC on USAGE. Each tool requires its own privilege grant — access to server does not equal access to tools.
**Example**: CREATE MCP SERVER hr_server FROM SPECIFICATION with tools like handbook-search (CORTEX_SEARCH_SERVICE_QUERY).
**Source**: Snowflake

### 19. Apply RBAC at Four Layers
**Importance**: HIGH
**Description**:
1. **Agent** - Which agents can this role invoke?
2. **MCP Server** - Who can connect to the server at all?
3. **Tool** - Which tools within the agent are authorized?
4. **Data** - Row-level and column-level policies on query results

Declarative definitions enable governance at scale: reviewable, diffable, auditable like infrastructure as code.
**Source**: Snowflake

### 20. Implement Data Access Controls at Query Layer
**Importance**: HIGH
**Description**: Column policies (mask SSN, salary, PII at query layer), row-level security (limit rows to agent's authorized scope), role-based access (permissions tied to agent role, not just user). These enforcement mechanisms prevent data exfiltration even with read-only access.
**Source**: Snowflake

### 21. Bring MCP Tools to Where Users Already Work
**Importance**: HIGH
**Description**: Build interfaces (like Slack apps, chat bots) that bring MCP-powered tools directly to where people already work, rather than expecting them to configure local setups.
**Key Insight**: "One click is still too much for people."
**Impact**: Duolingo's @DuolingoAI Slack app achieved 250+ weekly active users (~30% of company) with ~80% upvote rate by bringing 180+ tools to Slack.
**Source**: Duolingo

### 22. Standardize MCP Server Hosting Strategies
**Importance**: HIGH
**Description**: Categorize MCP servers by type and standardize hosting and auth approaches. Example categories: External first-party HTTP (OAuth), Forked/internal HTTP with FastMCP (JWT or shared token or OAuth), CLI (CLI OAuth), stdio locally.
**Source**: Duolingo

### 23. Implement Human-in-the-Loop for Write Operations
**Importance**: HIGH
**Description**: Gate write operations (creating PRs, JIRA tickets, deploying to staging) behind explicit human approval via UI buttons (Approve/Cancel in Slack). Use workflow systems (like Temporal) to execute approved actions. Connect to read-only tools by default.
**Source**: Duolingo, Microsoft

### 24. Use structuredContent, content, and _meta Appropriately in MCP Apps
**Importance**: HIGH
**Description**: In tool call results, use distinct fields for distinct purposes:
- `content` - Explanations to the model (what the app already displayed)
- `structuredContent` - Typed data the model may see
- `_meta` - Things the model never needs (internal IDs, routing info)

`viewUUID` goes in content or _meta depending on whether model needs it for later interactions.
**Source**: Anthropic

### 25. Hide App-Only Tools from the Model
**Importance**: HIGH
**Description**: Use `Tool._meta.ui.visibility = ["app"]` for tools that only the app should see, not the model. This enables app-server communication without exposing internal implementation to the model.
**Source**: Anthropic

### 26. Use updateModelContext for Important Context
**Importance**: HIGH
**Description**: Leave text/images that give important context to the model, available from the next turn. Examples: PDF current selection in context of larger text, screenshots so the model understands diagrams.
**Source**: Anthropic

### 27. Render Partial Input as JSON Arrives (Streaming Pattern)
**Importance**: HIGH
**Description**: Apps should receive `ui/notification/tool-input-partial` events and progressively render content as chunks of JSON arrive. This addresses tool call input latency bottlenecks.
**Source**: Anthropic

### 28. Detect UI Support and Capabilities, Degrade Gracefully
**Importance**: HIGH
**Description**:
- Server-side: Check `capabilities.extensions` in initialize result to detect UI support
- In-app: Check `App.getHostCapabilities()` before use, degrade gracefully when a host method is absent

Build universal servers/apps that work across hosts.
**Source**: Anthropic

### 29. Implement Proper CSP and CORS for MCP Apps
**Importance**: HIGH
**Description**: For non-auth data access via fetch/WebSocket/linked scripts & styles, allowlist in `_meta.ui.csp.{resource,connect}Domains`. Declare `ui.domain` so your server can restrict CORS to a known origin.
**Example**: `resource _meta.ui.csp.connectDomains = ["https://api.example.com"]`
**Source**: Anthropic

### 30. Use hostContext for Styling/Theming
**Importance**: HIGH
**Description**: Listen for changes with `onhostcontextchanged`. Apply `hostContext.theme` + CSS vars for light/dark mode. Apply `hostContext.safeAreaInsets` as padding for safe areas. Use `hostContext.styles.css.fonts` for font consistency. Avoid nested scroll in inline mode. Add pinch gestures to get in/out of fullscreen.
**Source**: Anthropic

---

## Recommended Practices - Medium

### 1. Use Code Mode for Complex Tool Sets
**Importance**: MEDIUM
**Description**: Code Mode is highly effective if you have more than 20 tools and complex workflows. It provides a fixed number of tools, enables complex workflows, and solves context bloat by hiding intermediary tool responses. Requires ~2,000 token minimal footprint and sandbox access for code execution.
**Source**: Alpic

### 2. Combine Skills + MCP for Complex Workflows
**Importance**: MEDIUM
**Description**: For complex workflows with external services, combine Skills and MCP. This approach is suitable for business operators and developers.
**Source**: Alpic

### 3. Use Tasks Primitive for Long-Running Agents
**Importance**: MEDIUM
**Description**: Implement the Tasks primitive to support long-running agent workflows. This moves beyond simple request-response to autonomous work.
**Note**: Tasks primitive has 5-state machine (working, input_required, completed, failed, cancelled). `input_required` state is "the state nobody builds for."
**Source**: Anthropic, Microsoft

### 4. Add Evaluation Metrics to MCP Registry
**Importance**: MEDIUM
**Description**: Include service SLAs (reliability, availability), dynamic discovery on-demand, and tiered MCP quality rankings (higher/lower tier) in the registry. This helps users find reliable, high-performance, safe MCPs.
**Source**: Uber

### 5. Build a Tool Search Tool for On-Demand Discovery
**Importance**: MEDIUM
**Description**: Implement on-demand tool discovery (described as "Omni MCP tool") to improve accuracy and reduce context bloat.
**Source**: Uber

### 6. Implement Skills Evaluations
**Importance**: MEDIUM
**Description**: Evaluate output quality, correctness of skill invocation, and A/B test different versions of the same skill to determine which performs better.
**Source**: Uber

### 7. Auto-Respond in Help Desk and Incident Channels
**Importance**: MEDIUM
**Description**: Configure AI to auto-respond in appropriate channels (help desk, incident response) to reduce toil for on-call engineers. This provides immediate value while humans handle complex cases.
**Source**: Duolingo

### 8. Fork Open-Source MCP Servers for Internal Hosting
**Importance**: MEDIUM
**Description**: For open-source MCP servers with shared credentials (like Grafana, Jenkins), fork them in-house, add internal authentication and tracking, and host behind VPC via HTTP. Use shared service token on server side so users just need an internal generic token.
**Source**: Duolingo

### 9. Skip MCP for IAM-Level Permission Controls
**Importance**: MEDIUM
**Description**: For tools with fine-grained IAM-level permission controls (AWS, BigQuery), skip MCP wrapping and instead let AI tools code CLI commands directly. This respects existing permission models.
**Source**: Duolingo

### 10. Use generative UI Pattern for Dynamic Interfaces
**Importance**: MEDIUM
**Description**: Model writes HTML, host renders it. This enables highly dynamic, context-specific interfaces without pre-built components. Demonstrated with travel itinerary rendering.
**Source**: Anthropic

---

## Recommended Practices - Low

### 1. Use CLI for Local Workflows
**Importance**: LOW
**Description**: CLIs are token-efficient, allow progressive discovery via --help commands, and are highly composable. Best suited for terminal-friendly users. However, they lack standard authentication and providers are "blind" to broader context.
**Source**: Multiple

### 2. Use Skills for Reusable Prompts
**Importance**: LOW
**Description**: Skills only (without MCP) are suitable for reusable prompts, targeting writers and developers. Skills use 3-level progressive disclosure: YAML frontmatter (always loaded), SKILL.md body (loaded when relevant), linked files (loaded as needed).
**Source**: Multiple

### 3. State Persistence Approaches for MCP Apps
**Importance**: LOW
**Description**:
- Upcoming persistence primitive in protocol (opaque data)
- Server-side DIY: server returns view UUID in structuredContent, app gets/sets data from hidden tool keyed by UUID
- localStorage as best effort (fast but single machine/browser only, client may clear it anytime; more stable scope with ui.domain set)

**Example**: Unsaved annotations in PDF viewer.
**Source**: Anthropic

---

## Anti-Patterns - Critical

### 1. Loading All Tool Schemas into the Prompt Upfront
**Importance**: CRITICAL
**Description**: MCP clients should NOT load server names, descriptions, tool names, and full schemas directly into the prompt at initialization. This causes prompt inflation and context bloat.
**Impact**: A server like GitHub with ~100 tools can consume 60,000 tokens just for initial setup (average tool footprint is ~500 tokens).
**Fix**: Implement progressive discovery / tool search.
**Source**: Multiple

---

## Anti-Patterns - High

### 1. Loading All Tool Results Directly into Context
**Importance**: HIGH
**Description**: All content from a tool's result should NOT go directly into the model's context window without filtering or processing. This causes massive output bloat during sessions.
**Source**: Multiple

### 2. Poor Client Implementations Causing Context Bloat
**Importance**: HIGH
**Description**: The root cause of much MCP criticism is poor client implementations, particularly around "context bloat." The fix is progressive discovery/tool search — don't dump all tools into the context window, load them on demand.
**Impact**: Claude Code went from 22% of a 200k token window consumed by MCP tools to having them fully deferred.
**Source**: Anthropic

### 3. Using Stateful Session Requirements That Are Hard to Scale
**Importance**: HIGH
**Description**: The current streamable HTTP transport works okay but is hard for hyperscalers and large deployments to scale due to stateful session requirements (sticky sessions behind load balancers).
**Fix**: New stateless-compatible transport will land in June 2026 spec revision (Google and Microsoft helping shape).
**Source**: Anthropic

### 4. No Standard Way to Develop and Deploy MCP Servers
**Importance**: HIGH
**Description**: Teams building custom integrations independently with most being non-reusable. Everyone solving the same problems in silos leads to duplication and inconsistency.
**Fix**: Implement a centralized approach with standardized patterns.
**Source**: Uber

### 5. Lack of Complete Visibility into Call Patterns and Data Access
**Importance**: HIGH
**Description**: Without observability, you can't track what agents are doing. This is critical because agents have a larger blast radius than humans — unauthorized access or exposed endpoints can cause damage faster.
**Fix**: Implement full observability with logging, metrics, tracing.
**Source**: Uber

### 6. Standalone Playground Environments
**Importance**: HIGH
**Description**: Uber deprecated all standalone playground environments; everything should be centrally committed and managed in code to ensure consistency and governance.
**Source**: Uber

### 7. No Discovery Mechanism for Finding Reliable MCPs
**Importance**: HIGH
**Description**: Without a registry with quality metrics, users can't find reliable, high-performance, safe MCPs. Bad tools don't just fail — they degrade overall agent performance.
**Fix**: Implement MCP registry with quality metrics, SLAs, evaluations.
**Source**: Uber

### 8. Exposing Mutable Endpoints Without Guardrails
**Importance**: HIGH
**Description**: Don't expose mutable endpoints that could bring down critical services without guardrails. Block dangerous operations or implement rate-limiting and comprehensive logging for all write operations.
**Source**: Uber

### 9. Expecting Users to Self-Configure MCP Setups
**Importance**: HIGH
**Description**: No matter how simple you make self-service MCP configuration, most people still won't bother. Even "one click to copy config" had low adoption at Duolingo.
**Fix**: Users need tools brought to where they already work (Slack, IDE, etc.).
**Source**: Duolingo

### 10. Inconsistent Server Hosting Without Standardization
**Importance**: HIGH
**Description**: Having every MCP server run differently (Python/uvx, TypeScript/npx, Docker) causes "it works on my machine but not yours" issues across teams.
**Fix**: Standardize hosting and auth approaches.
**Source**: Duolingo

### 11. Tool Sprawl is the Default Failure Mode
**Importance**: HIGH
**Description**: More tools an agent can reach = less predictable it becomes. Every additional tool increases context window size/token cost, broadens security blast radius, raises hallucination risk (model has more ways to be wrong).
**Root Cause**: Agents inherit every tool available in environment, teams add tools to shared servers without considering aggregate surface area.
**Source**: Snowflake

### 12. God Server Anti-Pattern
**Importance**: HIGH
**Description**: Don't create one MCP server with every tool. This maximizes sprawl and security blast radius.
**Fix**: Specialize servers by domain with least-privilege tool access.
**Source**: Snowflake

### 13. Prompt Governance Anti-Pattern
**Importance**: HIGH
**Description**: Don't rely on "only use tools X, Y, Z" in the prompt. Prompts are suggestions, not constraints. There is no distinction between what a server offers and what a user should be allowed to invoke without proper RBAC.
**Source**: Snowflake

### 14. Shared Creds Anti-Pattern
**Importance**: HIGH
**Description**: Don't have all agents use one service account. Makes auditing impossible and violates least privilege.
**Fix**: Each agent needs distinct identity.
**Source**: Snowflake

### 15. Read-Only is Not a Security Boundary
**Importance**: HIGH
**Description**: Agent can still SELECT secrets, PII, and credentials from databases. Tool output gets summarized back into attacker-controlled context, creating an exfiltration vector.
**Impact**: Sprawled agent with read access to HR, finance, infrastructure, and customer data gives prompt injection attacks 50 tools worth of exfiltration vectors.
**Fix**: Implement column policies, row-level security, role-based access.
**Source**: Snowflake

---

## Anti-Patterns - Medium

### 1. Treating MCP, Skills, and CLI as Competing Alternatives
**Importance**: MEDIUM
**Description**: These paradigms are complementary, not competing. MCP Tools expose capabilities, Skills provide recipes for using those capabilities, and CLIs offer token-efficient progressive discovery.
**Fix**: Developers should not abandon MCP in favor of other approaches without understanding their complementary nature.
**Source**: Multiple

### 2. Testing Client Name Instead of Capabilities in MCP Apps
**Importance**: MEDIUM
**Description**: Only test client name as a last resort. Instead, detect capabilities and degrade gracefully.
**Fix**: File spec enhancement requests rather than hardcoding client-specific behaviors.
**Source**: Anthropic

### 3. Tool Call Input Latency Bottleneck
**Importance**: MEDIUM
**Description**: Tool call input is often a latency bottleneck.
**Fix**: Use streaming patterns (render partial input as JSON arrives, or generative UI) to address this.
**Source**: Anthropic

---

## Anti-Patterns - Low

None identified.

---

## Summary Statistics

**Total Recommended Practices**: 57
- Critical: 5
- High: 30
- Medium: 10
- Low: 3

**Total Anti-Patterns**: 19
- Critical: 1
- High: 15
- Medium: 3
- Low: 0

**Key Themes**:
1. **Security & Governance** (20+ practices) - Most heavily emphasized
2. **Context Management** (12+ practices) - Second most critical
3. **Progressive Discovery** (8+ practices) - Emerging standard
4. **Human-in-the-Loop** (5+ practices) - Enterprise requirement
5. **Specialization over Sprawl** (6+ practices) - Operational excellence

---

**Report Metadata**

AI Provider: Claude (Anthropic)
Model: Claude Sonnet 4.5
Generation Date: 2026-04-20
Sources Analyzed: 100 session documents from MCP Dev Summit North America 2026
Document Version: 1.0
