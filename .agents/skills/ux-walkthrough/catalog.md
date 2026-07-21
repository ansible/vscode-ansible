# UX Walkthrough Feature Catalog

Reference for the `ux-walkthrough` skill. Organized by module ID.
Maps to PRD: [`feature-ansible-ide-experience.md`](../../../docs/src/content/docs/roadmap/feature-ansible-ide-experience.md).

Legend: **Non-AI** = works without `ansibleEnvironments.enableAiFeatures`.

---

## Module 0: `setup` — Setup & First Impressions

| Feature                | Trigger          | Description                                                                                        | Non-AI | Implementation                   |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| Activity bar container | Ansible icon     | Opens Ansible sidebar                                                                              | yes    | `package.json` `viewsContainers` |
| Ansible                    | Activity Bar     | Accordion sections (Env, Dev Tools, Collections, Sources, EEs, Creator, Playbooks, AI Tools*, AI Skills*, Lightspeed\*) | yes\*  | `src/sidebar/` + `*Controller.ts` |
| Output channel         | Output → Ansible | Extension logs                                                                                     | yes    | `src/extension.ts`               |

\*AI views require `enableAiFeatures`; Lightspeed view requires `ansible.lightspeed.enabled`.

**AC:** AC-8

---

## Module 1: `environment` — Environment & Tool Management

| Feature              | Command / trigger                    | Description                    | Non-AI | Implementation                   |
| -------------------- | ------------------------------------ | ------------------------------ | ------ | -------------------------------- |
| Environment Managers | Sidebar section: `envManagers`           | Python managers → environments | yes    | `EnvironmentManagersController.ts` |
| Refresh environments | `ansibleDevToolsEnvManagers.refresh` | Reload env tree                | yes    |                                  |
| Create environment   | `ansibleDevToolsEnvManagers.create`  | One-click venv creation        | yes    |                                  |
| Select environment   | `ansibleDevTools.selectEnvironment`  | Active env for Ansible tools   | yes    |                                  |
| Ansible Dev Tools    | Sidebar section: `devTools`              | ADT package versions           | yes    | `AnsibleDevToolsController.ts`     |
| Install ADT          | `ansibleDevToolsPackages.install`    | Install meta-package           | yes    |                                  |
| Upgrade ADT          | `ansibleDevToolsPackages.upgrade`    | Upgrade packages               | yes    |                                  |
| Python status bar    | `ansible.statusBar.pythonClick`      | Env details QuickPick          | yes    | `statusBar/pythonStatusBar.ts`   |
| Ansible status bar   | `ansible.statusBar.ansibleClick`     | Tool versions QuickPick        | yes    | `statusBar/ansibleStatusBar.ts`  |

**US:** US-1, US-2 | **AC:** AC-1

---

## Module 2: `editor-lsp` — Editor & Language Server

| Feature               | Trigger                     | Description                        | Non-AI | Implementation                              |
| --------------------- | --------------------------- | ---------------------------------- | ------ | ------------------------------------------- |
| Syntax highlighting   | Open ansible file           | Grammars + injections              | yes    | `syntaxes/`, `package.json`                 |
| File association      | Open/save YAML              | Modeline + playbook heuristic      | yes    | `features/fileAssociation.ts`               |
| Auto-completion       | Ctrl+Space                  | Modules, options, inventory, Jinja | yes    | `language-server/.../completionProvider.ts` |
| Hover                 | Mouse over symbol           | Plugin docs markdown               | yes    | `hoverProvider.ts`                          |
| Semantic tokens       | Theme                       | Modules, keywords, properties      | yes    | `semanticTokenProvider.ts`                  |
| YAML diagnostics      | Edit/save                   | Parse errors                       | yes    | `validationProvider.ts`                     |
| ansible-lint          | Edit/save                   | Lint squiggles                     | yes    | `services/ansibleLint.ts`                   |
| syntax-check fallback | Lint disabled               | `ansible-playbook --syntax-check`  | yes    | `services/ansiblePlaybook.ts`               |
| Vault encrypt/decrypt | `ansibleEnvironments.vault` | ansible-vault integration          | yes    | `features/vault.ts`                         |
| YAML/JSON schemas     | Edit config files           | galaxy.yml, molecule, EE, etc.     | yes    | `package.json` yamlValidation               |
| Go to definition      | —                           | **Not implemented**                | —      | todo: add-goto-definition-provider          |

**US:** US-18 | **AC:** AC-8

---

## Module 3: `collections-installed` — Installed Collections

| Feature               | Command / trigger                          | Description                 | Non-AI | Implementation              |
| --------------------- | ------------------------------------------ | --------------------------- | ------ | --------------------------- |
| Collections tree      | View: `ansibleDevToolsCollections`         | Collection → type → plugin  | yes    | `CollectionsController.ts`    |
| Refresh               | `ansibleDevToolsCollections.refresh`       | Reload index                | yes    |                             |
| Search plugins        | `ansibleDevToolsCollections.search`        | Keyword search              | yes    |                             |
| Plugin documentation  | `ansibleDevToolsCollections.showPluginDoc` | Rich doc webview            | yes    | `PluginDocPanel.ts`         |
| Sample task generator | Plugin Doc → Sample Task tab               | minimal / documented / full | yes    | `ui/.../SampleTaskView.tsx` |
| AI summary\*          | `ansibleDevToolsCollections.aiSummary`     | Chat prompt                 | no     | `extension.ts`              |

**US:** US-3 | **AC:** AC-2

---

## Module 4: `collections-remote` — Collection Sources

| Feature             | Command / trigger                                  | Description          | Non-AI | Implementation                 |
| ------------------- | -------------------------------------------------- | -------------------- | ------ | ------------------------------ |
| Sources tree        | View: `ansibleCollectionSources`                   | Galaxy + GitHub orgs | yes    | `CollectionSourcesController.ts` |
| Search collections  | `ansibleCollectionSources.search`                  | Unified search       | yes    |                                |
| Filter Galaxy       | `ansibleCollectionSources.filterGalaxyCollections` | Filter list          | yes    |                                |
| Galaxy plugin docs  | `ansibleCollectionSources.showGalaxyPluginDoc`     | Uninstalled docs     | yes    | `GalaxyDocsCache`              |
| GitHub plugin docs  | `ansibleCollectionSources.showGitHubPluginDoc`     | SCM docs             | yes    | `SCMDocsCache`                 |
| Install from Galaxy | `ansibleCollectionSources.installGalaxyCollection` | via `ade`            | yes    |                                |
| Add GitHub org      | `ansibleCollectionSources.addSource`               | Settings-driven      | yes    |                                |
| AI summaries\*      | various `aiSummary` commands                       | Chat prompts         | no     |                                |

**US:** US-4 | **AC:** AC-2

---

## Module 5: `creator` — Content Scaffolding

| Feature          | Command / trigger          | Description              | Non-AI | Implementation           |
| ---------------- | -------------------------- | ------------------------ | ------ | ------------------------ |
| Creator tree     | View: `ansibleCreator`     | ansible-creator commands | yes    | `CreatorController.ts`     |
| Open form        | `ansibleCreator.openForm`  | Schema-driven webview    | yes    | `CreatorFormPanel.ts`    |
| Live CLI preview | Creator form               | Exact command preview    | yes    | `@ansible/ui` SchemaForm |
| AI overview\*    | `ansibleCreator.aiSummary` | Chat prompt              | no     |                          |

**US:** US-5 | **AC:** AC-3

---

## Module 6: `playbooks` — Playbook Execution

| Feature               | Command / trigger                  | Description                  | Non-AI | Implementation             |
| --------------------- | ---------------------------------- | ---------------------------- | ------ | -------------------------- |
| Playbooks tree        | View: `ansiblePlaybooks`           | Workspace playbook discovery | yes    | `PlaybooksController.ts`     |
| Go to play            | `ansiblePlaybooks.goToPlay`        | Editor navigation            | yes    |                            |
| Edit config           | `ansiblePlaybooks.editConfig`      | Per-playbook run form        | yes    | `PlaybookConfigPanel.ts`   |
| Edit defaults         | `ansiblePlaybooks.editDefaults`    | Global defaults form         | yes    |                            |
| Run playbook          | `ansiblePlaybooks.run`             | Integrated terminal          | yes    |                            |
| Progress viewer       | `ansiblePlaybooks.runWithProgress` | Real-time tree + stats       | yes    | `PlaybookProgressPanel.ts` |
| Failure AI analysis\* | Progress panel                     | Analyze failed task          | no     |                            |
| AI summary\*          | `ansiblePlaybooks.aiSummary`       | Chat prompt                  | no     |                            |

**US:** US-6 | **AC:** AC-4

---

## Module 7: `execution-envs` — Execution Environments

| Feature        | Command / trigger                                | Description                  | Non-AI | Implementation                     |
| -------------- | ------------------------------------------------ | ---------------------------- | ------ | ---------------------------------- |
| EE tree        | View: `ansibleExecutionEnvironments`             | Images via ansible-navigator | yes    | `ExecutionEnvironmentsController.ts` |
| EE detail      | `ansibleExecutionEnvironments.showDetail`        | Metadata webview             | yes    | `EEDetailPanel.ts`                 |
| Package detail | `ansibleExecutionEnvironments.showPackageDetail` | Python/system packages       | yes    | `PackageDetailPanel.ts`            |
| AI summary\*   | `ansibleExecutionEnvironments.aiSummary`         | Chat prompt                  | no     |                                    |

**US:** US-7 | **AC:** AC-5

---

## Module 8: `ai-authoring` — AI Content Authoring

| Feature               | Trigger                              | Description                  | Implementation                                |
| --------------------- | ------------------------------------ | ---------------------------- | --------------------------------------------- |
| AI summaries          | Sparkle icons on views/items         | One-click chat prompts       | `extension.ts`, `packages/common/src/skills/` |
| Chat integration      | Use in Chat buttons                  | Copilot or Open LLM Provider | `LlmService.ts`                               |
| Plugin doc AI builder | Plugin Doc toolbar                   | Task from schema             | `PluginDocView.tsx`                           |
| LLM selection         | `ansibleEnvironments.selectLlmModel` | Provider/model pick          | `LlmService.ts`                               |
| LLM status            | `ansibleEnvironments.showLlmStatus`  | Status webview               |                                               |

Builtin skills (13): Build Ansible Task, Explain Plugin, Summarize Playbook, etc.
See `packages/common/src/skills/`.

**US:** US-8–11 | **AC:** AC-6 | **Requires AI**

---

## Module 9: `mcp-skills` — MCP & Skills

| Feature                | Command / trigger                         | Description                                            | Implementation         |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------ | ---------------------- |
| AI Tools tree          | View: `ansibleMcpTools`                   | MCP tools by category                                  | `McpToolsController.ts`  |
| Use in Chat            | `ansibleMcpTools.useInChat`               | Inject tool prompt                                     |                        |
| Copy prompt            | `ansibleMcpTools.copyPrompt`              | Opens chat with pre-filled prompt (clipboard fallback) |                        |
| AI Skills tree         | View: `ansibleSkills`                     | External + builtin skills                              | `SkillsController.ts`    |
| MCP status             | `ansible-environments.showMcpStatus`      | Connection webview                                     | `mcp/cursorConfig.ts`  |
| Configure Cursor MCP   | `ansible-environments.configureCursorMcp` | Guided setup                                           |                        |
| MCP server (23+ tools) | External agent                            | Discovery, generation, EE, creator                     | `packages/mcp-server/` |

**US:** US-18 | **AC:** AC-8 | **Requires AI features enabled**

---

## Module 10: `lightspeed` — Ansible Lightspeed

| Feature               | Command / trigger                        | Description          | Implementation         |
| --------------------- | ---------------------------------------- | -------------------- | ---------------------- |
| Lightspeed view       | View: `ansibleLightspeed`                | Auth-aware shortcuts | `packages/lightspeed/` |
| Sign in               | `ansible.lightspeed.oauth`               | OAuth                |                        |
| Generate playbook     | `ansible.lightspeed.playbookGeneration`  | Webview panel        |                        |
| Generate role         | `ansible.lightspeed.roleGeneration`      | Webview panel        |                        |
| Explain playbook/role | `ansible.lightspeed.playbookExplanation` | Explanation panel    |                        |
| Inline suggestions    | Type in task                             | Ghost text           | `inlineSuggestions.ts` |
| Lightspeed status bar | Click when unauthenticated               | Sign-in prompt       |                        |

**Requires:** `ansible.lightspeed.enabled = true`

---

## Module 11: `cross-cutting` — Cross-Cutting UX

| Area                      | What to verify                                                   | Non-AI |
| ------------------------- | ---------------------------------------------------------------- | ------ |
| `enableAiFeatures` toggle | Core views work with AI off                                      | yes    |
| Empty states              | Helpful messaging, next actions                                  | yes    |
| Error states              | Missing tools (navigator, ade)                                   | yes    |
| Settings                  | `ansibleEnvironments.*`, `ansible.lightspeed.*`, LSP `ansible.*` | yes    |
| Extension dependencies    | Python + YAML extensions required                                | yes    |
| Best practices            | Embedded in prompts and scaffolding                              | yes    |

**US:** US-18, US-19 | **AC:** AC-8

---

## Counts summary

| Category           |                         Count |
| ------------------ | ----------------------------: |
| VS Code commands   |                           68+ |
| Tree views         |                            10 |
| Webview panels     |                            11 |
| LSP features       | 12 (go-to-definition pending) |
| Extension settings |                            13 |
| LSP settings       |                            10 |
| Static MCP tools   |                            21 |
| Skill MCP tools    |                             4 |
| Builtin AI skills  |                            13 |
