#!/usr/bin/env bash
set -euo pipefail

# Build the Open Plugin distributable from source skills and bundled servers.
# Output: dist/plugin/ directory and dist/ansible-devtools-plugin.zip artifact.
#
# Prerequisites: run `npm run build` first to produce dist/mcp-server.js
# and dist/language-server.js (esbuild single-file bundles).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLS_SRC="$ROOT_DIR/skills"
PLUGIN_DIR="$ROOT_DIR/dist/plugin"

VERSION="${PLUGIN_VERSION:-$(node -p "require('$ROOT_DIR/packages/mcp-server/package.json').version")}"

# Verify bundled servers exist
for server in mcp-server.js language-server.js; do
  if [[ ! -f "$ROOT_DIR/dist/$server" ]]; then
    echo "ERROR: dist/$server not found. Run 'npm run build' first." >&2
    exit 1
  fi
done

rm -rf "$PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR/.plugin" "$PLUGIN_DIR/.cursor-plugin" "$PLUGIN_DIR/.claude-plugin" \
         "$PLUGIN_DIR/skills" "$PLUGIN_DIR/servers"

# Copy bundled servers (single-file, zero dependencies)
cp "$ROOT_DIR/dist/mcp-server.js" "$PLUGIN_DIR/servers/mcp-server.js"
cp "$ROOT_DIR/dist/language-server.js" "$PLUGIN_DIR/servers/language-server.js"

# Copy each skill directory into skills/{name}/SKILL.md
for skill_dir in "$SKILLS_SRC"/*/; do
  skill_name="$(basename "$skill_dir")"
  if [[ -f "$skill_dir/SKILL.md" ]]; then
    mkdir -p "$PLUGIN_DIR/skills/$skill_name"
    cp "$skill_dir/SKILL.md" "$PLUGIN_DIR/skills/$skill_name/SKILL.md"
  fi
done

# Write plugin.json (identical for all hosts)
cat > "$PLUGIN_DIR/.plugin/plugin.json" <<EOF
{
  "name": "ansible-devtools",
  "version": "$VERSION",
  "description": "Ansible development toolkit — plugin discovery, documentation, task generation, scaffolding, and execution environments for AI agents.",
  "author": {
    "name": "Red Hat Ansible DevTools",
    "url": "https://github.com/ansible/vscode-ansible"
  },
  "homepage": "https://ansible.readthedocs.io/projects/vscode-ansible/",
  "repository": "https://github.com/ansible/vscode-ansible",
  "license": "MIT",
  "keywords": [
    "ansible",
    "automation",
    "devtools",
    "collections",
    "galaxy",
    "playbook",
    "task-generation",
    "execution-environments",
    "infrastructure-as-code"
  ]
}
EOF

# Cursor and Claude Code get identical manifests
cp "$PLUGIN_DIR/.plugin/plugin.json" "$PLUGIN_DIR/.cursor-plugin/plugin.json"
cp "$PLUGIN_DIR/.plugin/plugin.json" "$PLUGIN_DIR/.claude-plugin/plugin.json"

# Write .mcp.json — points to bundled server, no npm install needed
cat > "$PLUGIN_DIR/.mcp.json" <<EOF
{
  "mcpServers": {
    "ansible": {
      "command": "node",
      "args": ["\${PLUGIN_ROOT}/servers/mcp-server.js"],
      "env": {
        "ANSIBLE_SKILL_SOURCES": "[{\"type\":\"local\",\"path\":\"\${PLUGIN_ROOT}/skills\"}]"
      }
    }
  }
}
EOF

# Cursor expects mcp.json (no dot prefix)
cp "$PLUGIN_DIR/.mcp.json" "$PLUGIN_DIR/mcp.json"

# Write .lsp.json — Ansible YAML language server (completion, hover, diagnostics)
cat > "$PLUGIN_DIR/.lsp.json" <<EOF
{
  "ansible-language-server": {
    "command": "node",
    "args": ["\${PLUGIN_ROOT}/servers/language-server.js", "--stdio"],
    "extensionToLanguage": {
      ".yml": "yaml",
      ".yaml": "yaml"
    },
    "initializationOptions": {
      "ansible": {
        "validation": { "enabled": true },
        "completion": { "enabled": true }
      }
    }
  }
}
EOF

# Add a README for the plugin
cat > "$PLUGIN_DIR/README.md" <<EOF
# Ansible DevTools Plugin

AI agent plugin for Ansible development — works with Cursor, Claude Code, and any Open Plugin-compatible host.

## What's included

- **13 skills** for guided Ansible workflows (task building, playbook analysis, collection discovery, etc.)
- **MCP server** with 25+ tools for plugin search, documentation, task generation, scaffolding, and execution environment management
- **Language server** providing YAML completion, hover documentation, and diagnostics for Ansible files

All servers are bundled as single-file Node.js scripts — no npm install required. Just Node.js 20+.

## Installation

### Cursor
\`\`\`
/add-plugin ansible-devtools
\`\`\`

### Claude Code
\`\`\`bash
claude plugin marketplace add ansible/vscode-ansible
claude plugin install ansible-devtools

# Or for testing (session-only):
claude --plugin-dir /path/to/this/directory
claude --plugin-url https://url/to/ansible-devtools-plugin.zip
\`\`\`

### Local testing
\`\`\`bash
# Cursor
ln -s /path/to/this/directory ~/.cursor/plugins/local/ansible-devtools

# Claude Code
claude --plugin-dir /path/to/this/directory
\`\`\`

## Requirements

- Node.js >= 20
- Python 3 with \`ansible-core\` installed (for plugin discovery, docs, and linting)
- Optional: \`ansible-dev-tools\` for full scaffolding support

## VS Code / Cursor users with the extension

If you have the Ansible VS Code extension installed, you already have all these capabilities plus the full IDE experience (tree views, language server, linting). This plugin is for agent-only workflows outside the extension.
EOF

# Zip for CI artifact upload
(cd "$PLUGIN_DIR" && zip -r "$ROOT_DIR/dist/ansible-devtools-plugin.zip" .)

echo "Plugin built: $PLUGIN_DIR"
echo "Artifact:     dist/ansible-devtools-plugin.zip"
echo "Version:      $VERSION"
echo "Skills:       $(find "$PLUGIN_DIR/skills" -name SKILL.md | wc -l)"
echo "MCP server:   $(du -h "$PLUGIN_DIR/servers/mcp-server.js" | cut -f1)"
echo "LSP server:   $(du -h "$PLUGIN_DIR/servers/language-server.js" | cut -f1)"
echo "Total zip:    $(du -h "$ROOT_DIR/dist/ansible-devtools-plugin.zip" | cut -f1)"
