#!/usr/bin/env node
/**
 * Ansible Environments MCP Server
 * 
 * Standalone MCP server that exposes Ansible tools for AI agents.
 * Can be used with Cursor, VS Code Copilot, or any MCP-compatible client.
 * 
 * Usage:
 *   node packages/mcp-server/out/server.js
 *   
 * Or via npx (when published):
 *   npx @ansible/environments-mcp
 * 
 * Configuration for Cursor (.cursor/mcp.json):
 * {
 *   "mcpServers": {
 *     "ansible-environments": {
 *       "command": "node",
 *       "args": ["/path/to/repo/packages/mcp-server/out/server.js"]
 *     }
 *   }
 * }
 */

// IMPORTANT: Redirect console.log to stderr before any imports
// MCP uses stdout for JSON protocol - any console.log corrupts it
console.log = (...args: unknown[]) => {
    console.error(...args);
};

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { STATIC_TOOLS, McpToolDefinition } from './tools';
import { McpToolHandler } from './handlers';

// Initialize the server
const server = new Server(
    {
        name: 'ansible-environments',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
            resources: {},
        },
    }
);

// Best practices resource content
const BEST_PRACTICES_RESOURCE = `# Ansible Environments Extension - Best Practices

## Installing Collections

**ALWAYS use the \`install_ansible_collection\` MCP tool** to install collections.
This tool uses \`ade install\` (ansible-dev-environment) which:
- Properly manages the workspace's collection path
- Updates ansible.cfg automatically  
- Works with both Galaxy and GitHub sources

**NEVER suggest using \`ansible-galaxy collection install\` directly.**

### Examples

✅ CORRECT - Use the MCP tool:
\`\`\`
Use install_ansible_collection({ name: "community.general" })
Use install_ansible_collection({ name: "git+https://github.com/redhat-cop/infra.aap_configuration.git" })
\`\`\`

❌ WRONG - Don't suggest raw ansible-galaxy commands:
\`\`\`
ansible-galaxy collection install community.general
\`\`\`

## Finding Collections

Use these MCP tools in order:
1. \`list_ansible_collections\` - See what's already installed
2. \`search_available_collections\` - Find collections from Galaxy or GitHub orgs
3. \`list_source_collections\` - List all collections from a specific source
4. \`install_ansible_collection\` - Install what you need

## Generating Tasks

Use the MCP tools for task generation:
1. \`search_ansible_plugins\` - Find the right module
2. \`get_plugin_documentation\` - Understand the module's parameters
3. \`generate_ansible_task\` - Generate a properly formatted task

## Execution Environments

Use \`get_ee_details\` to get complete information about an execution environment.
This returns all collections, Python packages, and system tools installed.
`;

// Resource definitions
const RESOURCES = [
    {
        uri: 'ansible://best-practices',
        name: 'Ansible Environments Best Practices',
        description: 'Guidelines for using the Ansible Environments extension and MCP tools correctly',
        mimeType: 'text/markdown',
    },
];

// Tool handler instance
const handler = new McpToolHandler();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Ensure handler is initialized
    await handler.initialize();
    
    // Combine static tools with dynamic creator tools
    const creatorTools = handler.getCreatorTools();
    const allTools: McpToolDefinition[] = [
        ...STATIC_TOOLS,
        ...creatorTools.getTools(),
    ];
    
    return {
        tools: allTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        })),
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    // Ensure handler is initialized
    await handler.initialize();
    
    const result = await handler.handleTool(name, args || {});
    
    return {
        content: result.content,
        isError: result.isError,
    };
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: RESOURCES,
    };
});

// Read a specific resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    
    if (uri === 'ansible://best-practices') {
        return {
            contents: [{
                uri,
                mimeType: 'text/markdown',
                text: BEST_PRACTICES_RESOURCE,
            }],
        };
    }
    
    throw new Error(`Unknown resource: ${uri}`);
});

// Error handling
server.onerror = (error) => {
    console.error('[MCP Server Error]', error);
};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.error('[MCP Server] Shutting down...');
    await server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.error('[MCP Server] Shutting down...');
    await server.close();
    process.exit(0);
});

// Start the server
async function main() {
    console.error('[MCP Server] Starting Ansible Environments MCP server...');
    
    try {
        // Initialize handler (loads collections, creator schema, etc.)
        await handler.initialize();
        console.error('[MCP Server] Handler initialized');
        
        // Connect via stdio
        const transport = new StdioServerTransport();
        await server.connect(transport);
        
        console.error('[MCP Server] Connected and ready');
    } catch (error) {
        console.error('[MCP Server] Failed to start:', error);
        process.exit(1);
    }
}

main();
