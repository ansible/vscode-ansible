/**
 * Skill Tool Generator
 *
 * Exposes skill_search, skill_list, skill_get, and skill_list_sources
 * as MCP tools backed by the SkillRegistry service.
 */

import { SkillRegistry } from '@ansible/services';
import type { SkillSource, SkillCategory } from '@ansible/services';
import { McpToolDefinition, McpToolResult, READ_ONLY, mcpError } from './tools';

/** MCP tool names handled by this generator. */
const SKILL_TOOL_NAMES = ['skill_search', 'skill_list', 'skill_get', 'skill_list_sources'] as const;

type SkillToolName = (typeof SKILL_TOOL_NAMES)[number];

/**
 * Generates MCP tools that expose the SkillRegistry to AI agents.
 */
export class SkillToolGenerator {
    private _registry: SkillRegistry;

    /**
     *
     */
    constructor() {
        this._registry = SkillRegistry.getInstance();
    }

    /**
     * Ensures skills are loaded, then logs a summary.
     */
    async initialize(): Promise<void> {
        await this._registry.ensureLoaded();
        const sources = this._registry.getSources();
        const skills = this._registry.getAllSkills();
        console.error(
            `SkillToolGenerator: Loaded ${String(skills.length)} skills from ${String(sources.length)} sources`,
        );
    }

    /**
     * Returns the set of MCP tool definitions for skill operations.
     *
     * @returns Array of tool definitions.
     */
    getTools(): McpToolDefinition[] {
        return [
            {
                name: 'skill_search',
                description:
                    'Search available AI development skills by keyword. ' +
                    'Searches name, description, triggers, and tags.',
                annotations: READ_ONLY,
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query (keywords)',
                        },
                        category: {
                            type: 'string',
                            description:
                                'Filter by category: standards, sdlc, domain, scaffold, workflow, other',
                            enum: ['standards', 'sdlc', 'domain', 'scaffold', 'workflow', 'other'],
                        },
                        source: {
                            type: 'string',
                            description: 'Filter by source ID',
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum results (default: 10)',
                        },
                    },
                    required: ['query'],
                },
            },
            {
                name: 'skill_list',
                description:
                    'List all available AI development skills, optionally filtered by category or source.',
                annotations: READ_ONLY,
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        category: {
                            type: 'string',
                            description:
                                'Filter by category: standards, sdlc, domain, scaffold, workflow, other',
                            enum: ['standards', 'sdlc', 'domain', 'scaffold', 'workflow', 'other'],
                        },
                        source: {
                            type: 'string',
                            description: 'Filter by source ID',
                        },
                    },
                },
            },
            {
                name: 'skill_get',
                description:
                    'Get the full content of a skill by its ID. ' +
                    'Returns the SKILL.md body with instructions the agent should follow.',
                annotations: READ_ONLY,
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        skill_id: {
                            type: 'string',
                            description:
                                'Skill ID (e.g. "ai-forge/ansible-collection-sdlc/commit")',
                        },
                    },
                    required: ['skill_id'],
                },
            },
            {
                name: 'skill_list_sources',
                description:
                    'List configured skill sources and their status (loaded count, trust level).',
                annotations: READ_ONLY,
                inputSchema: {
                    type: 'object' as const,
                    properties: {},
                },
            },
        ];
    }

    /**
     * Whether the given tool name is handled by this generator.
     *
     * @param name - MCP tool name to check.
     * @returns True when the name is a skill tool.
     */
    isSkillTool(name: string): boolean {
        return (SKILL_TOOL_NAMES as readonly string[]).includes(name);
    }

    /**
     * Dispatch a tool invocation to the appropriate skill handler.
     *
     * @param name - MCP tool name.
     * @param args - Tool arguments.
     * @returns MCP tool result.
     */
    async handleTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
        await this._registry.ensureLoaded();

        switch (name as SkillToolName) {
            case 'skill_search':
                return this._handleSearch(args);
            case 'skill_list':
                return this._handleList(args);
            case 'skill_get':
                return this._handleGet(args);
            case 'skill_list_sources':
                return this._handleListSources();
            default:
                return mcpError({
                    code: 'NOT_FOUND',
                    recoverability: 'fail',
                    message: `Unknown skill tool: ${name}`,
                });
        }
    }

    /** Force-reload skills from all sources. */
    async refresh(): Promise<void> {
        await this._registry.refresh();
    }

    // -- Handlers -----------------------------------------------------------

    /**
     * Searches skills by keyword and returns formatted results.
     *
     * @param args - Tool arguments containing the search query and optional filters.
     * @returns MCP tool result with matching skills.
     */
    private _handleSearch(args: Record<string, unknown>): McpToolResult {
        const query = args.query as string | undefined;
        if (!query) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: query',
                suggestion: 'Provide a search query string.',
            });
        }

        const limit = typeof args.limit === 'number' ? args.limit : 10;
        const results = this._registry.search(query, {
            category: args.category as SkillCategory | undefined,
            source: args.source as string | undefined,
            limit,
        });

        if (results.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `No skills found for "${query}". Try broader terms or use skill_list to see all available skills.`,
                    },
                ],
            };
        }

        const lines = results.map(
            (s) =>
                `- **${s.name}** (${s.id})\n  ${s.description}\n  Category: ${s.category} | ` +
                `Triggers: ${s.triggers.join(', ') || 'none'}`,
        );

        return {
            content: [
                {
                    type: 'text',
                    text: `Found ${String(results.length)} skill(s) matching "${query}":\n\n${lines.join('\n\n')}`,
                },
            ],
        };
    }

    /**
     * Lists all available skills, optionally filtered by category or source.
     *
     * @param args - Tool arguments with optional category and source filters.
     * @returns MCP tool result with a grouped skill listing.
     */
    private _handleList(args: Record<string, unknown>): McpToolResult {
        const results = this._registry.search('', {
            category: args.category as SkillCategory | undefined,
            source: args.source as string | undefined,
            limit: 100,
        });

        if (results.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'No skills available. Configure skill sources in settings.',
                    },
                ],
            };
        }

        const grouped = new Map<string, typeof results>();
        for (const s of results) {
            const key = `${s.source}/${s.module}`;
            const existing = grouped.get(key);
            if (existing) {
                existing.push(s);
            } else {
                grouped.set(key, [s]);
            }
        }

        const sections: string[] = [];
        for (const [key, skills] of grouped) {
            const lines = skills.map((s) => `  - ${s.name} (${s.id}) — ${s.description}`);
            sections.push(`### ${key}\n${lines.join('\n')}`);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `Available skills (${String(results.length)}):\n\n${sections.join('\n\n')}`,
                },
            ],
        };
    }

    /**
     * Fetches and returns the full SKILL.md content for a given skill ID.
     *
     * @param args - Tool arguments containing the skill_id string.
     * @returns MCP tool result with skill metadata header and body content.
     */
    private async _handleGet(args: Record<string, unknown>): Promise<McpToolResult> {
        const skillId = args.skill_id as string | undefined;
        if (!skillId) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: skill_id',
                suggestion: 'Use skill_search or skill_list to find available skill IDs.',
            });
        }

        const skill = this._registry.getSkill(skillId);
        if (!skill) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Skill not found: ${skillId}`,
                suggestion: 'Use skill_list to see available skills.',
            });
        }

        const content = await this._registry.loadSkillContent(skillId);
        if (!content) {
            return mcpError({
                code: 'SERVICE_UNAVAILABLE',
                recoverability: 'retry',
                message: 'Skill content could not be loaded. The source may be unavailable.',
            });
        }

        const header =
            `# Skill: ${skill.name}\n\n` +
            `- **Source:** ${skill.source} (${skill.trust})\n` +
            `- **Module:** ${skill.module}\n` +
            `- **Category:** ${skill.category}\n` +
            (skill.triggers.length > 0 ? `- **Triggers:** ${skill.triggers.join(', ')}\n` : '') +
            '\n---\n\n';

        return {
            content: [{ type: 'text', text: header + content }],
        };
    }

    /**
     * Lists all configured skill sources and how many skills each loaded.
     *
     * @returns MCP tool result with source details and skill counts.
     */
    private _handleListSources(): McpToolResult {
        const sources = this._registry.getSources();
        const allSkills = this._registry.getAllSkills();

        if (sources.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text:
                            'No skill sources configured.\n\n' +
                            'Add sources in VS Code settings under `ansibleEnvironments.skillSources` ' +
                            'or set the ANSIBLE_SKILL_SOURCES environment variable.',
                    },
                ],
            };
        }

        const lines = sources.map((s: SkillSource) => {
            const count = allSkills.filter((sk) => sk.source === s.id).length;
            return `- **${s.id}** (${s.type}, ${s.trust}): ${String(count)} skills\n  URL: ${s.url}`;
        });

        return {
            content: [
                {
                    type: 'text',
                    text: `Configured skill sources:\n\n${lines.join('\n')}`,
                },
            ],
        };
    }
}
