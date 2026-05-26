/**
 * Creator Tool Generator
 * 
 * Dynamically generates MCP tools from ansible-creator schema.
 */

import { CreatorService } from '@ansible/core';
import type { SchemaNode } from '@ansible/core';
import { McpToolDefinition, McpToolResult } from './tools';

export class CreatorToolGenerator {
    private _tools: McpToolDefinition[] = [];
    private _toolPathMap: Map<string, string[]> = new Map();
    private _initialized = false;

    async initialize(): Promise<void> {
        if (this._initialized) {
            return;
        }

        try {
            const service = CreatorService.getInstance();
            const schema = await service.loadSchema();

            if (schema) {
                this._tools = this._generateTools(schema);
                this._initialized = true;
                console.error(`CreatorToolGenerator: Loaded ${this._tools.length} creator tools`);
            } else {
                console.error('CreatorToolGenerator: No schema returned from CreatorService');
            }
        } catch (error) {
            console.error(`CreatorToolGenerator: Failed to initialize: ${error}`);
        }
    }

    isInitialized(): boolean {
        return this._initialized;
    }

    getTools(): McpToolDefinition[] {
        return this._tools;
    }

    isCreatorTool(name: string): boolean {
        return name.startsWith('ac_');
    }

    async handleTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
        const toolPath = this._toolPathMap.get(name);
        if (!toolPath) {
            return {
                content: [{ type: 'text', text: `Unknown creator tool: ${name}` }],
                isError: true
            };
        }

        const service = CreatorService.getInstance();

        // Convert args to the format CreatorService expects
        const params: Record<string, string | boolean> = {};
        for (const [key, value] of Object.entries(args)) {
            if (typeof value === 'boolean') {
                params[key] = value;
            } else if (typeof value === 'string' && value !== '') {
                params[key] = value;
            }
        }

        // Always add --overwrite to prevent interactive prompts
        // This is necessary for automated builds
        params['overwrite'] = true;

        // Get positional args for this command from the schema
        const positionalArgs = service.getPositionalArgs(toolPath);
        const commandStr = service.buildCommandString(toolPath, params, positionalArgs);
        
        console.log(`CreatorToolGenerator: Executing ${name}`);
        console.log(`CreatorToolGenerator: Command: ${commandStr}`);
        console.log(`CreatorToolGenerator: Positional args: ${positionalArgs.join(', ')}`);

        try {
            const result = await service.runCommand(toolPath, params, positionalArgs);

            // If running in terminal mode, result is void
            if (result === undefined) {
                return {
                    content: [{
                        type: 'text',
                        text: `[TERMINAL] Running: ${commandStr}\n\nCommand started in VS Code terminal with activated environment.`
                    }]
                };
            }

            return {
                content: [{
                    type: 'text',
                    text: `[SUCCESS] ${commandStr}\n\nOutput:\n${result || 'Completed successfully.'}`
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`CreatorToolGenerator: Error running ${commandStr}: ${errorMessage}`);
            
            // Check for common issues
            let helpText = '';
            if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
                helpText = '\n\n[HINT] ansible-creator was not found. Make sure:\n' +
                    '1. A Python environment with ansible-creator is configured\n' +
                    '2. The ms-python.vscode-python-envs extension is installed and active\n' +
                    '3. Or install it: pip install ansible-creator';
            }
            
            return {
                content: [{ type: 'text', text: `[ERROR] ${commandStr}\n\n${errorMessage}${helpText}` }],
                isError: true
            };
        }
    }

    private _generateTools(schema: SchemaNode, path: string[] = []): McpToolDefinition[] {
        const tools: McpToolDefinition[] = [];

        if (schema.subcommands) {
            for (const [name, subSchema] of Object.entries(schema.subcommands)) {
                const subPath = [...path, name];

                if (subSchema.subcommands && Object.keys(subSchema.subcommands).length > 0) {
                    // Has more subcommands - recurse
                    tools.push(...this._generateTools(subSchema, subPath));
                } else {
                    // Leaf command - create a tool
                    const tool = this._createTool(subPath, subSchema);
                    tools.push(tool);
                    this._toolPathMap.set(tool.name, subPath);
                }
            }
        }

        return tools;
    }

    private _createTool(path: string[], schema: SchemaNode): McpToolDefinition {
        // Shorten tool names to avoid exceeding MCP's 60 char limit for server:tool
        // "ansible-environments:" is 21 chars, leaving 39 for the tool name
        const shortPath = path.map(p => this._shortenPathSegment(p));
        const toolName = `ac_${shortPath.join('_')}`;
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        if (schema.parameters?.properties) {
            for (const [paramName, paramSchema] of Object.entries(schema.parameters.properties)) {
                const prop: Record<string, unknown> = {
                    description: paramSchema.description || ''
                };

                // Map types
                if (paramSchema.type === 'boolean') {
                    prop.type = 'boolean';
                } else if (paramSchema.enum && paramSchema.enum.length > 0) {
                    prop.type = 'string';
                    prop.enum = paramSchema.enum;
                } else {
                    prop.type = 'string';
                }

                // Add default if present
                if (paramSchema.default !== undefined) {
                    prop.default = paramSchema.default;
                }

                properties[paramName] = prop;
            }
        }

        if (schema.parameters?.required) {
            required.push(...schema.parameters.required);
        }

        // Build description
        const desc = schema.description || `Run ansible-creator ${path.join(' ')}`;
        const cmdHint = `\n\nEquivalent to: ansible-creator ${path.join(' ')}`;

        return {
            name: toolName,
            description: desc + cmdHint,
            inputSchema: {
                type: 'object',
                properties,
                ...(required.length > 0 ? { required } : {})
            }
        };
    }

    /**
     * Shorten path segments to keep tool names under the MCP limit
     */
    private _shortenPathSegment(segment: string): string {
        const abbreviations: Record<string, string> = {
            'resource': 'res',
            'execution_environment': 'ee',
            'execution-environment': 'ee',
            'devcontainer': 'devc',
            'devfile': 'devf',
            'collection': 'coll',
            'plugin': 'plug',
            'project': 'proj',
            'playbook': 'play',
        };
        
        return abbreviations[segment] || segment;
    }

    async refresh(): Promise<void> {
        this._initialized = false;
        this._tools = [];
        this._toolPathMap.clear();
        await this.initialize();
    }
}
