# Feature: Ansible IDE Experience

**Status:** Draft
**Author:** [PM Name]
**Date:** 2026-02-13
**Feature ID:** [TBD]

---

## Goals

1. **Deliver an integrated Ansible development environment inside VS Code** that covers the full content lifecycle — from environment setup and discovery through authoring, execution, testing, and maintenance — eliminating the need for developers to context-switch between the editor, terminal, browser, and documentation sites.

2. **Make AI a seamless, optional accelerator** embedded throughout the developer experience. Every AI-assisted capability must have a functional non-AI path. Users who choose not to use AI, or who work in disconnected environments, receive a complete, valuable toolset. Users who enable AI get the same toolset with intelligent assistance layered in at every stage.

3. **Provide schema-driven, context-aware content generation** that uses the user's actual installed collections, real plugin documentation, and validated parameter schemas — not model memorization — to produce correct Ansible content. This approach works with any AI provider and improves as the user's environment grows.

4. **Establish an extensible agent framework** where specialized AI agents (such as a Content Designer agent) can be developed independently and plugged into the IDE to deliver guided, multi-phase workflows. The IDE provides the runtime, UI, and tool surface; agents provide domain expertise.

5. **Support pre-production content vetting** through structured design workflows, automated validation, drift detection, and full traceability from business requirements to generated artifacts — enabling organizations to review, approve, and audit automation content before it reaches production.

6. **Reduce time to first working playbook** for both new and experienced Ansible users by providing visual discovery, interactive documentation, guided scaffolding, and intelligent defaults — making the "right way" the easy way.

---

## Background and Strategic Fit

### Problem Description

Ansible content development today is a fragmented experience. Practitioners must:

- **Manage environments manually.** Selecting the correct Python interpreter, ensuring `ansible-dev-tools` is installed at the right version, and resolving tool paths is left to the user. Misconfigured environments are a leading source of "it works on my machine" problems and onboarding friction.

- **Discover content in the dark.** Finding relevant Ansible collections, understanding what plugins are available, reading plugin documentation, and identifying the right module for a task requires leaving the editor to browse Galaxy, read docs.ansible.com, or run `ansible-doc` in a terminal. This context-switching breaks flow and slows development.

- **Author content without guardrails.** Writing playbooks, roles, and tasks requires memorizing module names, parameter schemas, and YAML conventions. Errors are caught late (at lint or runtime), not at authoring time. New users face a steep learning curve; experienced users still make avoidable mistakes.

- **Run playbooks blind.** Executing a playbook means opening a terminal, typing a command with the right flags, and watching unstructured text output scroll by. There is no visual progress, no per-task status, and no structured way to configure and save execution parameters.

- **Generate content without context.** Existing AI code generation for Ansible relies on model training data, which may not reflect the user's installed collections, organizational conventions, or current project requirements. The AI suggests what it has seen, not what is correct for the user's environment.

- **Lack a path from requirements to automation.** Organizations that need to produce Ansible content to meet specific operational requirements have no structured workflow. Requirements live in Jira, designs live in wikis, code lives in Git, and the connections between them are informal and unauditable.

### Summary

This feature delivers a next-generation Ansible IDE experience that addresses these problems by unifying environment management, content discovery, authoring, execution, and maintenance into a single, cohesive tool — with AI embedded as an optional accelerator throughout, not as a gated premium feature.

This aligns with our strategy to:

- **Lower the barrier to Ansible adoption** by making the development experience approachable and guided.
- **Increase content quality** by embedding best practices, validation, and real plugin schemas into the authoring workflow.
- **Differentiate through AI that is context-aware**, using the user's actual environment (installed collections, plugin schemas, project structure) rather than generic model knowledge.
- **Build a platform for agent-driven workflows** that can evolve independently from the core IDE, enabling rapid innovation in AI-assisted automation development.

---

## Assumptions

1. **Language Server Protocol (LSP) integration exists.** This feature assumes the Ansible Language Server (syntax highlighting, completions, hover, diagnostics, linting, go-to-definition, schema validation) is present as a baseline capability. This document focuses on capabilities beyond the LSP.

2. **`ansible-dev-tools` is the standard tool distribution.** The extension manages the user's Ansible toolchain through the `ansible-dev-tools` meta-package, which includes `ansible-core`, `ansible-lint`, `ansible-navigator`, `ansible-creator`, and supporting tools.

3. **The Microsoft Python Environments API is available.** Environment discovery and management depend on the `ms-python.vscode-python-envs` extension for Python interpreter resolution.

4. **AI integration is provider-agnostic.** The extension works with any LLM available through the VS Code Language Model API, MCP-compatible clients (Cursor, GitHub Copilot, Claude), or external providers. No single AI vendor or service is required.

5. **Users work in VS Code or a VS Code-compatible editor** (Cursor, VS Code forks). The extension targets the VS Code extension API.

6. **Organizational best practices can be codified.** The Content Designer agent assumes that Ansible coding standards and conventions can be captured in Markdown/YAML files and embedded into generation prompts.

7. **Network access is optional.** Core functionality (environment management, local collection browsing, playbook execution, scaffolding) works offline. AI features and remote collection sources (Galaxy, GitHub) require network access.

---

## User Stories

### Persona: Ansible Content Developer

An automation engineer who writes and maintains Ansible playbooks, roles, and collections as part of their daily work. They may be experienced with Ansible or relatively new.

> **US-1: Environment Setup**
> As a content developer, I want to see all available Python environments with their installed Ansible tools and versions, so that I can select the right environment for my project without manually inspecting paths or running `pip list`.

> **US-2: Tool Lifecycle**
> As a content developer, I want to install, upgrade, and verify my Ansible development tools from within the editor, so that I can keep my toolchain current without switching to a terminal.

> **US-3: Collection Discovery**
> As a content developer, I want to browse my installed collections, search for plugins by keyword, and view rich interactive documentation — including parameter tables, examples, and sample tasks — so that I can find and understand the right module without leaving the editor.

> **US-4: Collection Installation**
> As a content developer, I want to search for collections on Ansible Galaxy and configured GitHub organizations, and install them directly from the sidebar, so that I can add dependencies to my project without using the command line.

> **US-5: Scaffolding**
> As a content developer, I want to scaffold new collections, playbook projects, roles, and plugins through an interactive form that adapts to the current `ansible-creator` schema, so that I always get the correct project structure without memorizing CLI flags.

> **US-6: Playbook Execution**
> As a content developer, I want to discover all playbooks in my workspace, configure execution parameters (inventory, connection, vault, verbosity) through a visual form, and see real-time play/task/host progress during execution, so that I can run and debug playbooks without constructing command lines.

> **US-7: Execution Environment Inspection**
> As a content developer, I want to browse available Execution Environment container images and drill into their contents (collections, Python packages, system metadata), so that I can understand what's available inside an EE without running the container.

> **US-8: AI-Assisted Content Authoring — "Make Me a Role"**
> As a content developer, I want to describe what I need in natural language (e.g., "create a role that configures nginx with SSL") and have the AI use my installed collections, real plugin schemas, and best practices to generate correct, validated Ansible content — so that I can go from intent to working code in minutes rather than hours.

> **US-9: AI-Assisted Plugin Discovery**
> As a content developer, I want the AI to search my installed plugins, retrieve their documentation, and recommend the right module for my task — so that I benefit from my environment's actual capabilities rather than the AI's training data.

> **US-10: Schema-Driven Task Generation**
> As a content developer, I want to generate individual Ansible tasks from real plugin schemas — with correct parameter names, types, and defaults — and optionally build multi-task playbooks through a guided, step-by-step conversation, so that I produce valid YAML without memorizing module interfaces.

> **US-11: AI Summaries**
> As a content developer, I want to generate natural-language summaries of collections, execution environments, and playbooks with a single click, so that I can quickly understand unfamiliar content.

### Persona: Automation Architect / Content Reviewer

A senior engineer or architect responsible for ensuring automation content meets organizational standards before it reaches production.

> **US-12: Structured Content Design**
> As an automation architect, I want to capture business requirements as structured user stories, have them assessed for collection dependencies and design decisions, and review an implementation plan before any code is generated — so that automation content is designed, not improvised.

> **US-13: AI-Assisted Assessment**
> As an automation architect, I want an AI agent to analyze my requirements, identify needed collections, and generate targeted design questions (architecture, security, error handling, testing) — so that I build a complete specification through guided conversation rather than blank-page authoring.

> **US-14: Plan Review and Approval**
> As an automation architect, I want to review, approve, reject, or provide feedback on individual build items in an implementation plan — and regenerate the plan based on my feedback — so that I maintain control over what gets built.

> **US-15: Traceable Content Generation**
> As an automation architect, I want every generated artifact (role, playbook, task file) to be traceable back to the requirement and design decisions that produced it — so that I can audit why any piece of content exists and what it was intended to do.

> **US-16: Pre-Production Drift Detection**
> As an automation architect, I want to run a compliance assessment that compares current content against its original specification, identifies drift, and lets me resolve findings (update spec, regenerate, flag for review, dismiss) — so that I catch discrepancies before content reaches production.

> **US-17: Design Export for Review**
> As an automation architect, I want the design specification (requirements, decisions, plan, history) exported as version-control-friendly YAML files — so that I can include them in pull requests and code reviews alongside the generated content.

### Persona: Both

> **US-18: Works Without AI**
> As any user, I want the full environment management, collection browsing, scaffolding, playbook execution, and documentation experience to work without any AI configuration — so that the extension is valuable from the moment I install it, regardless of my AI setup.

> **US-19: Best Practices Embedded**
> As any user, I want Ansible best practices (FQCN usage, idempotency, naming conventions, role structure, testing patterns) embedded into scaffolding templates, AI generation prompts, and validation — so that I produce high-quality content by default.

---

## Capability Areas

### 1. Environment and Tool Management

Provide a visual, automated experience for managing the Ansible development environment.

| Capability | Without AI | With AI |
|---|---|---|
| Discover Python environments (venv, global, conda) | Auto-discovered tree view with managers and environments | Same |
| Create new virtual environments | One-click creation | Same |
| Select environment with automatic tool path resolution | Click to select; all `ansible-*` tools resolve from selected env | Same |
| View installed `ansible-dev-tools` packages and versions | Persistent tree view | Same |
| Install and upgrade dev tools | One-click install/upgrade | Same |
| Warn on global environment usage | Visual warning with "Create Virtual Environment" alternative | Same |

### 2. Collection Discovery and Documentation

Make Ansible collections a first-class, browsable, searchable, installable part of the experience.

| Capability | Without AI | With AI |
|---|---|---|
| Browse installed collections | Tree: Collection → Plugin Type → Plugin with counts, versions, descriptions | Same |
| Search plugins by keyword across all collections | In-memory search index with relevance scoring | AI can search via MCP tool with natural language |
| View rich plugin documentation | Interactive panel: synopsis, parameters, examples, return values | AI can retrieve and explain docs |
| Generate sample tasks from plugin schemas | Sample task generator with three detail levels (minimal, documented, full) | AI generates tasks from schemas via MCP tools |
| Search remote collections (Galaxy + GitHub orgs) | Unified search across configured sources | AI can search and recommend via MCP |
| Install collections from sidebar | One-click install from any source | AI can install via MCP tool |
| Manage collection sources (add/remove GitHub orgs) | Settings-driven with visual source list | Same |

### 3. Content Scaffolding

Provide dynamic, schema-driven scaffolding that adapts to the current `ansible-creator` version.

| Capability | Without AI | With AI |
|---|---|---|
| Scaffold collections, playbook projects, roles, plugins | Interactive form generated from `ansible-creator` schema | AI can scaffold via MCP tools (e.g., "create a collection for network automation") |
| Live command preview | Form shows exact `ansible-creator` command that will run | Same |
| Auto-adapt to new subcommands | Schema is read at runtime; new creator commands appear automatically | Same |

### 4. Playbook Execution and Visualization

Go beyond "run in terminal" to provide structured, visual playbook execution.

| Capability | Without AI | With AI |
|---|---|---|
| Discover playbooks in workspace | Tree with folder structure, play names, hosts, task counts | Same |
| Configure execution parameters | Visual form: inventory, connection, privilege escalation, vault, execution options | Same |
| Per-playbook configuration | Saved per playbook; separate from global defaults | Same |
| Real-time progress visualization | Split-pane: tree (plays → tasks → hosts) + detail panel + live stats (ok/changed/failed/skipped) | Same |
| Failure highlighting | Failed tasks auto-expanded, status-colored, detail panel shows error | AI can analyze failures via MCP |

### 5. Execution Environment Inspection

Provide visibility into containerized execution environments.

| Capability | Without AI | With AI |
|---|---|---|
| Discover available EE images | Tree view of EE images via `ansible-navigator` | Same |
| Inspect EE contents | Drill into: Ansible info, collections, Python packages, system packages | AI can summarize EE contents |
| Understand EE capabilities | Manual inspection of collections and packages | AI generates natural-language summary of what an EE is suited for |

### 6. AI-Powered Content Authoring

Deliver Lightspeed-equivalent capabilities — natural language to Ansible content — through a schema-driven, provider-agnostic approach.

| Capability | How It Works |
|---|---|
| **"Make me a role"** | User describes intent in chat. AI agent uses MCP tools: searches plugins → retrieves docs → generates tasks from real schemas → scaffolds role structure via ansible-creator → populates task files with validated content. |
| **"Author a playbook"** | User describes desired outcome. AI builds playbook step-by-step using `build_ansible_task` (session-based, guided parameter collection from plugin schemas) or `generate_ansible_playbook` (one-shot with multiple tasks). |
| **"What module should I use?"** | AI searches installed plugins via `search_ansible_plugins`, retrieves docs via `get_plugin_documentation`, and recommends with full parameter guidance. |
| **"Explain this playbook"** | AI reads playbook structure and generates natural-language explanation using collection and plugin context. |
| **Interactive task building** | Session-based workflow: AI selects plugin → fetches schema → collects required parameters conversationally → generates validated YAML. User builds complex tasks through guided dialogue. |
| **Best practices enforcement** | All generation prompts include curated Ansible best practices (FQCN, idempotency, naming, role structure, testing). AI produces content that follows standards by default. |

**Key differentiator:** This approach uses the user's actual installed collections and `ansible-doc` schemas as the source of truth — not model training data. This means:

- Generated content uses correct parameter names, types, and defaults for the user's collection versions.
- Newly released or custom collections are immediately usable — no model retraining required.
- Content is validated against real schemas before being returned to the user.

### 7. Content Designer Agent (Deferred)

*Note: The Content Designer is deferred to a future release. The implementation is preserved on the `feature/content-designer` branch. This section describes the intended design for reference.*

An example of a specialized agent delivered as an independent module, integrated into the IDE as a guided, multi-phase workflow for specification-driven Ansible content development.

| Phase | What Happens | AI Role | Without AI |
|---|---|---|---|
| **1. Requirements** | User captures structured requirements as user stories (persona, intent, outcome) with tags | None — fully manual | Fully functional |
| **2. Assessment** | Requirements analyzed for collection dependencies and design decisions (architecture, security, error handling, testing) | AI generates targeted questions and identifies collections | Rule-based default questions and keyword-based collection matching |
| **3. Planning** | Implementation plan created with individually reviewable build items, each traced to requirements and decisions | AI creates detailed plan with file paths, content descriptions, and tool calls | Fallback plan: scaffold + generate per requirement |
| **4. Build** | Approved plan items executed: scaffolding, content generation, collection installation, validation via ansible-lint | AI generates content using requirements, design decisions, plugin docs, and best practices | Build cannot proceed without AI (plan execution requires generation) |
| **5. Drift Detection** | Current content compared against specification; findings scored and categorized; resolutions tracked | Rule-based compliance checks (AI optional for deeper analysis) | Fully functional |

**Traceability chain:** Every artifact traces back through: `Requirement → Design Decisions → Plan Item → Generated Artifact`. This chain is persisted in a local SQLite database and exported as version-control-friendly YAML for inclusion in code reviews and audits.

**Pre-production vetting:** The combination of structured requirements, explicit design decisions, reviewable plans, and drift detection creates an auditable path from business need to automation content — suitable for organizations that require review and approval workflows before automation reaches production.

### 8. MCP Tool Surface

The extension exposes its full Ansible development context to AI agents via the Model Context Protocol (MCP), making the AI environment-aware regardless of which AI client or model is used.

| Tool Category | Tools | Purpose |
|---|---|---|
| **Discovery** | `search_ansible_plugins`, `list_ansible_collections`, `get_collection_plugins`, `search_available_collections`, `list_source_collections` | Find and browse Ansible content |
| **Documentation** | `get_plugin_documentation`, `get_ansible_best_practices` | Understand how to use content correctly |
| **Generation** | `generate_ansible_task`, `build_ansible_task`, `generate_ansible_playbook` | Produce validated Ansible YAML from real schemas |
| **Environment** | `list_execution_environments`, `get_ee_details`, `list_ansible_dev_tools` | Understand the user's environment |
| **Management** | `install_ansible_collection`, `get_ansible_creator_schema` | Modify the environment |
| **Design** | `query_design_db`, `get_project_requirements`, `get_design_decisions` | Access Content Designer context (deferred) |

---

## Questions

1. **Naming and branding:** What should this experience be called? "Ansible IDE Experience" is used as a working title in this document. Does it ship as a new extension, a major version of the existing Ansible extension, or a complement to it?

2. **Relationship to existing extension:** Should this replace the current `redhat.ansible` extension or coexist alongside it? The LSP assumption in this document implies integration. What is the migration/convergence strategy?

3. **AI provider strategy:** This design is provider-agnostic (works with any LLM via VS Code API or MCP). Should we optimize for or certify specific providers? Should there be a "recommended" provider?

4. **Content Designer packaging:** The Content Designer agent is designed to be an independent NPM package. What is the governance model for adding new agents to the IDE? Who can publish agents?

5. **Lightspeed relationship:** This feature delivers capabilities similar to Ansible Lightspeed (playbook generation, role generation, content explanation) through a different mechanism (MCP tools + schema-driven generation vs. hosted model). How do we position this relative to existing Lightspeed customers and messaging?

6. **Offline and air-gapped support:** Core features work offline, but AI features and remote collection sources require network access. What are the requirements for air-gapped / disconnected environments?

7. **Authentication and entitlement:** The current design has no authentication gate. AI features work with any available LLM. Should any capabilities require Red Hat authentication or subscription?

8. **Telemetry:** What usage telemetry should be collected? The current POC has no telemetry. What metrics are needed for success measurement?

9. **Testing and validation:** The Content Designer includes ansible-lint validation during build. Should we integrate `ansible-test` (sanity, unit, integration) into the execution workflow?

10. **Multi-user workflows:** The Content Designer exports YAML for code review. Should we support explicit multi-user sign-off workflows (e.g., "Architect signs off on plan, Developer executes build")?

---

## Links

| Document | Location |
|---|---|
| POC Repository | [ansible-environments] |
| Content Designer Proposal | `feature/content-designer` branch: `docs/ansible-content-designer-proposal.md` |
| Content Designer Task Breakdown | `feature/content-designer` branch: `docs/ansible-content-designer-tasks.md` |
| Ansible Best Practices Reference | `resources/best_practises.md` |
| MCP Configuration Example | `mcp-config.example.json` |
| PRD | [TBD] |
| ADR | [TBD] |
| UX Interaction Design | [TBD] |
| Architecture Decision Record | [TBD] |

---

## Out of Scope

1. **Ansible Language Server development.** This feature assumes the existing Ansible Language Server (syntax highlighting, completions, hover, diagnostics, linting, go-to-definition, schema validation). LSP enhancements are tracked separately.

2. **Hosting or operating an AI model.** The extension is AI-provider-agnostic. It does not host, train, fine-tune, or operate any language model. It consumes models available through the VS Code Language Model API or MCP-compatible clients.

3. **Ansible Automation Platform (AAP) integration.** While the data model includes placeholder fields for AAP links (job templates, workflows), direct AAP integration (push to controller, sync inventories, trigger jobs) is out of scope for this feature.

4. **Galaxy publishing.** Publishing collections to Ansible Galaxy or Private Automation Hub from the IDE is out of scope.

5. **Execution Environment authoring and building.** While EE inspection is in scope, building EE images from `execution-environment.yml` files is out of scope (the current Ansible extension provides this today).

6. **Molecule / ansible-test integration.** Automated test execution (molecule, ansible-test sanity/unit/integration) is not included in this feature, though it is a natural follow-on.

7. **Multi-editor support.** This feature targets VS Code and VS Code-compatible editors only. JetBrains, Neovim, and other editors are out of scope.

8. **Training data attribution.** Content source attribution (training matches) is a Lightspeed-specific capability and is out of scope for this feature.

---

## Acceptance Criteria

### AC-1: Environment and Tool Management

- [ ] Extension displays all discoverable Python environments grouped by manager (venv, global, conda, etc.)
- [ ] User can create a new virtual environment from the sidebar
- [ ] Selecting an environment automatically resolves all `ansible-*` tool paths from that environment
- [ ] Installed `ansible-dev-tools` packages are displayed with their versions
- [ ] User can install and upgrade `ansible-dev-tools` from the sidebar
- [ ] Warning is displayed when a global environment is selected, with an alternative action to create a venv
- [ ] All environment and tool management features work without AI configured

### AC-2: Collection Discovery and Documentation

- [ ] Installed collections are displayed in a tree view: Collection → Plugin Type → Plugin
- [ ] Each collection shows version; each plugin type shows count; each plugin shows short description
- [ ] User can search for plugins by keyword across all installed collections with relevance-ranked results
- [ ] Clicking a plugin opens an interactive documentation panel with: synopsis, parameters (types, defaults, choices, required indicators), examples, return values, and sample task generator
- [ ] Sample task generator produces valid YAML at three detail levels (no comments, minimal, fully documented)
- [ ] User can search for collections across Ansible Galaxy and configured GitHub organizations
- [ ] User can install a collection from Galaxy or a GitHub source directly from the sidebar
- [ ] User can add and remove GitHub organizations as collection sources
- [ ] All collection discovery and documentation features work without AI configured

### AC-3: Content Scaffolding

- [ ] The Creator view displays available `ansible-creator` subcommands organized by category (Init, Add)
- [ ] Forms are generated dynamically from the `ansible-creator` schema at runtime
- [ ] Adding a new subcommand to `ansible-creator` results in automatic form availability without extension update
- [ ] Each form shows required and optional parameters with descriptions, defaults, and validation
- [ ] A live command preview shows the exact `ansible-creator` command that will execute
- [ ] Scaffolding operations produce correct project structures
- [ ] All scaffolding features work without AI configured

### AC-4: Playbook Execution and Visualization

- [ ] All playbooks in the workspace are discovered and displayed in a tree with folder hierarchy, play names, and host targets
- [ ] Multi-root workspaces are supported with workspace folder grouping
- [ ] User can configure execution parameters (inventory, connection, privilege escalation, vault, verbosity, tags, extra vars) through a visual form
- [ ] Per-playbook configuration is saved and restored independently from global defaults
- [ ] Running a playbook with the progress viewer displays real-time play/task/host status in a split-pane view
- [ ] The progress viewer shows live statistics (ok, changed, failed, skipped, duration)
- [ ] Failed tasks are automatically expanded and visually highlighted
- [ ] User can stop a running playbook from the progress viewer
- [ ] All playbook execution features work without AI configured

### AC-5: Execution Environment Inspection

- [ ] Available EE container images are discovered and listed via `ansible-navigator`
- [ ] User can expand an EE to see: general info, installed Ansible collections, Python packages
- [ ] Clear error states are displayed when `ansible-navigator` is not installed (with install action) or when no EEs are found
- [ ] All EE inspection features work without AI configured

### AC-6: AI-Powered Content Authoring (requires AI)

- [ ] User can describe a desired task, role, or playbook in natural language in a chat interface, and the AI produces Ansible content using MCP tools
- [ ] AI-generated tasks use real plugin schemas from `ansible-doc` for parameter names, types, and defaults
- [ ] AI-generated content uses FQCNs and follows embedded best practices
- [ ] The `build_ansible_task` tool supports session-based, guided parameter collection with conversational interaction
- [ ] The `generate_ansible_playbook` tool produces complete playbooks with multiple tasks
- [ ] The AI can search plugins, retrieve documentation, and explain content via MCP tools
- [ ] AI summaries are available for collections, plugins, execution environments, and playbooks with a single click
- [ ] When AI is not available, summary actions degrade gracefully (prompt copied to clipboard with instructions)

### AC-7: Content Designer Agent (deferred — requires AI for phases 2-4)

- [ ] User can create a new design project with name and description
- [ ] Requirements phase: user can add, edit, delete, and tag structured requirements (user stories) without AI
- [ ] Assessment phase: AI agent generates dependency questions and design questions; user can answer, accept defaults, or request agent review
- [ ] Assessment phase fallback: rule-based questions are generated when AI is unavailable
- [ ] Planning phase: AI generates an implementation plan with individually reviewable items traced to requirements
- [ ] Planning phase: user can approve, reject (with reason), provide feedback, and regenerate plan items
- [ ] Build phase: approved plan items are executed (scaffold, generate, install, validate)
- [ ] Build phase: generated content is validated via ansible-lint with up to 5 correction iterations
- [ ] Build phase: user can stop, rebuild individual items, rebuild all, or undo the entire build
- [ ] Drift detection: compliance assessment compares current content to specification and reports findings
- [ ] Drift detection: user can resolve findings (update spec, regenerate, flag for review, dismiss)
- [ ] Drift detection works without AI (rule-based compliance checks)
- [ ] All design data is persisted in a local SQLite database (`design/design.db`)
- [ ] Design specification is exported as YAML to `design/export/` (project, requirements, plan, history)
- [ ] Every generated artifact is traceable: Requirement → Design Decisions → Plan Item → Artifact
- [ ] The Content Designer is packageable as an independent NPM module consumed by the IDE

### AC-8: Cross-Cutting

- [ ] The extension activates without errors when no AI provider is configured
- [ ] All tree views display appropriate empty states, loading indicators, and error messages
- [ ] Ansible best practices are embedded in scaffolding templates and AI generation prompts
- [ ] The MCP server exposes all documented tools and is compatible with Cursor, VS Code Copilot, and other MCP-compatible clients
- [ ] MCP configuration can be set up for Cursor from within the extension with guided setup
- [ ] Extension settings are clearly documented with descriptions, defaults, and grouping
