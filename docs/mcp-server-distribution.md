# Ansible MCP Server - Dynamic Distribution Guide

## 🎯 Overview

The Ansible MCP Server provides AI assistants with access to Ansible development
tools and wisdom. Here are multiple ways to make it available to users
dynamically.

## 🚀 Distribution Methods

### 1. **VSCode Extension Auto-Registration** ⭐ (Recommended)

**How it works**: When users install your VSCode Ansible extension, the MCP
server is automatically registered.

**Advantages**:

- ✅ Zero configuration for users
- ✅ Automatic updates with extension
- ✅ Works with any AI assistant that supports MCP
- ✅ Workspace-aware configuration

**Implementation**: Already implemented in `src/extension.ts`

### 2. **NPM Package Distribution**

Create a standalone NPM package that users can install globally:

```bash
# Users would run:
npm install -g @ansible/mcp-server

# Then configure in their MCP settings:
{
  "mcpServers": {
    "ansible-dev-tools": {
      "command": "ansible-mcp-server",
      "args": ["--stdio"]
    }
  }
}
```

### 3. **Docker Container**

Provide a Docker image for easy deployment:

```bash
# Users would run:
docker run -d --name ansible-mcp-server \
  -v /path/to/ansible/project:/workspace \
  ansible/mcp-server:latest
```

### 4. **GitHub Releases with Binaries**

Provide pre-compiled binaries for different platforms:

```bash
# Users download and configure:
curl -L https://github.com/ansible/vscode-ansible/releases/latest/download/ansible-mcp-server-linux -o ansible-mcp-server
chmod +x ansible-mcp-server
```

### 5. **MCP Server Registry** (Future)

When MCP server registries become available, publish there for discovery.

## 🔧 Current Implementation

### Extension-Based Registration

```typescript
// In src/extension.ts
const mcpServer = new vscode.McpStdioServerDefinition(
  "ansible-dev-tools",
  "node",
  [mcpCliPath, "--stdio"],
  {
    WORKSPACE_ROOT: workspaceRoot.fsPath,
    NODE_ENV: "production",
  },
);
```

### Features Provided

- **zen_of_ansible**: 20 aphorisms describing Ansible's design philosophy
- **Workspace awareness**: Automatically detects Ansible projects
- **Error handling**: Graceful fallback if server unavailable

## 📦 For End Users

### Automatic (Recommended)

1. Install the Ansible VSCode extension
2. MCP server is automatically available in AI assistants
3. No additional configuration needed

### Manual Configuration

If needed, users can manually add to their MCP configuration:

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "ansible-dev-tools": {
      "command": "node",
      "args": ["/path/to/extension/out/mcp/cli.js", "--stdio"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/ansible/project"
      }
    }
  }
}
```

**VSCode** (`~/.vscode/mcp.json`):

```json
{
  "mcpServers": {
    "ansible-dev-tools": {
      "command": "node",
      "args": ["/path/to/extension/out/mcp/cli.js", "--stdio"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/ansible/project"
      }
    }
  }
}
```

## 🎯 Next Steps

1. **Test the extension-based registration** with different AI assistants
2. **Consider NPM package** for standalone usage
3. **Add to extension marketplace** description
4. **Create user documentation** about MCP features
5. **Monitor usage** and gather feedback

## 🔍 Troubleshooting

### Common Issues

- **Node.js not found**: Ensure Node.js is in PATH or use absolute path
- **Permission errors**: Check file permissions on CLI script
- **Workspace detection**: Verify WORKSPACE_ROOT environment variable

### Debug Commands

```bash
# Test MCP server directly
node /path/to/cli.js --stdio

# Check if server responds
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node /path/to/cli.js --stdio
```
