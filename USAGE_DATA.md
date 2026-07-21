# Data collection

`vscode-ansible` has opt-in telemetry collection, provided by
[vscode-redhat-telemetry](https://github.com/redhat-developer/vscode-redhat-telemetry).

## Dual-stream architecture

The extension has two independent telemetry pipelines:

| Pipeline                     | Route                                      | Segment source            | Amplitude destination          |
| ---------------------------- | ------------------------------------------ | ------------------------- | ------------------------------ |
| **Extension (client-side)**  | VS Code extension -> Segment -> Amplitude  | Extension-specific source | Extension-specific destination |
| **Lightspeed (server-side)** | Lightspeed service -> Segment -> Amplitude | Lightspeed service source | Lightspeed service destination |

These are separate Segment sources and Amplitude destinations. There is no
data overlap. Journey events may include a coarse `result` property
(`success` | `cancel` | `error`) plus optional `durationMs` / `errorCode`.
Host counts and collection identity remain deferred pending metrics/schema
coordination.

## What's included in the vscode-ansible telemetry data

The extension records anonymous usage events when `redhat.telemetry.enabled`
is `true` and VS Code's global telemetry level allows it. No personally
identifiable information (PII) is collected. File paths and usernames in
event properties are automatically sanitized by the Red Hat telemetry library.

### Lifecycle

| Event                 | Description                                                   | Properties                         |
| --------------------- | ------------------------------------------------------------- | ---------------------------------- |
| `startup`             | Extension startup (sent by Red Hat telemetry library)         | Standard Red Hat startup metadata  |
| `shutdown`            | Extension shutdown with session duration (sent automatically) | Standard Red Hat shutdown metadata |
| `extension.activated` | Ansible extension finished activation                         | —                                  |

### Commands

| Event              | Description                             | Properties                               |
| ------------------ | --------------------------------------- | ---------------------------------------- |
| `command.executed` | A tracked extension command was invoked | `commandId` — VS Code command identifier |

### Environments

| Event        | Description                                | Properties                                                                      |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `env.create` | Environment creation finished (completion) | `result` — `success` \| `cancel` \| `error`; optional `durationMs`, `errorCode` |
| `env.select` | User selected a Python environment         | —                                                                               |

### Collections

| Event                | Description                              | Properties                                                                                |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `collection.install` | Collection install finished or cancelled | `result` — `success` \| `cancel` \| `error`; optional `durationMs`, `errorCode` (no FQCN) |
| `collection.search`  | User searched for collections            | —                                                                                         |

### Playbooks

| Event                      | Description                             | Properties                                                                                        |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `playbook.run`             | Playbook terminal launch finished       | `result` — launch outcome (`success` \| `error`); optional `durationMs`, `errorCode`              |
| `playbook.runWithProgress` | Progress-viewer run finished or stopped | `result` — ansible outcome (`success` \| `cancel` \| `error`); optional `durationMs`, `errorCode` |

### Creator

| Event              | Description                            | Properties                                                                                                        |
| ------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `creator.formOpen` | User opened an ansible-creator form    | `command` — creator command name                                                                                  |
| `creator.complete` | Scaffold execute finished or cancelled | `result` — `success` \| `cancel` \| `error`; `command` — creator command name; optional `durationMs`, `errorCode` |

### Vault

| Event       | Description                              | Properties |
| ----------- | ---------------------------------------- | ---------- |
| `vault.use` | User invoked vault encryption/decryption | —          |

### Plugin documentation

| Event            | Description                      | Properties |
| ---------------- | -------------------------------- | ---------- |
| `pluginDoc.view` | User opened plugin documentation | —          |

### AI features

| Event               | Description                  | Properties                                    |
| ------------------- | ---------------------------- | --------------------------------------------- |
| `ai.summaryRequest` | User requested an AI summary | `domain` — feature area (e.g., `collections`) |

### MCP

| Event               | Description                     | Properties                                                                      |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| `mcp.toolUseInChat` | MCP tool prompt inject finished | `toolName`; `result` — `success` \| `error`; optional `durationMs`, `errorCode` |
| `mcp.configure`     | User configured MCP integration | —                                                                               |

### Skills

| Event              | Description                  | Properties                                                          |
| ------------------ | ---------------------------- | ------------------------------------------------------------------- |
| `skill.useInChat`  | Skill prompt inject finished | `result` — `success` \| `error`; optional `durationMs`, `errorCode` |
| `skill.promptCopy` | Skill prompt copy finished   | `result` — `success` \| `error`; optional `durationMs`, `errorCode` |

### LLM

| Event                   | Description                     | Properties |
| ----------------------- | ------------------------------- | ---------- |
| `llm.modelSelect`       | User selected an LLM model      | —          |
| `llm.providerConfigure` | User configured an LLM provider | —          |

### Execution environments

| Event           | Description                               | Properties |
| --------------- | ----------------------------------------- | ---------- |
| `ee.detailView` | User viewed execution environment details | —          |

### Walkthroughs

| Event              | Description               | Properties                               |
| ------------------ | ------------------------- | ---------------------------------------- |
| `walkthrough.open` | User opened a walkthrough (status bar **Get Started**, `Ansible: Get Started`, or telemetry open helper) | `walkthroughId` — e.g. `redhat.ansible#ansible-getting-started` |

### Ansible Lightspeed (when enabled)

When `ansible.lightspeed.enabled` is `true`, Lightspeed events are also
reported through the same telemetry pipeline:

| Event                               | Description                       |
| ----------------------------------- | --------------------------------- |
| `lightspeed.suggestion.accepted`    | Inline suggestion accepted        |
| `lightspeed.suggestion.rejected`    | Inline suggestion rejected        |
| `lightspeed.suggestion.ignored`     | Inline suggestion ignored         |
| `lightspeed.generation.open`        | Generation panel opened           |
| `lightspeed.generation.close`       | Generation panel closed           |
| `lightspeed.generation.transition`  | Generation panel state transition |
| `lightspeed.generation.accept`      | Generated content accepted        |
| `lightspeed.explanation.requested`  | Code explanation requested        |
| `lightspeed.feedback.thumbsUp`      | Positive feedback submitted       |
| `lightspeed.feedback.thumbsDown`    | Negative feedback submitted       |
| `lightspeed.contentMatches.fetched` | Content matches retrieved         |

## Story-to-event mapping

Product telemetry events map to **functional** user stories in
`.sdlc/user-stories.yaml` (`ENV-*`, `COL-*`, `LS-*`, etc.). The closed
loop is: functional story → WDIO `@covers` → this mapping row → emit
event. Use the `telemetry-audit` agent skill to validate this mapping.

Do **not** invent meta `TEL-*` stories for telemetry. Orphans should be
mapped to an existing product story, covered by a new developer-persona
UX story, marked as platform baseline, or removed.

### Platform baseline

These events are infrastructure / library lifecycle and do **not** require
a product story:

| Event                    | Event key          | Notes                                          |
| ------------------------ | ------------------ | ---------------------------------------------- |
| Extension startup        | `startup`          | Sent by Red Hat telemetry library              |
| Extension shutdown       | `shutdown`         | Sent automatically with session duration       |
| Tracked command executed | `command.executed` | Generic command wrapper (`commandId` property) |

### Extension `TelemetryEvents`

| Event                      | Event key                  | User story                                          | Status |
| -------------------------- | -------------------------- | --------------------------------------------------- | ------ |
| Extension activated        | `extension.activated`      | [XC-001] Extension activation and sidebar           | Mapped |
| Environment create         | `env.create`               | [ENV-002] Create virtual environment                | Mapped |
| Environment select         | `env.select`               | [ENV-003] Select Python environment                 | Mapped |
| Collection install         | `collection.install`       | [COL-007] Install collection from sidebar           | Mapped |
| Collection search          | `collection.search`        | [COL-005] Search remote collections                 | Mapped |
| Playbook run               | `playbook.run`             | [PLB-003] Run playbook in terminal                  | Mapped |
| Playbook run with progress | `playbook.runWithProgress` | [PLB-004] Real-time playbook progress visualization | Mapped |
| Creator form open          | `creator.formOpen`         | [SCF-001] Scaffold new Ansible content              | Mapped |
| Creator complete           | `creator.complete`         | [SCF-001] Scaffold new Ansible content              | Mapped |
| Vault use                  | `vault.use`                | [LSP-007] Vault encrypt and decrypt                 | Mapped |
| Plugin doc view            | `pluginDoc.view`           | [COL-003] View plugin documentation                 | Mapped |
| AI summary request         | `ai.summaryRequest`        | [AI-001] / [PLB-006] / [EE-003] (via `domain`)      | Mapped |
| MCP tool use in chat       | `mcp.toolUseInChat`        | [AI-008] Browse and use MCP tools                   | Mapped |
| MCP configure              | `mcp.configure`            | [AI-009] Configure MCP for external AI clients      | Mapped |
| Skill use in chat          | `skill.useInChat`          | [AI-010] Browse AI skills                           | Mapped |
| Skill prompt copy          | `skill.promptCopy`         | [AI-010] Browse AI skills                           | Mapped |
| LLM model select           | `llm.modelSelect`          | [AI-007] Select LLM model and provider              | Mapped |
| LLM provider configure     | `llm.providerConfigure`    | [AI-007] Select LLM model and provider              | Mapped |
| EE detail view             | `ee.detailView`            | [EE-002] Inspect EE contents                        | Mapped |
| Walkthrough open           | `walkthrough.open`         | [XC-004] Open guided walkthroughs                   | Mapped |

### Lightspeed events

| Event                       | Event key                           | User story                                | Status |
| --------------------------- | ----------------------------------- | ----------------------------------------- | ------ |
| Inline suggestion accepted  | `lightspeed.suggestion.accepted`    | [LS-005] Inline code suggestions          | Mapped |
| Inline suggestion rejected  | `lightspeed.suggestion.rejected`    | [LS-005] Inline code suggestions          | Mapped |
| Inline suggestion ignored   | `lightspeed.suggestion.ignored`     | [LS-005] Inline code suggestions          | Mapped |
| Generation panel opened     | `lightspeed.generation.open`        | [LS-002] Generate playbook via Lightspeed | Mapped |
| Generation panel closed     | `lightspeed.generation.close`       | [LS-002] / [LS-003] Generation lifecycle  | Mapped |
| Generation step transition  | `lightspeed.generation.transition`  | [LS-002] / [LS-003] Generation lifecycle  | Mapped |
| Generation content accepted | `lightspeed.generation.accept`      | [LS-002] / [LS-003] Generation lifecycle  | Mapped |
| Explanation requested       | `lightspeed.explanation.requested`  | [LS-004] Explain playbook via Lightspeed  | Mapped |
| Feedback thumbs up          | `lightspeed.feedback.thumbsUp`      | [LS-005] Inline code suggestions          | Mapped |
| Feedback thumbs down        | `lightspeed.feedback.thumbsDown`    | [LS-005] Inline code suggestions          | Mapped |
| Content matches fetched     | `lightspeed.contentMatches.fetched` | [LS-005] Inline code suggestions          | Mapped |

### Orphan events

No orphan events. All product events map to a functional user story;
platform baseline events are documented separately above.

## What's included in the general telemetry data

Please see the
[vscode-redhat-telemetry data collection information](https://github.com/redhat-developer/vscode-redhat-telemetry/blob/HEAD/USAGE_DATA.md)
for information on common metadata collected with every event (OS, VS Code
version, extension version, locale, etc.).

## How to opt in or out

Use the `redhat.telemetry.enabled` setting to enable or disable telemetry
collection. The first time a Red Hat telemetry-enabled extension runs, VS Code
may prompt you to opt in.

Note that this extension abides by Visual Studio Code's telemetry level: if
`telemetry.telemetryLevel` is set to `off`, then no telemetry events will be
sent to Red Hat, even if `redhat.telemetry.enabled` is set to `true`. If
`telemetry.telemetryLevel` is set to `error` or `crash`, only events
containing an error property will be sent to Red Hat.

See [How to disable telemetry reporting](https://github.com/redhat-developer/vscode-redhat-telemetry#how-to-disable-telemetry-reporting)
for more details.
