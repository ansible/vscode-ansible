# Ansible

A VS Code extension for managing Ansible development environments, leveraging the [Microsoft Python Environments extension](https://github.com/microsoft/vscode-python-environments) API.

## Architecture

The extension uses a multi-package architecture with pnpm workspaces:

```text
packages/
  common/           # @ansible/common — browser-safe types, prompts, utils, parsers
  services/         # @ansible/developer-services — Node.js service implementations
  language-server/  # @ansible/language-server — LSP server
  mcp-server/       # @ansible/mcp-server — standalone MCP server
  lightspeed/       # @ansible/lightspeed — Lightspeed AI features
  ui/               # @ansible/ui — shared React webview components
docs/               # Project documentation (Starlight site)
src/                # Extension host (views, panels, commands)
```

`@ansible/common` contains browser-safe types, prompts, and utilities with no Node.js or VS Code dependency. `@ansible/developer-services` contains Node.js service implementations. The MCP server and extension host both consume these packages, so the same logic runs in VS Code and as a standalone CLI tool.

## Features

### Ansible (Activity Bar)

The extension adds an **Ansible** icon to the Activity Bar that opens the **Ansible**
sidebar — an accordion (one section open at a time, collapsed by default). Sections include:

- **Environment Managers** — Python environments by manager; select, create, refresh
- **Ansible Dev Tools** — installed `ansible-dev-tools` packages; install / upgrade
- **Installed Collections** — collections → plugin types → plugins; docs and search
- **Collection Sources** — Galaxy and GitHub orgs; search and install
- **Execution Environments** — local EE images via `ansible-navigator`; expandable details
- **Creator** — `ansible-creator` init/add commands with schema-driven forms
- **Playbooks** — workspace discovery, configure, run
- **AI Tools / AI Skills / Lightspeed** — when the corresponding feature flags are enabled

Issue-driven open: when Python or ansible-dev-tools is missing, the Ansible sidebar suggests opening
the relevant section with welcome actions.

### Plugin Documentation Viewer

Click any plugin in Installed Collections or Collection Sources to open a rich documentation webview:

- **Synopsis** — description, requirements, author information
- **Parameters** — collapsible tree with types, defaults, choices, and descriptions
- **Notes** — additional usage notes
- **Examples** — YAML tasks with copy buttons, formatted/raw toggle
- **Return Values** — documented returns with samples
- Configurable zoom (50–200%) and theme (auto/light/dark)

## MCP Server

The extension includes a standalone MCP server (`@ansible/mcp-server`) that exposes Ansible tools to AI agents.

### Available Tools

| Tool                           | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `search_ansible_plugins`       | Search plugins by keyword                    |
| `get_plugin_documentation`     | Get full plugin documentation                |
| `list_ansible_collections`     | List installed collections                   |
| `install_ansible_collection`   | Install a collection from Galaxy             |
| `search_available_collections` | Search Galaxy for collections                |
| `list_source_collections`      | List collections from GitHub sources         |
| `get_collection_plugins`       | List plugins in a collection                 |
| `generate_ansible_task`        | Generate task YAML (one-shot)                |
| `build_ansible_task`           | Interactive task building with guided params |
| `generate_ansible_playbook`    | Generate a complete playbook                 |
| `list_execution_environments`  | List available EE images                     |
| `get_ee_details`               | Inspect EE collections and packages          |
| `list_ansible_dev_tools`       | List installed dev tools                     |
| `get_ansible_creator_schema`   | Get creator command schema                   |
| `get_ansible_best_practices`   | Get Ansible coding guidelines                |
| `ac_*`                         | Dynamic tools from `ansible-creator schema`  |

### Using with Cursor

**Automatic Configuration:**

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run: **Ansible: Configure Cursor MCP**
3. Choose Global or Workspace configuration
4. Restart Cursor

**Manual Configuration:**

Add to `.cursor/mcp.json`:

```json
{
    "mcpServers": {
        "ansible-environments": {
            "command": "node",
            "args": ["/path/to/ansible-environments/packages/mcp-server/out/server.js"]
        }
    }
}
```

### Using with VS Code Copilot

The extension automatically registers as an MCP server provider in VS Code 1.99+. No configuration needed.

### Running Standalone

```bash
node packages/mcp-server/out/server.js
```

## Requirements

- VS Code 1.93.0 or later
- Node.js >= 20 (for development)
- [Microsoft Python Environments](https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-python-envs) extension
- Python 3.9 or later
- For Execution Environments: `ansible-navigator` and a container runtime (Podman/Docker)

## Extension Settings

| Setting                                    | Default                                            | Description                                           |
| ------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| `ansibleEnvironments.enableAiFeatures`     | `true`                                             | Enable AI enhancements (AI Tools view, sparkle icons) |
| `ansibleEnvironments.pluginDocZoom`        | `100`                                              | Plugin doc viewer zoom (50–200%)                      |
| `ansibleEnvironments.pluginDocTheme`       | `auto`                                             | Plugin doc theme (auto/light/dark)                    |
| `ansibleEnvironments.githubCollectionOrgs` | `["ansible", "ansible-collections", "redhat-cop"]` | GitHub orgs to scan for collections                   |
| `ansibleEnvironments.llm.chatProvider`     | `vscode`                                           | Chat UI provider (vscode or abbenay)                  |
| `ansibleEnvironments.llm.provider`         | `""`                                               | LLM provider/vendor (advanced)                        |
| `ansibleEnvironments.llm.model`            | `""`                                               | LLM model ID (advanced)                               |

## Development

### Setup

```bash
pnpm install --frozen-lockfile   # Install dependencies (reproducible lockfile resolution)
pnpm run compile                 # Skill codegen + tsc -b (all packages)
pnpm run build                   # esbuild bundling
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full onboarding guide.

### Running

Press `F5` to launch a VS Code Extension Development Host with the extension loaded.

### Testing

```bash
pnpm test              # Run unit tests (Vitest)
pnpm run test:coverage # Run with coverage (thresholds enforced)
pnpm run test:ui       # Run e2e tests (WebDriverIO + VS Code)
pnpm run ci            # Full CI mirror: compile + lint + test:coverage + build
```

The test suite uses:

- **Vitest** for unit tests across all packages
- **WebDriverIO** with `wdio-vscode-service` for e2e tests against a real VS Code instance

### Building

```bash
pnpm run package             # Package the extension as a VSIX
pnpm run package:install     # Package and install into VS Code for testing
```

### Alpha releases (VSIX on GitHub)

Publishing a **pre-release** on GitHub triggers Actions to build the VSIX and attach it to that release (see `.github/workflows/release-vsix.yml`).

1. Bump `version` in `package.json` on the commit you are releasing (the VSIX name and manifest use this field).
2. Create and push a tag for that commit (for example `v0.0.1-alpha.1`).
3. On GitHub, create a **Release** from that tag, enable **Set as a pre-release**, then **Publish release**. The workflow uploads `*.vsix` to the release assets.

Stable releases are not wired to this workflow; only pre-releases run the upload job.

## Data and Telemetry

The Ansible extension collects anonymous [usage data](USAGE_DATA.md) and sends
it to Red Hat servers to help improve our products and services. Read our
[privacy statement](https://developers.redhat.com/article/tool-data-collection)
to learn more. This extension respects the `redhat.telemetry.enabled` setting
which you can learn more about at
[How to disable telemetry reporting](https://github.com/redhat-developer/vscode-redhat-telemetry#how-to-disable-telemetry-reporting).
Telemetry is also gated by VS Code's global `telemetry.telemetryLevel` setting —
both must allow collection for events to be sent.

## License

MIT
