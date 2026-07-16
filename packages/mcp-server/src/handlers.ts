/**
 * MCP Tool Handlers
 *
 * Routes tool calls to appropriate service methods.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { McpToolResult, mcpError } from './tools';
import { PluginSearchIndex } from './pluginSearch';
import { TaskGenerator } from './taskGenerator';
import { TaskBuilder } from './taskBuilder';
import { CreatorToolGenerator } from './creatorTools';
import { SkillToolGenerator } from './skillTools';
import {
    CollectionsService,
    DevToolsService,
    ExecutionEnvService,
    CreatorService,
    GalaxyCollectionCache,
    GalaxyDocsCache,
    GitHubCollectionCache,
    SCMDocsCache,
    getCommandService,
    isExecutionEnvironmentDefinition,
    planAnsibleBuilderBuild,
    buildNavigatorCommand,
    DEFAULT_PLAYBOOK_CONFIG,
} from '@ansible/developer-services';
import type {
    PluginOption,
    PluginInfo,
    PluginData,
    SchemaNode,
    PlaybookConfig,
} from '@ansible/developer-services';

/**
 * Normalizes ansible-doc fields that may be a single string or string array.
 *
 * @param value - Raw field value from plugin documentation
 * @returns Array of strings, empty when the value is undefined
 */
function toArray(value: string | string[] | undefined): string[] {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    return [value];
}

const VALID_PLUGIN_TYPES = new Set([
    'module',
    'filter',
    'lookup',
    'callback',
    'connection',
    'inventory',
    'become',
    'cache',
    'cliconf',
    'httpapi',
    'netconf',
    'shell',
    'strategy',
    'test',
    'vars',
]);

const FQCN_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** Routes MCP tool invocations to Ansible core services and local generators. */
export class McpToolHandler {
    private _searchIndex = PluginSearchIndex.getInstance();
    private _taskGenerator = new TaskGenerator();
    private _taskBuilder = new TaskBuilder();
    private _creatorTools = new CreatorToolGenerator();
    private _skillTools = new SkillToolGenerator();

    /** Warms the plugin search index, creator tools, and skill registry. */
    async initialize(): Promise<void> {
        await this._searchIndex.ensureBuilt();
        await this._creatorTools.initialize();
        await this._skillTools.initialize();
    }

    /**
     * Dynamic ansible-creator tool generator used when listing and invoking `ac_*` tools.
     *
     * @returns Shared CreatorToolGenerator instance owned by this handler
     */
    getCreatorTools(): CreatorToolGenerator {
        return this._creatorTools;
    }

    /**
     * Skill tool generator used when listing and invoking `skill_*` tools.
     *
     * @returns Shared SkillToolGenerator instance owned by this handler
     */
    getSkillTools(): SkillToolGenerator {
        return this._skillTools;
    }

    /**
     * Dispatches an MCP tool call to the matching handler implementation.
     *
     * @param name - Registered MCP tool name
     * @param args - Tool arguments from the MCP client
     * @returns Text content suitable for the MCP tool response
     */
    async handleTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
        try {
            // Creator tools
            if (this._creatorTools.isCreatorTool(name)) {
                return await this._creatorTools.handleTool(name, args);
            }

            // Skill tools
            if (this._skillTools.isSkillTool(name)) {
                return await this._skillTools.handleTool(name, args);
            }

            // Route to appropriate handler
            switch (name) {
                // Discovery
                case 'search_ansible_plugins':
                    return await this._handleSearchPlugins(args);
                case 'get_plugin_documentation':
                    return await this._handleGetPluginDoc(args);
                case 'list_ansible_collections':
                    return await this._handleListCollections(args);
                case 'install_ansible_collection':
                    return await this._handleInstallCollection(args);
                case 'search_available_collections':
                    return await this._handleSearchAvailableCollections(args);
                case 'list_source_collections':
                    return await this._handleListSourceCollections(args);
                case 'get_collection_plugins':
                    return await this._handleGetCollectionPlugins(args);
                case 'get_galaxy_plugin_doc':
                    return await this._handleGetGalaxyPluginDoc(args);
                case 'get_scm_plugin_doc':
                    return await this._handleGetScmPluginDoc(args);

                // Task generation
                case 'generate_ansible_task':
                    return await this._handleGenerateTask(args);
                case 'build_ansible_task':
                    return await this._handleBuildTask(args);
                case 'generate_ansible_playbook':
                    return await this._handleGeneratePlaybook(args);

                // Execution environments
                case 'list_execution_environments':
                    return await this._handleListEEs();
                case 'get_ee_details':
                    return await this._handleGetEEDetails(args);
                case 'build_execution_environment':
                    return await this._handleBuildEE(args);

                // Playbook execution
                case 'run_playbook_navigator':
                    return await this._handleRunPlaybookNavigator(args);

                // Dev tools
                case 'list_ansible_dev_tools':
                    return await this._handleListDevTools();
                case 'install_ansible_dev_tools':
                    return await this._handleInstallDevTools();
                case 'create_python_environment':
                    return this._handleCreatePythonEnvironment(args);

                // Creator
                case 'get_ansible_creator_schema':
                    return await this._handleGetCreatorSchema();

                case 'get_ansible_best_practices':
                    return await this._handleGetBestPractices(args);

                case 'get_agent_onboarding':
                    return this._handleGetAgentOnboarding();

                case 'get_extension_walkthrough':
                    return this._handleGetExtensionWalkthrough();

                default:
                    return mcpError({
                        code: 'NOT_FOUND',
                        recoverability: 'fail',
                        message: `Unknown tool: ${name}`,
                    });
            }
        } catch (error) {
            return mcpError({
                code: 'OPERATION_FAILED',
                recoverability: 'escalate',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    // === Discovery Handlers ===

    /**
     * Handles `search_ansible_plugins` by querying the plugin search index.
     *
     * @param args - Tool args: `query` (required), optional `plugin_type`, `collection`, `limit`
     * @returns Formatted list of matching plugins or guidance when none match
     */
    private async _handleSearchPlugins(args: Record<string, unknown>): Promise<McpToolResult> {
        const query = args.query as string;
        if (!query) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: query',
                suggestion: 'Provide a search query string.',
            });
        }

        await this._searchIndex.ensureBuilt();

        const rawLimit = args.limit as number | undefined;
        const limit = rawLimit !== undefined ? Math.min(Math.max(1, rawLimit), 50) : undefined;

        const results = this._searchIndex.search(query, {
            pluginType: args.plugin_type as string,
            collection: args.collection as string,
            limit,
        });

        if (results.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `No plugins found matching "${query}".\n\nTry different search terms or check if the collection is installed using list_ansible_collections.`,
                    },
                ],
            };
        }

        const formatted = results
            .map((r) => `• **${r.fullName}** (${r.pluginType})\n  ${r.shortDescription}`)
            .join('\n\n');

        return {
            content: [
                {
                    type: 'text',
                    text: `Found ${String(results.length)} plugins:\n\n${formatted}\n\n---\nUse \`get_plugin_documentation\` for full details or \`generate_ansible_task\` to create a task.`,
                },
            ],
        };
    }

    /**
     * Handles `get_plugin_documentation` by formatting full ansible-doc output.
     *
     * @param args - Tool args: `plugin` (required), optional `plugin_type` (default `module`)
     * @returns Markdown documentation sections for the requested plugin
     */
    private async _handleGetPluginDoc(args: Record<string, unknown>): Promise<McpToolResult> {
        const plugin = args.plugin as string;
        if (!plugin) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: plugin',
                suggestion: 'Provide the full plugin name (e.g., "ansible.builtin.copy").',
            });
        }

        const pluginType = (args.plugin_type as string | undefined) ?? 'module';
        const service = CollectionsService.getInstance();

        const doc = await service.getPluginDocumentation(plugin, pluginType);

        if (!doc?.doc) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Plugin not found: ${plugin}`,
                suggestion: 'Use search_ansible_plugins to find the correct plugin name.',
            });
        }

        const d = doc.doc;
        const sections: string[] = [];

        // Header
        sections.push(`# ${plugin} (${pluginType})`);
        sections.push(`*${d.short_description ?? ''}*\n`);

        // Synopsis
        if (d.description) {
            const desc = toArray(d.description).join(' ');
            sections.push(`## Synopsis\n${desc}\n`);
        }

        // Requirements
        if (d.requirements) {
            const reqs = toArray(d.requirements);
            if (reqs.length > 0) {
                sections.push(`## Requirements\n${reqs.map((r) => `• ${r}`).join('\n')}\n`);
            }
        }

        // Parameters
        if (d.options && Object.keys(d.options).length > 0) {
            sections.push(`## Parameters\n`);
            sections.push(this._formatParameters(d.options));
        }

        // Examples (truncated)
        if (doc.examples) {
            const examples =
                doc.examples.length > 2000
                    ? doc.examples.substring(0, 2000) + '\n... (truncated)'
                    : doc.examples;
            sections.push(`## Examples\n\`\`\`yaml\n${examples}\n\`\`\``);
        }

        // Author
        if (d.author) {
            const authors = Array.isArray(d.author) ? d.author.join(', ') : d.author;
            sections.push(`\n---\n*Author: ${authors}*`);
        }

        return {
            content: [{ type: 'text', text: sections.join('\n') }],
        };
    }

    /**
     * Formats plugin option metadata as a readable parameter list.
     *
     * @param options - Documented module parameters keyed by name
     * @returns Markdown bullet list with types, defaults, and short descriptions
     */
    private _formatParameters(options: Record<string, PluginOption>): string {
        const lines: string[] = [];

        // Sort: required first
        const sorted = Object.entries(options).sort((a, b) => {
            if (a[1].required && !b[1].required) {
                return -1;
            }
            if (!a[1].required && b[1].required) {
                return 1;
            }
            return a[0].localeCompare(b[0]);
        });

        for (const [name, opt] of sorted) {
            const type = opt.type ?? 'str';
            const req = opt.required ? ' **required**' : '';
            const def =
                opt.default !== undefined ? ` (default: \`${JSON.stringify(opt.default)}\`)` : '';
            const choices = opt.choices
                ? ` choices: [${opt.choices.slice(0, 5).join(', ')}${opt.choices.length > 5 ? '...' : ''}]`
                : '';
            const desc = toArray(opt.description)[0] ?? '';
            const shortDesc = desc.length > 150 ? desc.substring(0, 147) + '...' : desc;

            lines.push(`• **${name}** (${type})${req}${def}${choices}`);
            if (shortDesc) {
                lines.push(`  ${shortDesc}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Handles `list_ansible_collections` after refreshing the installed collection cache.
     *
     * @param args - Optional `filter` substring to narrow FQCN results
     * @returns Installed collections with versions
     */
    private async _handleListCollections(args: Record<string, unknown>): Promise<McpToolResult> {
        const service = CollectionsService.getInstance();

        // Force refresh to ensure we have the latest collections
        // This is the primary discovery tool, so freshness is important
        await service.forceRefresh();

        const collections = service.listCollectionNames();
        const filter = args.filter as string;

        let filtered = collections;
        if (filter) {
            const lowerFilter = filter.toLowerCase();
            filtered = collections.filter((c) => c.toLowerCase().includes(lowerFilter));
        }

        if (filtered.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: filter
                            ? `No collections found matching "${filter}".`
                            : 'No Ansible collections installed.',
                    },
                ],
            };
        }

        const formatted = filtered
            .map((name) => {
                const data = service.getCollection(name);
                const version = data?.info.version ? ` (v${data.info.version})` : '';
                return `• ${name}${version}`;
            })
            .join('\n');

        return {
            content: [
                {
                    type: 'text',
                    text: `Installed collections (${String(filtered.length)}):\n\n${formatted}`,
                },
            ],
        };
    }

    /**
     * Handles `install_ansible_collection` via ADE and rebuilds the plugin search index.
     *
     * @param args - Tool args: `name` (FQCN or Git URL, required)
     * @returns Success confirmation or installation error details
     */
    private async _handleInstallCollection(args: Record<string, unknown>): Promise<McpToolResult> {
        const name = args.name as string;
        if (!name) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: name',
                suggestion: 'Provide a collection name (e.g., "cisco.nxos").',
            });
        }

        const isGitUrl = name.startsWith('git+') || name.startsWith('https://');
        if (!isGitUrl && !FQCN_PATTERN.test(name)) {
            return mcpError({
                code: 'INVALID_INPUT',
                recoverability: 'fail',
                message: `Invalid collection name "${name}". Use namespace.name format (e.g., "cisco.nxos") or a git URL.`,
            });
        }

        const service = CollectionsService.getInstance();

        try {
            const result = await service.installCollection(name);

            // Refresh the search index after installation
            await this._searchIndex.rebuild();

            return {
                content: [
                    {
                        type: 'text',
                        text: `✓ ${result}\n\nThe collection ${name} has been installed. You can now use its plugins.`,
                    },
                ],
            };
        } catch (error) {
            return mcpError({
                code: 'OPERATION_FAILED',
                recoverability: 'escalate',
                message: `Failed to install collection: ${error instanceof Error ? error.message : String(error)}`,
                suggestion: 'Check network connectivity and collection name.',
            });
        }
    }

    /**
     * Handles `search_available_collections` across Galaxy and configured GitHub orgs.
     *
     * @param args - Tool args: `query` (required), optional `source` and `limit`
     * @returns Ranked installable collections with source metadata
     */
    private async _handleSearchAvailableCollections(
        args: Record<string, unknown>,
    ): Promise<McpToolResult> {
        const query = args.query as string;
        if (!query) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: query',
                suggestion: 'Provide search terms (e.g., "kubernetes", "cisco").',
            });
        }

        const source = args.source as string | undefined;
        const limit = Math.min((args.limit as number | undefined) ?? 20, 100);

        try {
            interface SearchResult {
                fqcn: string;
                version: string;
                source: string;
                sourceType: 'galaxy' | 'github';
                info: string;
            }

            const allResults: SearchResult[] = [];

            // Search Galaxy (unless source filter excludes it)
            if (!source || source.toLowerCase() === 'galaxy') {
                const galaxyCache = GalaxyCollectionCache.getInstance();
                await galaxyCache.ensureLoaded();

                const galaxyResults = galaxyCache.search(query);
                for (const col of galaxyResults) {
                    const deprecated = col.deprecated ? ' [DEPRECATED]' : '';
                    const downloads =
                        col.downloadCount > 1000
                            ? `${String(Math.round(col.downloadCount / 1000))}k downloads`
                            : `${String(col.downloadCount)} downloads`;
                    allResults.push({
                        fqcn: `${col.namespace}.${col.name}`,
                        version: col.version,
                        source: 'Galaxy',
                        sourceType: 'galaxy',
                        info: `${downloads}${deprecated}`,
                    });
                }
            }

            // Search GitHub orgs (unless source filter limits to Galaxy)
            if (source?.toLowerCase() !== 'galaxy') {
                const githubCache = GitHubCollectionCache.getInstance();

                // Load default orgs from disk (MCP server runs standalone)
                const defaultOrgs = ['ansible', 'ansible-collections', 'redhat-cop'];
                for (const org of defaultOrgs) {
                    githubCache.loadFromDisk(org);
                }

                const githubResults = githubCache.search(query);

                for (const col of githubResults) {
                    // If source filter is set, only include matching org
                    if (source && col.org.toLowerCase() !== source.toLowerCase()) {
                        continue;
                    }
                    allResults.push({
                        fqcn: `${col.namespace}.${col.name}`,
                        version: col.version,
                        source: col.org,
                        sourceType: 'github',
                        info: col.description || 'GitHub',
                    });
                }
            }

            if (allResults.length === 0) {
                const sourceInfo = source ? ` in source "${source}"` : '';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No collections found matching "${query}"${sourceInfo}`,
                        },
                    ],
                };
            }

            // Limit results
            const limitedResults = allResults.slice(0, limit);

            const sourceInfo = source ? ` (source: ${source})` : '';
            const lines = [
                `Found ${String(Math.min(allResults.length, limit))} of ${String(allResults.length)} collections matching "${query}"${sourceInfo}:`,
                '',
            ];

            for (const result of limitedResults) {
                const sourceIcon = result.sourceType === 'galaxy' ? '🌐' : '🐙';
                lines.push(
                    `${sourceIcon} ${result.fqcn} (v${result.version}) [${result.source}] - ${result.info}`,
                );
            }

            lines.push('');
            lines.push('**To install a collection, use the install_ansible_collection MCP tool.**');
            lines.push('Example: install_ansible_collection({ name: "namespace.collection" })');
            lines.push(
                'For GitHub: install_ansible_collection({ name: "git+https://github.com/org/repo.git" })',
            );
            lines.push('');
            lines.push(
                '**IMPORTANT: Do NOT suggest using ansible-galaxy collection install directly.**',
            );

            return {
                content: [{ type: 'text', text: lines.join('\n') }],
            };
        } catch (error) {
            return mcpError({
                code: 'OPERATION_FAILED',
                recoverability: 'retry',
                message: `Failed to search collections: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    /**
     * Handles `list_source_collections` for one Galaxy or GitHub organization.
     *
     * @param args - Tool args: `source` (required), optional `limit`
     * @returns Collections available from the named source
     */
    private async _handleListSourceCollections(
        args: Record<string, unknown>,
    ): Promise<McpToolResult> {
        const source = args.source as string;
        if (!source) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: source',
                suggestion: 'Provide a source name ("galaxy" or a GitHub org name).',
            });
        }

        const limit = Math.min((args.limit as number | undefined) ?? 100, 500);

        try {
            interface CollectionInfo {
                fqcn: string;
                version: string;
                description: string;
                repo?: string;
            }

            const collections: CollectionInfo[] = [];

            if (source.toLowerCase() === 'galaxy') {
                // List Galaxy collections
                const galaxyCache = GalaxyCollectionCache.getInstance();
                await galaxyCache.ensureLoaded();

                for (const col of galaxyCache.getCollections().slice(0, limit)) {
                    const deprecated = col.deprecated ? ' [DEPRECATED]' : '';
                    collections.push({
                        fqcn: `${col.namespace}.${col.name}`,
                        version: col.version,
                        description: `${col.downloadCount.toLocaleString()} downloads${deprecated}`,
                    });
                }
            } else {
                // List GitHub org collections
                const githubCache = GitHubCollectionCache.getInstance();
                // Load from disk first (MCP server runs standalone)
                githubCache.loadFromDisk(source);
                const orgCollections = githubCache.getCollections(source);

                for (const col of orgCollections.slice(0, limit)) {
                    collections.push({
                        fqcn: `${col.namespace}.${col.name}`,
                        version: col.version,
                        description: col.description || 'No description',
                        repo: col.repository.split('/').pop() ?? col.repository,
                    });
                }
            }

            if (collections.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No collections found in source "${source}". The source may need to be refreshed.`,
                        },
                    ],
                };
            }

            const lines = [`Collections in "${source}" (${String(collections.length)}):`, ''];

            for (const col of collections) {
                const repoSuffix = col.repo ? ` [repo: ${col.repo}]` : '';
                lines.push(`• ${col.fqcn} (v${col.version})${repoSuffix}: ${col.description}`);
            }

            lines.push('');
            lines.push('**To install a collection, use the install_ansible_collection MCP tool.**');
            lines.push('Example: install_ansible_collection({ name: "namespace.collection" })');
            lines.push(
                'For GitHub: install_ansible_collection({ name: "git+https://github.com/org/repo.git" })',
            );
            lines.push('');
            lines.push(
                '**IMPORTANT: Do NOT suggest using ansible-galaxy collection install directly.**',
            );

            return {
                content: [{ type: 'text', text: lines.join('\n') }],
            };
        } catch (error) {
            return mcpError({
                code: 'OPERATION_FAILED',
                recoverability: 'retry',
                message: `Failed to list collections: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    /**
     * Handles `get_collection_plugins` by listing plugins in an installed collection.
     *
     * @param args - Tool args: `collection` (required), optional `plugin_type` filter
     * @returns Markdown inventory of plugins grouped by type
     */
    private async _handleGetCollectionPlugins(
        args: Record<string, unknown>,
    ): Promise<McpToolResult> {
        const collection = args.collection as string;
        if (!collection) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: collection',
                suggestion: 'Provide a collection name (e.g., "ansible.builtin").',
            });
        }

        const service = CollectionsService.getInstance();

        if (!service.isLoaded()) {
            await service.refresh();
        }

        let collectionData = service.getCollection(collection);

        if (!collectionData) {
            console.error(
                `McpToolHandler: Collection "${collection}" not in cache, trying force refresh...`,
            );
            await service.forceRefresh();
            collectionData = service.getCollection(collection);
        }

        if (!collectionData) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Collection "${collection}" not found.`,
                suggestion:
                    'Use list_ansible_collections to see installed collections, or install_ansible_collection to install it.',
            });
        }

        const pluginTypeFilter = args.plugin_type as string | undefined;
        const sections: string[] = [];

        sections.push(`# ${collection} (v${collectionData.info.version || 'unknown'})`);
        if (collectionData.info.description) {
            sections.push(`*${collectionData.info.description}*\n`);
        }

        const pluginTypes = service.listPluginTypes(collection);
        let totalPlugins = 0;

        for (const pluginType of pluginTypes) {
            if (pluginTypeFilter && pluginType !== pluginTypeFilter) {
                continue;
            }

            const plugins = service.getPlugins(collection, pluginType);
            if (plugins.length === 0) {
                continue;
            }

            totalPlugins += plugins.length;
            sections.push(`## ${pluginType}s (${String(plugins.length)})\n`);

            // Show ALL plugins with descriptions
            for (const plugin of plugins) {
                const desc = plugin.shortDescription
                    ? ` - ${plugin.shortDescription.substring(0, 100)}${plugin.shortDescription.length > 100 ? '...' : ''}`
                    : '';
                sections.push(`• **${plugin.name}**${desc}`);
            }
            sections.push('');
        }

        if (totalPlugins === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: pluginTypeFilter
                            ? `No ${pluginTypeFilter}s found in ${collection}.`
                            : `No plugins found in ${collection}.`,
                    },
                ],
            };
        }

        sections.push(`---\nUse \`get_plugin_documentation\` for full details on any plugin.`);

        return {
            content: [{ type: 'text', text: sections.join('\n') }],
        };
    }

    /**
     * Handles `get_galaxy_plugin_doc` — fetch docs-blob from Galaxy for an uninstalled collection.
     *
     * @param args - Tool args: `collection` (required), optional `plugin` and `plugin_type`
     * @returns Plugin documentation or a list of available plugin types
     */
    private async _handleGetGalaxyPluginDoc(args: Record<string, unknown>): Promise<McpToolResult> {
        const collectionFqcn = args.collection as string;
        if (!collectionFqcn) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: collection',
                suggestion: 'Provide a collection FQCN (e.g., "cisco.ios").',
            });
        }

        const parts = collectionFqcn.split('.');
        if (parts.length !== 2) {
            return mcpError({
                code: 'INVALID_INPUT',
                recoverability: 'fail',
                message: `Invalid collection name "${collectionFqcn}". Use namespace.name format (e.g., "cisco.ios").`,
            });
        }
        const [namespace, name] = parts;

        const galaxyCache = GalaxyCollectionCache.getInstance();
        await galaxyCache.ensureLoaded();

        const match = galaxyCache
            .getCollections()
            .find((c) => c.namespace === namespace && c.name === name);
        if (!match) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Collection "${collectionFqcn}" not found on Galaxy.`,
                suggestion: 'Use search_available_collections to find it.',
            });
        }

        const docsCache = GalaxyDocsCache.getInstance();
        const pluginName = args.plugin as string | undefined;

        if (!pluginName) {
            const pluginTypes = await docsCache.getPluginTypes(namespace, name, match.version);

            if (!pluginTypes) {
                return mcpError({
                    code: 'SERVICE_UNAVAILABLE',
                    recoverability: 'retry',
                    message: `Failed to fetch docs-blob for ${collectionFqcn} v${match.version} from Galaxy.`,
                });
            }

            const text = this._formatPluginTypeList(
                `${collectionFqcn} v${match.version}`,
                pluginTypes,
                'get_galaxy_plugin_doc',
            );
            return { content: [{ type: 'text', text }] };
        }

        const pluginType = (args.plugin_type as string) || 'module';
        const fqcn = `${collectionFqcn}.${pluginName}`;
        const doc = await docsCache.getPluginDoc(namespace, name, match.version, fqcn, pluginType);

        if (!doc) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Plugin "${pluginName}" (${pluginType}) not found in ${collectionFqcn}.`,
                suggestion:
                    'Use get_galaxy_plugin_doc without a plugin name to list available plugins.',
            });
        }

        return { content: [{ type: 'text', text: this._formatPluginDoc(fqcn, pluginType, doc) }] };
    }

    /**
     * Recursively format plugin options into Markdown.
     *
     * @param options - Plugin option definitions
     * @param lines - Accumulator for output lines
     * @param depth - Nesting depth for indentation
     */
    private _formatOptions(
        options: Record<string, PluginOption>,
        lines: string[],
        depth: number,
    ): void {
        const indent = '  '.repeat(depth);
        for (const [optName, opt] of Object.entries(options)) {
            const required = opt.required ? ' **REQUIRED**' : '';
            const type = opt.type ? ` (${opt.type})` : '';
            const desc = opt.description
                ? ` - ${toArray(opt.description).join(' ').substring(0, 200)}`
                : '';
            const defaultVal =
                opt.default !== undefined ? ` [default: ${JSON.stringify(opt.default)}]` : '';
            const choices =
                opt.choices && opt.choices.length > 0
                    ? ` [choices: ${opt.choices.join(', ')}]`
                    : '';
            lines.push(`${indent}• **${optName}**${type}${required}${desc}${defaultVal}${choices}`);
            if (opt.suboptions) {
                this._formatOptions(opt.suboptions, lines, depth + 1);
            }
        }
    }

    /**
     * Formats a plugin-type listing into Markdown sections with plugin counts.
     *
     * @param title - Header line for the listing (e.g., "collection v1.0")
     * @param pluginTypes - Map of plugin type names to plugin info arrays
     * @param hintTool - MCP tool name to mention in the footer hint
     * @returns Formatted Markdown string
     */
    private _formatPluginTypeList(
        title: string,
        pluginTypes: Record<string, PluginInfo[]>,
        hintTool: string,
    ): string {
        const lines: string[] = [`# ${title}\n`];
        let total = 0;
        for (const [type, plugins] of Object.entries(pluginTypes).sort(([a], [b]) =>
            a.localeCompare(b),
        )) {
            total += plugins.length;
            lines.push(`## ${type} (${String(plugins.length)})\n`);
            for (const p of plugins) {
                const desc = p.shortDescription ? ` - ${p.shortDescription}` : '';
                lines.push(`• **${p.name}**${desc}`);
            }
            lines.push('');
        }
        lines.push(
            `---\n${String(total)} plugins total. Use \`${hintTool}\` with a \`plugin\` name for full docs.`,
        );
        return lines.join('\n');
    }

    /**
     * Formats full plugin documentation into Markdown sections.
     *
     * @param fqcn - Fully qualified plugin name
     * @param pluginType - Plugin type (module, lookup, etc.)
     * @param doc - Plugin documentation data
     * @returns Formatted Markdown string
     */
    private _formatPluginDoc(fqcn: string, pluginType: string, doc: PluginData): string {
        const sections: string[] = [];
        sections.push(`# ${fqcn} (${pluginType})\n`);

        if (doc.doc) {
            const d = doc.doc;
            if (d.short_description) sections.push(`*${d.short_description}*\n`);
            if (d.description) {
                sections.push('## Description\n');
                sections.push(toArray(d.description).join('\n') + '\n');
            }
            if (d.author) {
                sections.push(`**Authors:** ${toArray(d.author).join(', ')}\n`);
            }
            if (d.version_added) {
                sections.push(`**Version added:** ${d.version_added}\n`);
            }
            if (d.notes) {
                sections.push('## Notes\n');
                for (const note of toArray(d.notes)) {
                    sections.push(`- ${note}`);
                }
                sections.push('');
            }
            if (d.requirements) {
                sections.push('## Requirements\n');
                for (const req of toArray(d.requirements)) {
                    sections.push(`- ${req}`);
                }
                sections.push('');
            }
            if (d.options && Object.keys(d.options).length > 0) {
                sections.push('## Parameters\n');
                this._formatOptions(d.options, sections, 0);
            }
        }

        if (doc.examples) {
            sections.push('## Examples\n');
            sections.push('```yaml');
            sections.push(doc.examples.trim());
            sections.push('```\n');
        }

        if (doc.return && Object.keys(doc.return).length > 0) {
            sections.push('## Return Values\n');
            for (const [retName, retVal] of Object.entries(doc.return)) {
                const retDesc = retVal.description
                    ? ` - ${toArray(retVal.description).join(' ')}`
                    : '';
                const retType = retVal.type ? ` (${retVal.type})` : '';
                sections.push(`• **${retName}**${retType}${retDesc}`);
            }
            sections.push('');
        }

        return sections.join('\n');
    }

    /**
     * Handles `get_scm_plugin_doc` — fetches docs via shallow clone + ansible-doc.
     *
     * @param args - Tool args: `org`, `repo`, `collection` (required), optional `plugin` and `plugin_type`
     * @returns Plugin documentation or a list of available plugin types
     */
    private async _handleGetScmPluginDoc(args: Record<string, unknown>): Promise<McpToolResult> {
        const org = args.org as string;
        const repo = args.repo as string;
        const collectionFqcn = args.collection as string;

        if (!org || !repo || !collectionFqcn) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameters: org, repo, and collection are all required.',
            });
        }

        const parts = collectionFqcn.split('.');
        if (parts.length !== 2) {
            return mcpError({
                code: 'INVALID_INPUT',
                recoverability: 'fail',
                message: `Invalid collection name "${collectionFqcn}". Use namespace.name format (e.g., "infra.aap_configuration").`,
            });
        }
        const [namespace, name] = parts;

        const scmCache = SCMDocsCache.getInstance();
        const pluginName = args.plugin as string | undefined;
        const forceRefresh = args.force_refresh as boolean | undefined;

        if (forceRefresh) {
            scmCache.invalidate(org, repo);
        }

        if (!pluginName) {
            const pluginTypes = await scmCache.getPluginTypes(org, repo, namespace, name);

            if (!pluginTypes) {
                return mcpError({
                    code: 'SERVICE_UNAVAILABLE',
                    recoverability: 'retry',
                    message: `Failed to index ${collectionFqcn} from ${org}/${repo}.`,
                    suggestion: 'Ensure git and ansible-doc are available.',
                });
            }

            const text = this._formatPluginTypeList(
                `${collectionFqcn} (${org}/${repo})`,
                pluginTypes,
                'get_scm_plugin_doc',
            );
            return { content: [{ type: 'text', text }] };
        }

        const pluginType = (args.plugin_type as string) || 'module';
        const fqcn = `${collectionFqcn}.${pluginName}`;
        const doc = await scmCache.getPluginDoc(org, repo, namespace, name, fqcn, pluginType);

        if (!doc) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Plugin "${pluginName}" (${pluginType}) not found in ${collectionFqcn}.`,
                suggestion:
                    'Use get_scm_plugin_doc without a plugin name to list available plugins.',
            });
        }

        return { content: [{ type: 'text', text: this._formatPluginDoc(fqcn, pluginType, doc) }] };
    }

    // === Task Generation Handlers ===

    /**
     * Handles `generate_ansible_task` using the one-shot TaskGenerator.
     *
     * @param args - Tool args: `plugin` and `params` (required), plus optional task options
     * @returns YAML task block and any validation warnings
     */
    private async _handleGenerateTask(args: Record<string, unknown>): Promise<McpToolResult> {
        const plugin = args.plugin as string;
        const params = args.params;

        if (!plugin) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: plugin',
                suggestion: 'Provide the full plugin name (e.g., "ansible.builtin.copy").',
            });
        }

        if (typeof params !== 'object' || params === null || Array.isArray(params)) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: params',
                suggestion: 'Provide plugin parameters as a key-value object.',
            });
        }

        const pluginType = args.plugin_type as string | undefined;
        if (pluginType && !VALID_PLUGIN_TYPES.has(pluginType)) {
            return mcpError({
                code: 'INVALID_INPUT',
                recoverability: 'fail',
                message: `Invalid plugin_type: "${pluginType}".`,
                suggestion: `Valid types: ${[...VALID_PLUGIN_TYPES].join(', ')}`,
            });
        }

        const result = await this._taskGenerator.generate({
            plugin,
            plugin_type: args.plugin_type as string,
            params: params as Record<string, unknown>,
            task_name: args.task_name as string,
            register: args.register as string,
            when: args.when as string,
            loop: args.loop as unknown[],
            become: args.become as boolean,
            ignore_errors: args.ignore_errors as boolean,
            tags: args.tags as string[],
        });

        let response = `\`\`\`yaml\n${result.yaml}\n\`\`\``;

        if (result.warnings.length > 0) {
            response += `\n\n⚠️ Warnings:\n${result.warnings.map((w) => `• ${w}`).join('\n')}`;
        }

        return { content: [{ type: 'text', text: response }] };
    }

    /**
     * Handles `build_ansible_task` for interactive, session-based task construction.
     *
     * @param args - Session and parameter fields accepted by TaskBuilder
     * @returns Session prompts, generated YAML, or an error message
     */
    private async _handleBuildTask(args: Record<string, unknown>): Promise<McpToolResult> {
        if (!args.session_id && !args.plugin) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: plugin',
                suggestion:
                    'Provide a plugin name to start a new session, or a session_id to continue an existing one.',
            });
        }

        const result = await this._taskBuilder.build({
            plugin: args.plugin as string,
            plugin_type: args.plugin_type as string,
            session_id: args.session_id as string,
            params: args.params as Record<string, unknown>,
            task_name: args.task_name as string,
            become: args.become as boolean,
            register: args.register as string,
            when: args.when as string,
            generate: args.generate as boolean,
            cancel: args.cancel as boolean,
        });

        if (result.status === 'complete' && result.yaml) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `✓ Task generated:\n\n\`\`\`yaml\n${result.yaml}\n\`\`\``,
                    },
                ],
            };
        }

        return {
            content: [{ type: 'text', text: result.message }],
            isError: result.status === 'error',
        };
    }

    /**
     * Handles `generate_ansible_playbook` by composing multiple generated tasks.
     *
     * @param args - Tool args: `name`, `hosts`, and `tasks` (required), plus optional play options
     * @returns Full playbook YAML and aggregated task warnings
     */
    private async _handleGeneratePlaybook(args: Record<string, unknown>): Promise<McpToolResult> {
        const name = args.name as string;
        const hosts = args.hosts as string;
        const tasks = args.tasks;

        if (!name || !hosts || !Array.isArray(tasks)) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameters: name, hosts, tasks',
            });
        }

        interface PlaybookTaskInput {
            plugin: string;
            params: Record<string, unknown>;
            task_name?: string;
            become?: boolean;
            when?: string;
            register?: string;
        }

        const playbookTasks: PlaybookTaskInput[] = tasks.map((task) => {
            if (typeof task !== 'object' || task === null) {
                throw new Error('Invalid task entry in tasks array');
            }
            const entry = task as Record<string, unknown>;
            if (typeof entry.plugin !== 'string') {
                throw new Error('Each task must include a plugin string');
            }
            if (
                typeof entry.params !== 'object' ||
                entry.params === null ||
                Array.isArray(entry.params)
            ) {
                throw new Error('Each task must include a params object');
            }
            return {
                plugin: entry.plugin,
                params: entry.params as Record<string, unknown>,
                task_name: typeof entry.task_name === 'string' ? entry.task_name : undefined,
                become: typeof entry.become === 'boolean' ? entry.become : undefined,
                when: typeof entry.when === 'string' ? entry.when : undefined,
                register: typeof entry.register === 'string' ? entry.register : undefined,
            };
        });

        const result = await this._taskGenerator.generatePlaybook({
            name,
            hosts,
            tasks: playbookTasks,
            become: args.become as boolean,
            vars: args.vars as Record<string, unknown>,
            gather_facts: args.gather_facts as boolean,
        });

        let response = `\`\`\`yaml\n${result.yaml}\n\`\`\``;

        if (result.warnings.length > 0) {
            response += `\n\n⚠️ Warnings:\n${result.warnings.map((w) => `• ${w}`).join('\n')}`;
        }

        return { content: [{ type: 'text', text: response }] };
    }

    // === Execution Environment Handlers ===

    /**
     * Handles `list_execution_environments` from ansible-navigator image metadata.
     *
     * @returns Summary of discovered execution environment images
     */
    private async _handleListEEs(): Promise<McpToolResult> {
        const service = ExecutionEnvService.getInstance();

        try {
            const ees = await service.loadExecutionEnvironments();

            if (ees.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'No execution environments found.\n\nMake sure a container runtime (Podman or Docker) is installed and EE images are pulled locally.',
                        },
                    ],
                };
            }

            const formatted = ees
                .map(
                    (ee) =>
                        `• **${ee.full_name}**\n  ID: ${ee.image_id.substring(0, 12)}  Created: ${ee.created}`,
                )
                .join('\n\n');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Execution Environments (${String(ees.length)}):\n\n${formatted}\n\n---\nUse \`get_ee_details\` for more information about a specific EE.`,
                    },
                ],
            };
        } catch (error) {
            return mcpError({
                code: 'SERVICE_UNAVAILABLE',
                recoverability: 'retry',
                message: `Error loading execution environments: ${error instanceof Error ? error.message : String(error)}`,
                suggestion:
                    'Ensure a container runtime (Podman or Docker) is installed and running.',
            });
        }
    }

    /**
     * Handles `get_ee_details` with full package and collection inventory for one EE.
     *
     * @param args - Tool args: `ee_name` (required)
     * @returns Detailed execution environment report or a not-found error
     */
    private async _handleGetEEDetails(args: Record<string, unknown>): Promise<McpToolResult> {
        const eeName = args.ee_name as string;
        if (!eeName) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: ee_name',
                suggestion: 'Use list_execution_environments to find available EE names.',
            });
        }

        const service = ExecutionEnvService.getInstance();

        try {
            const details = await service.loadDetails(eeName);

            if (!details) {
                return mcpError({
                    code: 'NOT_FOUND',
                    recoverability: 'fail',
                    message: `Execution environment not found: ${eeName}`,
                    suggestion: 'Use list_execution_environments to see available EEs.',
                });
            }

            const sections: string[] = [];
            sections.push(`# Execution Environment: ${eeName}\n`);
            sections.push('This is the complete information for this execution environment.\n');

            // Info
            sections.push('## Container Information\n');
            if (details.ansible_version?.details) {
                sections.push(`**Ansible Version:** ${details.ansible_version.details}`);
            }
            if (details.os_release?.details[0]) {
                const os = details.os_release.details[0];
                sections.push(`**Base OS:** ${os['pretty-name'] ?? os.name ?? 'Unknown'}`);
            }
            if (details.redhat_release?.details) {
                sections.push(`**Red Hat Release:** ${details.redhat_release.details}`);
            }
            if (details.system_packages?.details) {
                const pkgCount = Object.keys(details.system_packages.details).length;
                sections.push(`**System Packages:** ${String(pkgCount)} installed`);
            }
            sections.push('');

            // Ansible Collections - show ALL
            if (details.ansible_collections?.details) {
                const collections = Object.entries(details.ansible_collections.details).sort(
                    ([a], [b]) => a.localeCompare(b),
                );
                sections.push(`## Ansible Collections (${String(collections.length)})\n`);
                sections.push(
                    collections.map(([name, version]) => `• ${name}: ${version}`).join('\n'),
                );
                sections.push('');
            }

            // Python packages - show ALL
            if (details.python_packages?.details) {
                const packages = [...details.python_packages.details].sort((a, b) =>
                    a.name.localeCompare(b.name),
                );
                sections.push(`## Python Packages (${String(packages.length)})\n`);
                sections.push(packages.map((p) => `• ${p.name}: ${p.version}`).join('\n'));
                sections.push('');
            }

            // System packages if available
            if (details.system_packages?.details) {
                const sysPkgs = [...details.system_packages.details]
                    .filter((pkg) => pkg.name)
                    .sort((a, b) => a.name.localeCompare(b.name));
                sections.push(`## System Packages (${String(sysPkgs.length)})\n`);
                sections.push(
                    sysPkgs
                        .map((pkg) => {
                            const ver = pkg.version
                                ? pkg.release
                                    ? `${pkg.version}-${pkg.release}`
                                    : pkg.version
                                : '';
                            return `• ${pkg.name}: ${ver}`;
                        })
                        .join('\n'),
                );
            }

            return {
                content: [{ type: 'text', text: sections.join('\n') }],
            };
        } catch (error) {
            return mcpError({
                code: 'SERVICE_UNAVAILABLE',
                recoverability: 'retry',
                message: `Error loading EE details: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    /**
     * Handles `build_execution_environment` by running ansible-builder against a definition file.
     *
     * @param args - Tool args: `file_path` (required), optional `tag` and `context_dir`
     * @returns Build output summary or a structured error
     */
    private async _handleBuildEE(args: Record<string, unknown>): Promise<McpToolResult> {
        const filePath = args.file_path as string | undefined;
        if (!filePath) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: file_path',
                suggestion:
                    'Provide the absolute path to an execution-environment.yml definition file.',
            });
        }

        if (!isExecutionEnvironmentDefinition(filePath)) {
            return mcpError({
                code: 'INVALID_INPUT',
                recoverability: 'fail',
                message: `Not an execution environment definition: ${filePath}`,
                suggestion:
                    'file_path must end with execution-environment.yml or execution-environment.yaml.',
            });
        }

        if (!fs.existsSync(filePath)) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Execution environment definition not found: ${filePath}`,
            });
        }

        const commandService = getCommandService();
        const available = await commandService.isToolAvailable('ansible-builder');
        if (!available) {
            return mcpError({
                code: 'SERVICE_UNAVAILABLE',
                recoverability: 'escalate',
                message: 'ansible-builder was not found in the active Python environment or PATH.',
                suggestion:
                    'Install ansible-dev-tools (`install_ansible_dev_tools`) and ensure Podman or Docker is available.',
            });
        }

        const tag = typeof args.tag === 'string' ? args.tag : undefined;
        const contextDir = typeof args.context_dir === 'string' ? args.context_dir : undefined;
        const plan = planAnsibleBuilderBuild({ filePath, tag, contextDir });

        try {
            const result = await commandService.runAnsibleBuilder(plan.args, {
                cwd: plan.cwd,
                timeout: 30 * 60 * 1000,
            });

            if (result.exitCode !== 0) {
                const failureOutput = (result.stderr || result.stdout || '').trim();
                const truncatedFailure =
                    failureOutput.length > 2000
                        ? `${failureOutput.substring(0, 2000)}\n... (truncated)`
                        : failureOutput;
                return mcpError({
                    code: 'OPERATION_FAILED',
                    recoverability: 'retry',
                    message: `ansible-builder failed (exit code ${String(result.exitCode)}): ${truncatedFailure}`,
                    suggestion:
                        'Check the definition file, container runtime status, and ansible-builder output.',
                });
            }

            ExecutionEnvService.getInstance().forceRefresh();

            const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
            const truncatedOutput =
                output.length > 2000 ? `${output.substring(0, 2000)}\n... (truncated)` : output;
            return {
                content: [
                    {
                        type: 'text',
                        text:
                            `Successfully built execution environment from ${plan.filePath}.\n\n` +
                            `Command: ansible-builder ${plan.args.join(' ')}\n` +
                            `Working directory: ${plan.cwd}\n\n` +
                            (truncatedOutput ? `Output:\n${truncatedOutput}\n\n` : '') +
                            'Use `list_execution_environments` to see the updated image list.',
                    },
                ],
            };
        } catch (error) {
            return mcpError({
                code: 'OPERATION_FAILED',
                recoverability: 'escalate',
                message: `Failed to build execution environment: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    // === Playbook Execution Handlers ===

    /**
     * Handles `run_playbook_navigator` by running ansible-navigator in stdout mode.
     *
     * @param args - Tool args: `playbook_path` (required), optional inventory, limit, etc.
     * @returns Navigator stdout/stderr output or a structured error
     */
    private async _handleRunPlaybookNavigator(
        args: Record<string, unknown>,
    ): Promise<McpToolResult> {
        const playbookPath = args.playbook_path as string | undefined;
        if (!playbookPath) {
            return mcpError({
                code: 'MISSING_PARAM',
                recoverability: 'fail',
                message: 'Missing required parameter: playbook_path',
                suggestion: 'Provide the absolute path to a playbook YAML file.',
            });
        }

        if (!fs.existsSync(playbookPath)) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Playbook not found: ${playbookPath}`,
            });
        }

        const commandService = getCommandService();
        const navigatorAvailable = await commandService.isToolAvailable('ansible-navigator');
        if (!navigatorAvailable) {
            return mcpError({
                code: 'SERVICE_UNAVAILABLE',
                recoverability: 'escalate',
                message: 'ansible-navigator is not installed in the active Python environment',
                suggestion:
                    'Install ansible-dev-tools (which includes ansible-navigator) using the install_ansible_dev_tools tool.',
            });
        }

        const config: PlaybookConfig = {
            ...DEFAULT_PLAYBOOK_CONFIG,
            inventory: (args.inventory as string[] | undefined) ?? [],
            limit: (args.limit as string | undefined) ?? '',
            tags: (args.tags as string[] | undefined) ?? [],
            skipTags: (args.skip_tags as string[] | undefined) ?? [],
            extraVars: (args.extra_vars as string | undefined) ?? '',
            check: (args.check as boolean | undefined) ?? false,
            diff: (args.diff as boolean | undefined) ?? false,
            verbose: (args.verbose as number | undefined) ?? 0,
            forks: (args.forks as number | undefined) ?? 5,
            connection: (args.connection as string | undefined) ?? 'ssh',
            user: (args.user as string | undefined) ?? '',
            timeout: args.timeout as number | undefined,
            privateKey: (args.private_key as string | undefined) ?? '',
            become: (args.become as boolean | undefined) ?? false,
            becomeMethod: (args.become_method as string | undefined) ?? 'sudo',
            becomeUser: (args.become_user as string | undefined) ?? 'root',
            vaultPasswordFile: (args.vault_password_file as string | undefined) ?? '',
        };

        const command = buildNavigatorCommand(path.basename(playbookPath), config);
        const shellArgs = command.split(' ').slice(1);
        const cwd = path.dirname(playbookPath);

        try {
            const result = await commandService.runAnsibleNavigator(shellArgs, {
                cwd,
                timeout: 30 * 60 * 1000,
            });
            const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
            return {
                content: [
                    {
                        type: 'text',
                        text: `## ansible-navigator run (exit code: ${String(result.exitCode)})\n\n\`\`\`\n${output}\n\`\`\``,
                    },
                ],
                isError: result.exitCode !== 0,
            };
        } catch (error) {
            return mcpError({
                code: 'OPERATION_FAILED',
                recoverability: 'retry',
                message: `ansible-navigator failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    // === Dev Tools Handlers ===

    /**
     * Handles `list_ansible_dev_tools` by reporting installed ansible-dev-tools packages.
     *
     * @returns Installed dev-tool package names and versions
     */
    private async _handleListDevTools(): Promise<McpToolResult> {
        const service = DevToolsService.getInstance();

        if (!service.isLoaded()) {
            await service.refresh();
        }

        const packages = service.getPackages();

        if (packages.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'ansible-dev-tools is not installed.\n\nInstall with: pip install ansible-dev-tools',
                    },
                ],
            };
        }

        const formatted = packages.map((p) => `• ${p.name}: ${p.version}`).join('\n');

        return {
            content: [
                {
                    type: 'text',
                    text: `Ansible Dev Tools Packages:\n\n${formatted}`,
                },
            ],
        };
    }

    /**
     * Handles `install_ansible_dev_tools` by delegating to DevToolsService.install().
     *
     * @returns Success confirmation or an error when installation fails
     */
    private async _handleInstallDevTools(): Promise<McpToolResult> {
        const service = DevToolsService.getInstance();

        if (service.hasPackages()) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'ansible-dev-tools is already installed. Use `list_ansible_dev_tools` to see versions.',
                    },
                ],
            };
        }

        try {
            await service.install();
            return {
                content: [
                    {
                        type: 'text',
                        text: 'ansible-dev-tools installation started. Use `list_ansible_dev_tools` to verify.',
                    },
                ],
            };
        } catch (error) {
            return mcpError({
                code: 'OPERATION_FAILED',
                recoverability: 'escalate',
                message: `Failed to install ansible-dev-tools: ${error instanceof Error ? error.message : String(error)}`,
                suggestion:
                    'Ensure a Python environment is selected. In VS Code, use the Environment Managers sidebar.',
            });
        }
    }

    /**
     * Handles `create_python_environment`. This operation requires VS Code and
     * is not available in standalone MCP server mode.
     *
     * @param args - Optional `name` for the venv directory (default: ".venv")
     * @returns Guidance to use the extension UI since venv creation needs VS Code APIs
     */
    private _handleCreatePythonEnvironment(args: Record<string, unknown>): McpToolResult {
        const name = (args.name as string | undefined) ?? '.venv';

        if (!DevToolsService.getInstance().isInVSCode()) {
            return mcpError({
                code: 'SERVICE_UNAVAILABLE',
                recoverability: 'escalate',
                message:
                    'Virtual environment creation requires VS Code. Use `python -m venv` in a terminal instead.',
                suggestion: `Run: python3 -m venv ${name} && source ${name}/bin/activate && pip install ansible-dev-tools`,
            });
        }

        return {
            content: [
                {
                    type: 'text',
                    text:
                        `To create a virtual environment named "${name}", use the VS Code command:\n\n` +
                        '1. Open the Command Palette (Ctrl+Shift+P)\n' +
                        '2. Run "Ansible: Create Environment"\n' +
                        `3. Enter "${name}" when prompted\n\n` +
                        'The extension will create the venv and select it automatically.\n\n' +
                        'Alternatively, run in a terminal:\n' +
                        `\`\`\`\npython3 -m venv ${name}\n\`\`\``,
                },
            ],
        };
    }

    // === Creator Handlers ===

    /**
     * Handles `get_ansible_creator_schema` with a human-readable schema summary.
     *
     * @returns Formatted ansible-creator command tree or an availability error
     */
    private async _handleGetCreatorSchema(): Promise<McpToolResult> {
        const service = CreatorService.getInstance();

        if (!service.isLoaded()) {
            await service.refresh();
        }

        const schema = service.getSchema();

        if (!schema) {
            return mcpError({
                code: 'SERVICE_UNAVAILABLE',
                recoverability: 'retry',
                message: 'ansible-creator is not available.',
                suggestion: 'Install with: pip install ansible-dev-tools',
            });
        }

        // Format the schema into a readable summary
        const formatNode = (node: SchemaNode, indent = ''): string => {
            const lines: string[] = [];

            if (node.name) {
                lines.push(`${indent}**${node.name}**`);
            }
            if (node.description) {
                lines.push(`${indent}  ${node.description}`);
            }

            if (node.parameters?.properties) {
                const required = node.parameters.required;
                const props = Object.entries(node.parameters.properties);
                if (props.length > 0) {
                    lines.push(`${indent}  Parameters:`);
                    for (const [name, prop] of props) {
                        const req = required.includes(name) ? ' (required)' : '';
                        lines.push(
                            `${indent}    - ${name}${req}: ${prop.description || prop.type || ''}`,
                        );
                    }
                }
            }

            if (node.subcommands) {
                for (const [, subNode] of Object.entries(node.subcommands)) {
                    lines.push('');
                    lines.push(formatNode(subNode, indent + '  '));
                }
            }

            return lines.join('\n');
        };

        const formatted = formatNode(schema);

        return {
            content: [
                {
                    type: 'text',
                    text: `# ansible-creator Schema\n\nThis tool can scaffold the following Ansible content:\n\n${formatted}`,
                },
            ],
        };
    }

    /**
     * Handles `get_ansible_best_practices` from local cache or upstream documentation.
     *
     * @param args - Optional `section` key to return one document slice instead of the full guide
     * @returns Best-practices markdown for the requested section
     */
    private async _handleGetBestPractices(args: Record<string, unknown>): Promise<McpToolResult> {
        const section = (args.section as string | undefined) ?? 'full';

        const content = await this._loadBestPractices();
        if (!content) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'retry',
                message: 'Best practices document not found.',
                suggestion:
                    'Ensure the best_practices.md file is present in resources or network is available.',
            });
        }

        if (section === 'full') {
            return { content: [{ type: 'text', text: content }] };
        }

        const sectionMap: Record<string, string> = {
            principles: '## Guiding Principles',
            project_structure: '### Project structure',
            naming: '#### Naming Conventions',
            roles: '#### Roles',
            collections: '#### Collections',
            playbooks: '#### Playbooks',
            testing: '### Testing and Validation',
        };

        const heading = sectionMap[section];
        if (!heading) {
            return mcpError({
                code: 'INVALID_INPUT',
                recoverability: 'fail',
                message: `Unknown section: ${section}. Available sections: ${Object.keys(sectionMap).join(', ')}`,
            });
        }

        const startIndex = content.indexOf(heading);
        if (startIndex === -1) {
            return mcpError({
                code: 'NOT_FOUND',
                recoverability: 'fail',
                message: `Section "${section}" not found in best practices document.`,
            });
        }

        const headingLevel = (/^#+/.exec(heading) ?? ['##'])[0].length;
        const rest = content.slice(startIndex + heading.length);
        const nextMatch = new RegExp(`^#{1,${String(headingLevel)}}\\s`, 'm').exec(rest);
        const endIndex = nextMatch
            ? startIndex + heading.length + rest.indexOf(nextMatch[0])
            : content.length;

        return {
            content: [{ type: 'text', text: content.slice(startIndex, endIndex).trim() }],
        };
    }

    // === Agent Onboarding ===

    /**
     * Handles `get_agent_onboarding` by returning a structured capability guide.
     *
     * @returns Markdown onboarding document covering tools, skills, and workflows
     */
    private _handleGetAgentOnboarding(): McpToolResult {
        const guide = `# Agent Onboarding

## Available Tool Categories

### Discovery (read-only)
- \`search_ansible_plugins\` -- find plugins by keyword
- \`get_plugin_documentation\` -- full docs for a plugin
- \`list_ansible_collections\` / \`search_available_collections\` -- browse collections
- \`get_collection_plugins\` -- list plugins in a collection
- \`get_galaxy_plugin_doc\` / \`get_scm_plugin_doc\` -- docs for uninstalled plugins

### Task Generation (read-only, no side effects)
- \`generate_ansible_task\` -- one-shot YAML generation
- \`build_ansible_task\` -- interactive guided task building
- \`generate_ansible_playbook\` -- multi-task playbook generation

### Installation (destructive)
- \`install_ansible_collection\` -- installs a collection via ade (do NOT use ansible-galaxy directly)
- \`install_ansible_dev_tools\` -- installs ansible-dev-tools into the active Python environment
- \`create_python_environment\` -- creates a Python venv for Ansible development (VS Code only)

### Scaffolding (destructive, \`ac_*\` tools)
- Dynamically generated from ansible-creator schema
- Use \`get_ansible_creator_schema\` to see available commands

### Playbook Execution
- \`run_playbook_navigator\` -- run a playbook via ansible-navigator in stdout mode

### Execution Environments
- \`list_execution_environments\` / \`get_ee_details\` -- inspect container-based EEs (read-only)
- \`build_execution_environment\` -- build an EE image from execution-environment.yml via ansible-builder

### Skills (read-only)
- \`skill_search\` -- find skills by keyword
- \`skill_list\` -- browse all skills by category
- \`skill_get\` -- load full skill instructions by ID
- \`skill_list_sources\` -- see configured skill sources

### Reference
- \`get_ansible_best_practices\` -- Ansible coding conventions and guidelines
- \`list_ansible_dev_tools\` -- installed dev tool versions

## Skills: Use Them First

This server provides curated AI development skills for common Ansible workflows.
**Before improvising a complex task, search for a relevant skill:**

\`\`\`
skill_search({ query: "summarize collection" })
skill_get({ skill_id: "..." })
\`\`\`

Skills encode tested, project-specific workflows and should be preferred over
world knowledge. Categories include:
- **Task building** -- guided plugin parameter collection and YAML generation
- **Collection analysis** -- summarize installed, Galaxy, and GitHub collections
- **Playbook analysis** -- explain and summarize existing playbooks
- **Execution environments** -- detailed EE inspection workflows
- **Scaffolding** -- walkthrough ansible-creator commands for new projects
- **Plugin documentation** -- deep-dive explanations of plugin parameters and usage

## Recommended Workflows

1. **Before generating tasks**: \`search_ansible_plugins\` -> \`get_plugin_documentation\` -> \`generate_ansible_task\`
2. **Before installing**: \`list_ansible_collections\` (check if already installed) -> \`search_available_collections\` -> \`install_ansible_collection\`
3. **Before any complex workflow**: \`skill_search\` to check if a skill exists for it
4. **For scaffolding**: \`get_ansible_creator_schema\` -> use the appropriate \`ac_*\` tool

## Error Handling

All errors are returned as structured JSON with \`code\`, \`recoverability\`, and \`message\`.
Check \`recoverability\` to decide next steps:
- \`retry\` -- transient failure, try again
- \`escalate\` -- requires human intervention
- \`fail\` -- bad input, fix the request
`;

        return { content: [{ type: 'text', text: guide }] };
    }

    /**
     * Handles `get_extension_walkthrough` by returning an interactive walkthrough
     * script that an agent follows step-by-step with the user.
     *
     * @returns Markdown walkthrough script with agent instructions
     */
    private _handleGetExtensionWalkthrough(): McpToolResult {
        const script = `# Ansible Extension Walkthrough

You are now guiding the user through the Ansible VS Code extension. Follow these steps
interactively -- execute each one, show the results, and explain what happened before
moving to the next. Adapt based on what you find in their workspace.

## Step 1: Welcome and Workspace Discovery

Introduce yourself briefly, then explore the user's workspace:
- Look for playbooks (*.yml, *.yaml in the workspace root and common directories)
- Look for roles/ directories
- Look for inventory files
- Look for ansible.cfg or ansible-navigator.yml

Summarize what you found. If the workspace is empty, mention that you can help
scaffold a new project later in the walkthrough.

## Step 2: Plugin Discovery

Demonstrate the plugin search capability:
- If you found playbooks in Step 1, pick a module used in one of them and search for it
  using \`search_ansible_plugins\`
- If the workspace is empty, search for a common module like "copy" or "file"
- Show the results and explain how plugin search works

Then pick one result and call \`get_plugin_documentation\` to show full docs.
Highlight the parameters section and explain how this helps when writing tasks.

## Step 3: Task Generation

Using the plugin from Step 2, demonstrate task generation:
- Call \`generate_ansible_task\` with a practical example relevant to the user's workspace
- Show the generated YAML and explain it
- Mention that \`build_ansible_task\` offers an interactive, guided alternative
  with parameter-by-parameter assistance

## Step 4: Collections

Show the user their installed collections:
- Call \`list_ansible_collections\` to show what's available
- If they have collections installed, pick one and call \`get_collection_plugins\`
  to show its contents
- Mention \`search_available_collections\` for finding new collections on Galaxy
- Mention \`install_ansible_collection\` for installing them

## Step 5: Skills System

Introduce the skill system -- curated AI workflows:
- Call \`skill_list\` to show available skills and their categories
- Pick a skill relevant to what you found in the workspace and call
  \`skill_get\` to show what it does
- Explain that skills encode tested workflows and should be preferred over
  improvising complex tasks

## Step 6: Scaffolding and Creator Tools

If the user might want to create new Ansible content:
- Mention \`get_ansible_creator_schema\` and the dynamic \`ac_*\` tools
- Explain that these can scaffold new collections, roles, playbooks, and plugins
- Offer to demonstrate if they're interested

## Step 7: What's Next

Wrap up by:
- Summarizing the capabilities you demonstrated
- Mentioning execution environments (\`list_execution_environments\`)
  and best practices (\`get_ansible_best_practices\`) as additional resources
- Asking what they'd like to explore further or what task they'd like help with

---
**Important**: This is an interactive walkthrough. Do NOT dump all steps at once.
Execute each step, show real results from the user's environment, and pause for
their reactions. Keep explanations concise and practical.
`;

        return { content: [{ type: 'text', text: script }] };
    }

    /**
     * Loads the best practices document from local paths or the upstream URL.
     *
     * Checks bundled resources and a temp-file cache before fetching remotely.
     *
     * @returns Markdown document text, or undefined when no source is available
     */
    private async _loadBestPractices(): Promise<string | undefined> {
        const UPSTREAM_URL =
            'https://raw.githubusercontent.com/ansible/ansible-creator/refs/heads/main/docs/agents.md';
        const cacheDir = path.join(os.tmpdir(), 'ansible-mcp');
        const cachePath = path.join(cacheDir, 'best_practices.md');

        const localPaths = [
            path.join(__dirname, '..', '..', 'resources', 'best_practices.md'),
            path.join(__dirname, '..', 'resources', 'best_practices.md'),
            process.env.ANSIBLE_ENV_EXTENSION_PATH
                ? path.join(
                      process.env.ANSIBLE_ENV_EXTENSION_PATH,
                      'resources',
                      'best_practices.md',
                  )
                : '',
            cachePath,
        ].filter(Boolean);

        for (const p of localPaths) {
            if (fs.existsSync(p)) {
                return fs.readFileSync(p, 'utf-8');
            }
        }

        try {
            const res = await fetch(UPSTREAM_URL);
            if (res.ok) {
                const text = await res.text();
                try {
                    if (!fs.existsSync(cacheDir)) {
                        fs.mkdirSync(cacheDir, { recursive: true });
                    }
                    fs.writeFileSync(cachePath, text, 'utf-8');
                } catch {
                    /* cache write is best-effort */
                }
                return text;
            }
        } catch {
            /* network unavailable */
        }

        return undefined;
    }
}
