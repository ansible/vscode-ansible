# Ansible Development Tools MCP Server

A standalone Model Context Protocol (MCP) server exposing Ansible Development
Tools for use with AI assistants. Provides tools, resources, and prompts for
Ansible development workflows in Cursor IDE and other MCP clients.

## Features

- **Ansible Linting**: Run ansible-lint with proper virtual environment support
- **Workspace Access**: Read files from your workspace for context
- **Expert Prompts**: Get structured Ansible expertise for fixing issues and
  learn about the Zen of Ansible
- **Development Tools**: Debug common issues with MCP environments

## Install

```bash
npm i -g @ansible/ansible-mcp-server
# or
pnpm add -g @ansible/ansible-mcp-server
# or
yarn global add @ansible/ansible-mcp-server
```

```

**Important**: Update the paths and replace `SYSTEM_PATH_HERE` with your actual
system PATH to ensure ansible-lint can be found in your virtual environment.

## Usage

### Inside Ansible VS Code extension

The Ansible MCP server ships with the Ansible extension. 

Activate through the command palette (CTRL+Shift+P) -> `MCP: List Servers`. 

Select "Ansible Development Tools MCP Server" and start the server.

To access tools, open the VS Code Chat and select "Add Context -> Tools". The Ansible MCP server tools will be available in the list for selection.

### Configuration for Cursor IDE

Add to your `~/.cursor/mcp.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ansible-mcp-server": {
      "command": "node",
      "args": [
        "/path/to/your/project/packages/ansible-mcp-server/dist/cli.js",
        "--stdio"
      ],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/project",
        "VIRTUAL_ENV": "/path/to/your/project/.venv",
        "PATH": "/path/to/your/project/.venv/bin:SYSTEM_PATH_HERE"
      },
      "disabled": false
    }
  }
}

### Command Line

- stdio (for MCP clients like Claude Desktop, Cursor):

```bash
WORKSPACE_ROOT=/abs/path/to/workspace ansible-mcp-server --stdio
```

## Virtual Environment Setup

For ansible-lint to work properly, ensure:

1. **Virtual environment exists**: `.venv/` in your workspace
2. **ansible-lint installed**: `pip install ansible-lint` in your venv
3. **PATH configured**: Include `<path-to-venv-bin>` in your MCP server configuration

## Tools

- `debug_env()` - Show PATH and environment info for debugging
- `zen_of_ansible()` - Display the 20 aphorisms of Ansible design philosophy
- `ansible_lint(file, extraArgs?)` - Run ansible-lint on workspace files

### ansible_lint Examples

```javascript
// Basic usage
{ file: "examples/playbooks/play1.yml" }

// With extra arguments
{ file: "examples/playbooks/play1.yml", extraArgs: ["--strict", "--verbose"] }
```

## Resources (POC)

- `workspace://file/{relPath}` - Read any file from the workspace for AI context

### Resource Examples

```
workspace://file/examples/playbooks/play1.yml
workspace://file/ansible.cfg
workspace://file/requirements.txt
```

## Prompts (POC, not currently operable)

- `ansible_fix_prompt(file, errorSummary)` - Get expert Ansible advice for
  fixing linting issues

### Prompt Usage in Cursor

Access via: `/ansible-mcp-server/ansible_fix_prompt`

Provides structured expert guidance for fixing ansible-lint violations with:

- Corrected YAML code
- Brief rationale for changes
- Best practices recommendations

## Troubleshooting

### ansible-lint not found

**Error**: `spawn ansible-lint ENOENT`

**Solutions**:

1. Install ansible-lint: `pip install ansible-lint`
2. Verify PATH includes virtual environment bin directory
3. Check MCP server environment configuration
4. Use `debug_env` tool to verify PATH

### MCP Server not starting

**Error**: 0 tools showing in Cursor

**Solutions**:

1. Verify file paths in mcp.json are absolute and correct
2. Check that dist/cli.js exists (run `npm run build`)
3. Ensure environment variables are properly set
4. Toggle MCP server off/on in Cursor settings

### Virtual Environment Issues

**Error**: Tools work but ansible-lint fails

**Solutions**:

1. Ensure VIRTUAL_ENV environment variable is set
2. Include virtual environment bin in PATH
3. Activate virtual environment before starting server manually
4. Use `debug_env` tool to verify configuration
