# Walkthrough Modules (machine-readable)

Structured step definitions for the UX walkthrough skill and (Phase 2) the
extension Walkthrough panel.

**Single source of truth:** [`walkthrough-modules.json`](walkthrough-modules.json).
The fenced block below is a **readable snapshot** for documentation purposes.
When the two diverge, the JSON file wins. Always edit the JSON file first,
then update this block to match.

**Agent:** Parse [`walkthrough-modules.json`](walkthrough-modules.json) to
drive module order, exercises, and Canvas content. Do not parse the block below.

```json
{
  "version": 1,
  "modules": [
    {
      "id": "setup",
      "order": 0,
      "title": "Setup & First Impressions",
      "userStories": [],
      "acceptanceCriteria": ["AC-8"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "Choose or scaffold an Ansible workspace, build the extension, press F5, open the workspace in the dev host, then explore the sidebar.",
      "steps": [
        { "title": "Choose workspace", "description": "Scaffold ~/ansible-ux-walkthrough/ or use an existing path with playbooks (e.g. ~/github/demo)." },
        { "title": "Build the extension", "description": "In the repo window: npm run compile && npm run build" },
        { "title": "Press F5 (Run Extension)", "description": "Opens Extension Development Host window." },
        { "title": "Open workspace folder", "description": "In dev host: File → Open Folder → your Ansible project path." },
        { "title": "Open Ansible", "description": "Click Ansible icon in Activity Bar.", "view": "ansibleDevToolsEnvManagers" },
        { "title": "Scan sidebar views", "description": "Scroll through all tree views." },
        { "title": "Check output channel", "description": "Output → Ansible. Confirm no activation errors." }
      ]
    },
    {
      "id": "environment",
      "order": 1,
      "title": "Environment & Tool Management",
      "userStories": ["US-1", "US-2"],
      "acceptanceCriteria": ["AC-1"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "Create a venv from the sidebar, install ansible-dev-tools, select the environment, and verify the Dev Tools tree populates.",
      "steps": [
        { "title": "Open Environment Managers", "command": "ansibleDevToolsEnvManagers.refresh", "view": "ansibleDevToolsEnvManagers" },
        { "title": "Create virtual environment", "description": "Click + or Command Palette → 'Ansible: Create Environment'. Enter a name (e.g. .venv).", "command": "ansibleDevToolsEnvManagers.create" },
        { "title": "Verify environment selected", "description": "Confirm the new venv appears in Environment Managers and the Python status bar updates.", "view": "ansibleDevToolsEnvManagers" },
        { "title": "Install ansible-dev-tools", "description": "In Dev Tools Packages view, click 'Install ansible-dev-tools'. Verify tree populates.", "command": "ansibleDevToolsPackages.install", "view": "ansibleDevToolsPackages" },
        { "title": "Inspect Dev Tools", "description": "Verify expected packages appear (ansible-lint, ansible-navigator, etc.).", "command": "ansibleDevToolsPackages.refresh", "view": "ansibleDevToolsPackages" },
        { "title": "Status bar", "description": "Click Python status bar. Verify QuickPick shows active environment.", "command": "ansible.statusBar.pythonClick" }
      ]
    },
    {
      "id": "editor-lsp",
      "order": 2,
      "title": "Editor & Language Server",
      "userStories": ["US-18"],
      "acceptanceCriteria": ["AC-8"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "Completion, hover, diagnostics, vault encrypt/decrypt in a playbook file.",
      "steps": [
        { "title": "Open a playbook", "description": "Open .yml playbook or test fixture." },
        { "title": "Auto-completion", "description": "Ctrl+Space on module and options." },
        { "title": "Hover docs", "description": "Hover FQCN or keyword." },
        { "title": "Diagnostics", "description": "Trigger YAML or ansible-lint squiggle." },
        { "title": "Vault", "command": "ansibleEnvironments.vault" }
      ]
    },
    {
      "id": "collections-installed",
      "order": 3,
      "title": "Installed Collections & Plugin Docs",
      "userStories": ["US-3"],
      "acceptanceCriteria": ["AC-2"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "Browse plugins, open Plugin Doc panel, try sample task generator.",
      "steps": [
        { "title": "Installed Collections", "command": "ansibleDevToolsCollections.refresh", "view": "ansibleDevToolsCollections" },
        { "title": "Search plugins", "command": "ansibleDevToolsCollections.search" },
        { "title": "Plugin documentation", "command": "ansibleDevToolsCollections.showPluginDoc" },
        { "title": "Sample task generator", "description": "Plugin Doc panel → Sample Task tab." }
      ]
    },
    {
      "id": "collections-remote",
      "order": 4,
      "title": "Collection Sources & Installation",
      "userStories": ["US-4"],
      "acceptanceCriteria": ["AC-2"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "Search Galaxy/GitHub, view uninstalled plugin docs, optional install.",
      "steps": [
        { "title": "Collection Sources", "command": "ansibleCollectionSources.refresh", "view": "ansibleCollectionSources" },
        { "title": "Search collections", "command": "ansibleCollectionSources.search" },
        { "title": "Galaxy browse", "command": "ansibleCollectionSources.filterGalaxyCollections" },
        { "title": "Uninstalled plugin docs", "command": "ansibleCollectionSources.showGalaxyPluginDoc" },
        { "title": "Optional install", "command": "ansibleCollectionSources.installGalaxyCollection" }
      ]
    },
    {
      "id": "creator",
      "order": 5,
      "title": "Content Scaffolding (Creator)",
      "userStories": ["US-5"],
      "acceptanceCriteria": ["AC-3"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "Open creator form, review CLI preview, scaffold to temp dir.",
      "steps": [
        { "title": "Creator view", "command": "ansibleCreator.refresh", "view": "ansibleCreator" },
        { "title": "Open form", "command": "ansibleCreator.openForm" },
        { "title": "CLI preview", "description": "Confirm live ansible-creator command." },
        { "title": "Scaffold", "description": "Submit to temp directory." }
      ]
    },
    {
      "id": "playbooks",
      "order": 6,
      "title": "Playbook Execution & Visualization",
      "userStories": ["US-6"],
      "acceptanceCriteria": ["AC-4"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "Edit run config, run with progress viewer.",
      "steps": [
        { "title": "Playbooks view", "command": "ansiblePlaybooks.refresh", "view": "ansiblePlaybooks" },
        { "title": "Go to play", "command": "ansiblePlaybooks.goToPlay" },
        { "title": "Edit config", "command": "ansiblePlaybooks.editConfig" },
        { "title": "Progress viewer", "command": "ansiblePlaybooks.runWithProgress" },
        { "title": "Terminal run", "command": "ansiblePlaybooks.run" }
      ]
    },
    {
      "id": "execution-envs",
      "order": 7,
      "title": "Execution Environment Inspection",
      "userStories": ["US-7"],
      "acceptanceCriteria": ["AC-5"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "List EEs, expand image, inspect package detail.",
      "steps": [
        { "title": "EE view", "command": "ansibleExecutionEnvironments.refresh", "view": "ansibleExecutionEnvironments" },
        { "title": "EE detail", "command": "ansibleExecutionEnvironments.showDetail" },
        { "title": "Package detail", "command": "ansibleExecutionEnvironments.showPackageDetail" }
      ]
    },
    {
      "id": "ai-authoring",
      "order": 8,
      "title": "AI-Assisted Content Authoring",
      "userStories": ["US-8", "US-9", "US-10", "US-11"],
      "acceptanceCriteria": ["AC-6"],
      "requiresAi": true,
      "requiresLightspeed": false,
      "exercise": "AI summaries, plugin doc AI builder, graceful no-LLM fallback.",
      "steps": [
        { "title": "Enable AI", "description": "ansibleEnvironments.enableAiFeatures = true" },
        { "title": "Collection AI summary", "command": "ansibleDevToolsCollections.aiSummary" },
        { "title": "Plugin AI summary", "command": "ansibleDevToolsCollections.aiPluginSummary" },
        { "title": "Playbook AI summary", "command": "ansiblePlaybooks.aiSummary" }
      ]
    },
    {
      "id": "mcp-skills",
      "order": 9,
      "title": "MCP Tools & AI Skills",
      "userStories": ["US-18"],
      "acceptanceCriteria": ["AC-8"],
      "requiresAi": true,
      "requiresLightspeed": false,
      "exercise": "Browse AI Tools/Skills, MCP status, Cursor config, LLM selection.",
      "steps": [
        { "title": "AI Tools", "command": "ansibleMcpTools.refresh", "view": "ansibleMcpTools" },
        { "title": "Use in chat", "command": "ansibleMcpTools.useInChat" },
        { "title": "AI Skills", "command": "ansibleSkills.refresh", "view": "ansibleSkills" },
        { "title": "MCP status", "command": "ansible-environments.showMcpStatus" },
        { "title": "Cursor MCP", "command": "ansible-environments.configureCursorMcp" },
        { "title": "LLM model", "command": "ansibleEnvironments.selectLlmModel" }
      ]
    },
    {
      "id": "lightspeed",
      "order": 10,
      "title": "Ansible Lightspeed",
      "userStories": ["US-8"],
      "acceptanceCriteria": ["AC-6"],
      "requiresAi": false,
      "requiresLightspeed": true,
      "exercise": "Sign in, generation, explanation, inline suggestions.",
      "steps": [
        { "title": "Enable Lightspeed", "description": "ansible.lightspeed.enabled = true" },
        { "title": "Lightspeed view", "view": "ansibleLightspeed" },
        { "title": "Sign in", "command": "ansible.lightspeed.oauth" },
        { "title": "Generate playbook", "command": "ansible.lightspeed.playbookGeneration" },
        { "title": "Explain playbook", "command": "ansible.lightspeed.playbookExplanation" }
      ]
    },
    {
      "id": "cross-cutting",
      "order": 11,
      "title": "Cross-Cutting UX",
      "userStories": ["US-18", "US-19"],
      "acceptanceCriteria": ["AC-8"],
      "requiresAi": false,
      "requiresLightspeed": false,
      "exercise": "Non-AI path, empty/error states, settings clarity.",
      "steps": [
        { "title": "Disable AI features", "description": "Toggle enableAiFeatures off; verify core views." },
        { "title": "Empty/error states", "description": "Note messaging when data or tools missing." },
        { "title": "Settings review", "description": "Search ansible in Settings." },
        { "title": "Output channel", "description": "Review Ansible logs." }
      ]
    }
  ]
}
```
