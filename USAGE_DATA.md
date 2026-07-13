# Data collection

`vscode-ansible` has opt-in telemetry collection, provided by
[vscode-redhat-telemetry](https://github.com/redhat-developer/vscode-redhat-telemetry).

## What's included in the vscode-ansible telemetry data

The extension records anonymous usage events when `redhat.telemetry.enabled`
is `true` and VS Code's global telemetry level allows it. No personally
identifiable information (PII) is collected. File paths and usernames in
event properties are automatically sanitized by the Red Hat telemetry library.

### Lifecycle

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `startup` | Extension startup (sent by Red Hat telemetry library) | Standard Red Hat startup metadata |
| `shutdown` | Extension shutdown with session duration (sent automatically) | Standard Red Hat shutdown metadata |
| `extension.activated` | Ansible extension finished activation | — |

### Commands

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `command.executed` | A tracked extension command was invoked | `commandId` — VS Code command identifier |

### Environments

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `env.create` | User initiated Python environment creation | — |
| `env.select` | User selected a Python environment | — |

### Collections

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `collection.install` | User installed an Ansible collection | — |
| `collection.search` | User searched for collections | — |

### Playbooks

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `playbook.run` | User ran a playbook in the terminal | — |
| `playbook.runWithProgress` | User ran a playbook with the progress viewer | — |

### Creator

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `creator.formOpen` | User opened an ansible-creator form | `command` — creator command name |

### Vault

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `vault.use` | User invoked vault encryption/decryption | — |

### Plugin documentation

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `pluginDoc.view` | User opened plugin documentation | — |

### AI features

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `ai.summaryRequest` | User requested an AI summary | `domain` — feature area (e.g., `collections`) |

### MCP

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `mcp.toolUseInChat` | User injected an MCP tool prompt into chat | `toolName` — MCP tool identifier |
| `mcp.configure` | User configured MCP integration | — |

### Skills

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `skill.useInChat` | User injected a skill prompt into chat | — |
| `skill.promptCopy` | User copied a skill prompt | — |

### LLM

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `llm.modelSelect` | User selected an LLM model | — |
| `llm.providerConfigure` | User configured an LLM provider | — |

### Execution environments

| Event | Description | Properties |
| ----- | ----------- | ---------- |
| `ee.detailView` | User viewed execution environment details | — |

### Ansible Lightspeed (when enabled)

When `ansible.lightspeed.enabled` is `true`, Lightspeed events are also
reported through the same telemetry pipeline:

| Event | Description |
| ----- | ----------- |
| `lightspeed.suggestion.accepted` | Inline suggestion accepted |
| `lightspeed.suggestion.rejected` | Inline suggestion rejected |
| `lightspeed.suggestion.ignored` | Inline suggestion ignored |
| `lightspeed.generation.open` | Generation panel opened |
| `lightspeed.generation.close` | Generation panel closed |
| `lightspeed.generation.transition` | Generation panel state transition |
| `lightspeed.generation.accept` | Generated content accepted |
| `lightspeed.explanation.requested` | Code explanation requested |
| `lightspeed.feedback.thumbsUp` | Positive feedback submitted |
| `lightspeed.feedback.thumbsDown` | Negative feedback submitted |
| `lightspeed.contentMatches.fetched` | Content matches retrieved |

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
