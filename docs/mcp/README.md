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
- Node.js 18 or higher
- Ansible development tools (can be auto-installed)

### Starting the Server

The MCP server is automatically started by MCP-compatible AI assistants when configured. No manual installation or server management is required.

**For Cursor IDE:**

The extension automatically starts the MCP server when accessed from Cursor's MCP integration.

**For Claude Desktop:**

Add the following configuration to your Claude Desktop settings:

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

**For Claude Code:**

```bash
claude mcp add ansible -- npx -y @ansible/ansible-mcp-server --stdio
```

> **Note:** Set `WORKSPACE_ROOT` by passing `--env WORKSPACE_ROOT=/path/to/project` or it defaults to the current directory.

**For IBM Bob IDE:**

Add to `~/.bob/mcp_settings.json` (global) or `.bob/mcp.json` (project-level):

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

**For IBM Bob Shell:**

Same configuration format as IBM Bob IDE. Add to `~/.bob/mcp_settings.json` or `.bob/mcp.json`.

**For Gemini CLI:**

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
