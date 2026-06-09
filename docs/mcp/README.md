# Ansible Development Tools MCP Server

The Ansible Development Tools MCP (Model Context Protocol) Server enables AI assistants and language models to interact with Ansible tooling through a standardized protocol. It provides intelligent automation capabilities for Ansible development workflows.

## What is MCP?

The Model Context Protocol (MCP) is an open protocol that standardizes how AI applications interact with external tools and data sources. The Ansible Development Tools MCP Server implements this protocol to expose Ansible development tools to AI assistants.

## Features

The MCP server provides the following capabilities:

### Information & Documentation

- **Zen of Ansible**: Access Ansible's design philosophy and principles
- **Best Practices**: Get comprehensive guidelines for writing quality Ansible content
- **Tool Discovery**: List all available MCP tools and their capabilities

### Environment Management

- **Environment Info**: Check Python, Ansible, and development tool versions
- **Setup Automation**: Automatically configure virtual environments and install dependencies
- **Tool Installation**: Install and verify Ansible Development Tools (ADT)

### Project Scaffolding

- **Playbook Creation**: Generate new Ansible playbooks with proper structure
- **Collection Creation**: Scaffold new Ansible collections with best practices

### Code Quality

- **Ansible Lint**: Automated linting with fix capabilities
- **Execution Environment Builder**: Create and validate execution environment definitions

### Playbook Execution

- **Ansible Navigator**: Execute playbooks with smart environment detection and container management

## Getting Started

The MCP server is currently available as a technical preview.

The server runs as a child process and communicates via stdio transport.

### Requirements

- Python 3.11 or higher
- Node.js 24 or higher (for the npm package)
- Ansible development tools (can be auto-installed)

### Client Configuration

There are two ways to run the MCP server: the **npm package** (requires
Node.js 24+) or the **container image** (requires Docker or Podman, no
Node.js needed on the host).

#### Option A: npm Package (npx)

This is the simplest approach when Node.js 24+ is already installed.

##### Claude Desktop

Add to `claude_desktop_config.json` (macOS: `~/Library/Application
Support/Claude/`, Linux: `~/.config/Claude/`):

```json
{
  "mcpServers": {
    "ansible": {
      "command": "npx",
      "args": [
        "-y",
        "@ansible/ansible-mcp-server",
        "--stdio"
      ],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/ansible/project"
      }
    }
  }
}
```

##### Claude Code

```bash
claude mcp add ansible -- npx -y @ansible/ansible-mcp-server --stdio
```

Set `WORKSPACE_ROOT` by passing `--env WORKSPACE_ROOT=/path/to/project`
or it defaults to the current directory.

##### IBM Bob IDE / Shell

Add to `~/.bob/mcp_settings.json` (global) or `.bob/mcp.json`
(project-level):

```json
{
  "mcpServers": {
    "ansible": {
      "command": "npx",
      "args": ["-y", "@ansible/ansible-mcp-server", "--stdio"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/ansible/project"
      }
    }
  }
}
```

##### Gemini CLI

Add to `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ansible": {
      "command": "npx",
      "args": ["-y", "@ansible/ansible-mcp-server", "--stdio"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/ansible/project"
      }
    }
  }
}
```

##### Cursor IDE

When using the **Ansible VS Code extension**, the MCP server starts
automatically—no manual configuration is required. Enable it in
settings:

```json
{
  "ansible.mcpServer.enabled": true
}
```

To use the MCP server **without** the extension (standalone), add a
`.cursor/mcp.json` file to your project root:

```json
{
  "mcpServers": {
    "ansible": {
      "command": "npx",
      "args": [
        "-y",
        "@ansible/ansible-mcp-server",
        "--stdio"
      ],
      "env": {
        "WORKSPACE_ROOT": "."
      }
    }
  }
}
```

##### VS Code (Copilot Chat)

Add an entry in your user or workspace `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "ansible": {
        "command": "npx",
        "args": [
          "-y",
          "@ansible/ansible-mcp-server",
          "--stdio"
        ],
        "env": {
          "WORKSPACE_ROOT": "${workspaceFolder}"
        }
      }
    }
  }
}
```

#### Option B: Container Image

A pre-built container image is published to `ghcr.io` on every release.
This option requires **Docker** or **Podman** but does _not_ require
Node.js on the host.

```text
ghcr.io/ansible/devtools-mcp-server:<tag>
```

Available tags: `latest`, semver (`1.2.3`, `1.2`), and Git SHA.

##### Claude Desktop (container)

```json
{
  "mcpServers": {
    "ansible": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/your/ansible/project:/workspace",
        "-e", "WORKSPACE_ROOT=/workspace",
        "ghcr.io/ansible/devtools-mcp-server:latest",
        "--stdio"
      ]
    }
  }
}
```

Replace `docker` with `podman` if preferred. Add `:ro` to the
volume mount if you only need read-only access.

##### Claude Code (container)

```bash
claude mcp add ansible -- docker run --rm -i \
  -v /path/to/your/ansible/project:/workspace \
  -e WORKSPACE_ROOT=/workspace \
  ghcr.io/ansible/devtools-mcp-server:latest --stdio
```

##### IBM Bob IDE / Shell (container)

Add to `~/.bob/mcp_settings.json` or `.bob/mcp.json`:

```json
{
  "mcpServers": {
    "ansible": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/your/ansible/project:/workspace",
        "-e", "WORKSPACE_ROOT=/workspace",
        "ghcr.io/ansible/devtools-mcp-server:latest",
        "--stdio"
      ]
    }
  }
}
```

##### Gemini CLI (container)

Add to `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ansible": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/your/ansible/project:/workspace",
        "-e", "WORKSPACE_ROOT=/workspace",
        "ghcr.io/ansible/devtools-mcp-server:latest",
        "--stdio"
      ]
    }
  }
}
```

##### Cursor IDE (container)

Add a `.cursor/mcp.json` file to your project root:

```json
{
  "mcpServers": {
    "ansible": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/your/ansible/project:/workspace",
        "-e", "WORKSPACE_ROOT=/workspace",
        "ghcr.io/ansible/devtools-mcp-server:latest",
        "--stdio"
      ]
    }
  }
}
```

##### VS Code (Copilot Chat, container)

```json
{
  "mcp": {
    "servers": {
      "ansible": {
        "command": "docker",
        "args": [
          "run", "--rm", "-i",
          "-v", "${workspaceFolder}:/workspace",
          "-e", "WORKSPACE_ROOT=/workspace",
          "ghcr.io/ansible/devtools-mcp-server:latest",
          "--stdio"
        ]
      }
    }
  }
}
```

#### Environment Variables

| Variable         | Description                                   | Default |
| ---------------- | --------------------------------------------- | ------- |
| `WORKSPACE_ROOT` | Path to the Ansible project directory          | `.`     |
| `NODE_OPTIONS`   | Extra Node.js flags (npm package only)         | —       |

#### Verifying the Server

You can test that the server starts correctly by sending an MCP
`initialize` request over stdio:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' \
  | npm exec -- ansible-mcp-server --stdio
```

Or with the container:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' \
  | docker run --rm -i ghcr.io/ansible/devtools-mcp-server:latest --stdio
```

The response should contain `"serverInfo"` with `"name":
"ansible-mcp-server"`.

## Architecture

```text
┌─────────────────┐
│  AI Assistant   │
└────────┬────────┘
         │ MCP Protocol
         │ (JSON-RPC 2.0)
┌────────▼────────────────────┐
│  Ansible Development Tools  │
│         MCP Server          │
└────────┬────────────────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼──────┐
│Ansible│ │ Ansible │
│ Tools │ │  APIs   │
└───────┘ └─────────┘
```

### Usage with AI Assistants

The MCP server integrates with AI assistants that support the Model Context Protocol. When configured, AI assistants can:

- Answer questions about Ansible best practices
- Help set up development environments
- Generate and validate Ansible content
- Lint and fix playbook issues
- Execute playbooks with intelligent error handling
