/**
 * Creator Tool Generator
 *
 * Dynamically generates MCP tools from ansible-creator schema.
 */

import { CreatorService } from '@ansible/services';
import type { SchemaNode } from '@ansible/services';
import { McpToolDefinition, McpToolResult, DESTRUCTIVE, mcpError } from './tools';

/** Generates and dispatches MCP tools from the ansible-creator command schema. */
export class CreatorToolGenerator {
    private _tools: McpToolDefinition[] = [];
    private _toolPathMap = new Map<string, string[]>();
    private _initialized = false;

    /** Loads the ansible-creator schema and builds MCP tool definitions from it. */
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
                console.error(
                    `CreatorToolGenerator: Loaded ${String(this._tools.length)} creator tools`,
                );
            } else {
                console.error('CreatorToolGenerator: No schema returned from CreatorService');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`CreatorToolGenerator: Failed to initialize: ${message}`);
        }
    }

    /**
     * Whether the creator schema has been loaded and tools are available.
     *
     * @returns True after `initialize()` has successfully built tool definitions
     */
    isInitialized(): boolean {
        return this._initialized;
    }

    /**
     * All dynamically generated ansible-creator MCP tool definitions.
     *
     * @returns Creator tools derived from the loaded schema (empty until initialized)
     */
    getTools(): McpToolDefinition[] {
        return this._tools;
    }

    /**
     * Checks whether a tool name belongs to the ansible-creator tool set.
     *
     * @param name - MCP tool name to check
     * @returns True when the name uses the `ac_` creator prefix
     */
    isCreatorTool(name: string): boolean {
        return name.startsWith('ac_');
    }

    /**
     * Runs an ansible-creator command for the given MCP tool.
     *
     * @param name - Creator tool name (e.g. `ac_coll_init`)
     * @param args - Tool arguments mapped to CLI flags and positional values
     * @returns MCP result with command output or an error message
     */
    async handleTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
        const toolPath = this._toolPathMap.get(name);
        if (!toolPath) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Unknown creator tool: ${name}`,
            });
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
        params.overwrite = true;

        // Get positional args for this command from the schema
        const positionalArgs = service.getPositionalArgs(toolPath);
        const commandStr = service.buildCommandString(toolPath, params, positionalArgs);

        console.log(`CreatorToolGenerator: Executing ${name}`);
        console.log(`CreatorToolGenerator: Command: ${commandStr}`);
        console.log(`CreatorToolGenerator: Positional args: ${positionalArgs.join(', ')}`);

        try {
            const result = (await service.runCommand(toolPath, params, positionalArgs)) as
                | string
                | undefined;

            // VS Code terminal mode returns undefined instead of captured output
            if (result === undefined) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `[TERMINAL] Running: ${commandStr}\n\nCommand started in VS Code terminal with activated environment.`,
                        },
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `[SUCCESS] ${commandStr}\n\nOutput:\n${result || 'Completed successfully.'}`,
                    },
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`CreatorToolGenerator: Error running ${commandStr}: ${errorMessage}`);

            // Check for common issues
            let helpText = '';
            if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
                helpText =
                    '\n\n[HINT] ansible-creator was not found. Make sure:\n' +
                    '1. A Python environment with ansible-creator is configured\n' +
                    '2. The ms-python.vscode-python-envs extension is installed and active\n' +
                    '3. Or install it: pip install ansible-creator';
            }

            return mcpError({
                code: 'OPERATION_FAILED',
                recoverability: 'escalate',
                message: `[ERROR] ${commandStr}\n\n${errorMessage}${helpText}`,
            });
        }
    }

    /**
     * Recursively walks the schema tree and collects MCP tools for leaf commands.
     *
     * @param schema - Current schema node in the ansible-creator tree
     * @param path - Command path segments accumulated from the root
     * @returns Tool definitions for all leaf commands under this node
     */
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

    /**
     * Builds a single MCP tool definition from a leaf ansible-creator command.
     *
     * @param path - Full command path (e.g. `['collection', 'init']`)
     * @param schema - Schema node describing parameters for the leaf command
     * @returns MCP tool definition with input schema derived from CLI parameters
     */
    private _createTool(path: string[], schema: SchemaNode): McpToolDefinition {
        // Shorten tool names to avoid exceeding MCP's 60 char limit for server:tool
        // "ansible-environments:" is 21 chars, leaving 39 for the tool name
        const shortPath = path.map((p) => this._shortenPathSegment(p));
        const toolName = `ac_${shortPath.join('_')}`;
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        if (schema.parameters?.properties) {
            for (const [paramName, paramSchema] of Object.entries(schema.parameters.properties)) {
                const prop: Record<string, unknown> = {
                    description: paramSchema.description || '',
                };

                if (paramSchema.type === 'boolean') {
                    prop.type = 'boolean';
                } else if (paramSchema.type === 'integer') {
                    prop.type = 'integer';
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
        const desc = schema.description ?? `Run ansible-creator ${path.join(' ')}`;
        const cmdHint = `\n\nEquivalent to: ansible-creator ${path.join(' ')}`;

        return {
            name: toolName,
            description: desc + cmdHint,
            annotations: DESTRUCTIVE,
            inputSchema: {
                type: 'object',
                properties,
                ...(required.length > 0 ? { required } : {}),
            },
        };
    }

    /**
     * Shortens a schema path segment so the combined tool name stays within MCP limits.
     *
     * @param segment - Raw command segment from the ansible-creator schema path
     * @returns Abbreviated segment when a known mapping exists, otherwise the original
     */
    private _shortenPathSegment(segment: string): string {
        const abbreviations: Record<string, string> = {
            resource: 'res',
            execution_environment: 'ee',
            'execution-environment': 'ee',
            devcontainer: 'devc',
            devfile: 'devf',
            collection: 'coll',
            plugin: 'plug',
            project: 'proj',
            playbook: 'play',
        };

        return abbreviations[segment] || segment;
    }

    /** Clears cached tools and reloads the ansible-creator schema from scratch. */
    async refresh(): Promise<void> {
        this._initialized = false;
        this._tools = [];
        this._toolPathMap.clear();
        await this.initialize();
    }
}
