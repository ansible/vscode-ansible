/**
 * MCP Tool Handlers
 * 
 * Routes tool calls to appropriate service methods.
 */

import { McpToolResult } from './tools';
import { PluginSearchIndex } from './pluginSearch';
import { TaskGenerator } from './taskGenerator';
import { TaskBuilder } from './taskBuilder';
import { CreatorToolGenerator } from './creatorTools';
import {
    CollectionsService,
    DevToolsService,
    ExecutionEnvService,
    CreatorService,
    GalaxyCollectionCache,
    GitHubCollectionCache,
} from '@ansible/core';
import type { PluginOption, SchemaNode } from '@ansible/core';

// Helper to convert string | string[] to string[]
function toArray(value: string | string[] | undefined): string[] {
    if (!value) { return []; }
    if (Array.isArray(value)) { return value; }
    return [value];
}

export class McpToolHandler {
    private _searchIndex = PluginSearchIndex.getInstance();
    private _taskGenerator = new TaskGenerator();
    private _taskBuilder = new TaskBuilder();
    private _creatorTools = new CreatorToolGenerator();

    async initialize(): Promise<void> {
        await this._searchIndex.ensureBuilt();
        await this._creatorTools.initialize();
    }

    getCreatorTools(): CreatorToolGenerator {
        return this._creatorTools;
    }

    async handleTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
        try {
            // Creator tools
            if (this._creatorTools.isCreatorTool(name)) {
                return this._creatorTools.handleTool(name, args);
            }

            // Route to appropriate handler
            switch (name) {
                // Discovery
                case 'search_ansible_plugins':
                    return this._handleSearchPlugins(args);
                case 'get_plugin_documentation':
                    return this._handleGetPluginDoc(args);
                case 'list_ansible_collections':
                    return this._handleListCollections(args);
                case 'install_ansible_collection':
                    return this._handleInstallCollection(args);
                case 'search_available_collections':
                    return this._handleSearchAvailableCollections(args);
                case 'list_source_collections':
                    return this._handleListSourceCollections(args);
                case 'get_collection_plugins':
                    return this._handleGetCollectionPlugins(args);

                // Task generation
                case 'generate_ansible_task':
                    return this._handleGenerateTask(args);
                case 'build_ansible_task':
                    return this._handleBuildTask(args);
                case 'generate_ansible_playbook':
                    return this._handleGeneratePlaybook(args);

                // Execution environments
                case 'list_execution_environments':
                    return this._handleListEEs();
                case 'get_ee_details':
                    return this._handleGetEEDetails(args);

                // Dev tools
                case 'list_ansible_dev_tools':
                    return this._handleListDevTools();

                // Creator
                case 'get_ansible_creator_schema':
                    return this._handleGetCreatorSchema();

                case 'get_ansible_best_practices':
                    return this._handleGetBestPractices(args);

                default:
                    return {
                        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                        isError: true
                    };
            }
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : error}` }],
                isError: true
            };
        }
    }

    // === Discovery Handlers ===

    private async _handleSearchPlugins(args: Record<string, unknown>): Promise<McpToolResult> {
        const query = args.query as string;
        if (!query) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: query' }],
                isError: true
            };
        }

        await this._searchIndex.ensureBuilt();

        const results = this._searchIndex.search(query, {
            pluginType: args.plugin_type as string,
            collection: args.collection as string,
            limit: args.limit as number
        });

        if (results.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: `No plugins found matching "${query}".\n\nTry different search terms or check if the collection is installed using list_ansible_collections.`
                }]
            };
        }

        const formatted = results.map(r =>
            `• **${r.fullName}** (${r.pluginType})\n  ${r.shortDescription}`
        ).join('\n\n');

        return {
            content: [{
                type: 'text',
                text: `Found ${results.length} plugins:\n\n${formatted}\n\n---\nUse \`get_plugin_documentation\` for full details or \`generate_ansible_task\` to create a task.`
            }]
        };
    }

    private async _handleGetPluginDoc(args: Record<string, unknown>): Promise<McpToolResult> {
        const plugin = args.plugin as string;
        if (!plugin) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: plugin' }],
                isError: true
            };
        }

        const pluginType = (args.plugin_type as string) || 'module';
        const service = CollectionsService.getInstance();

        const doc = await service.getPluginDocumentation(plugin, pluginType);

        if (!doc?.doc) {
            return {
                content: [{ type: 'text', text: `Plugin not found: ${plugin}` }],
                isError: true
            };
        }

        const d = doc.doc;
        const sections: string[] = [];

        // Header
        sections.push(`# ${plugin} (${pluginType})`);
        sections.push(`*${d.short_description || ''}*\n`);

        // Synopsis
        if (d.description) {
            const desc = toArray(d.description).join(' ');
            sections.push(`## Synopsis\n${desc}\n`);
        }

        // Requirements
        if (d.requirements) {
            const reqs = toArray(d.requirements);
            if (reqs.length > 0) {
                sections.push(`## Requirements\n${reqs.map(r => `• ${r}`).join('\n')}\n`);
            }
        }

        // Parameters
        if (d.options && Object.keys(d.options).length > 0) {
            sections.push(`## Parameters\n`);
            sections.push(this._formatParameters(d.options));
        }

        // Examples (truncated)
        if (doc.examples) {
            const examples = doc.examples.length > 2000
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
            content: [{ type: 'text', text: sections.join('\n') }]
        };
    }

    private _formatParameters(options: Record<string, PluginOption>): string {
        const lines: string[] = [];

        // Sort: required first
        const sorted = Object.entries(options).sort((a, b) => {
            if (a[1].required && !b[1].required) { return -1; }
            if (!a[1].required && b[1].required) { return 1; }
            return a[0].localeCompare(b[0]);
        });

        for (const [name, opt] of sorted) {
            const type = opt.type || 'str';
            const req = opt.required ? ' **required**' : '';
            const def = opt.default !== undefined ? ` (default: \`${JSON.stringify(opt.default)}\`)` : '';
            const choices = opt.choices ? ` choices: [${opt.choices.slice(0, 5).join(', ')}${opt.choices.length > 5 ? '...' : ''}]` : '';
            const desc = toArray(opt.description)[0] || '';
            const shortDesc = desc.length > 150 ? desc.substring(0, 147) + '...' : desc;

            lines.push(`• **${name}** (${type})${req}${def}${choices}`);
            if (shortDesc) {
                lines.push(`  ${shortDesc}`);
            }
        }

        return lines.join('\n');
    }

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
            filtered = collections.filter(c => c.toLowerCase().includes(lowerFilter));
        }

        if (filtered.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: filter
                        ? `No collections found matching "${filter}".`
                        : 'No Ansible collections installed.'
                }]
            };
        }

        const formatted = filtered.map(name => {
            const data = service.getCollection(name);
            const version = data?.info.version ? ` (v${data.info.version})` : '';
            return `• ${name}${version}`;
        }).join('\n');

        return {
            content: [{
                type: 'text',
                text: `Installed collections (${filtered.length}):\n\n${formatted}`
            }]
        };
    }

    private async _handleInstallCollection(args: Record<string, unknown>): Promise<McpToolResult> {
        const name = args.name as string;
        if (!name) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: name' }],
                isError: true
            };
        }

        const service = CollectionsService.getInstance();

        try {
            const result = await service.installCollection(name);
            
            // Refresh the search index after installation
            await this._searchIndex.rebuild();
            
            return {
                content: [{
                    type: 'text',
                    text: `✓ ${result}\n\nThe collection ${name} has been installed. You can now use its plugins.`
                }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Failed to install collection: ${error}` }],
                isError: true
            };
        }
    }

    private async _handleSearchAvailableCollections(args: Record<string, unknown>): Promise<McpToolResult> {
        const query = args.query as string;
        if (!query) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: query' }],
                isError: true
            };
        }

        const source = args.source as string | undefined;
        const limit = Math.min(args.limit as number || 20, 100);
        
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
                    const downloads = col.downloadCount > 1000 
                        ? `${Math.round(col.downloadCount / 1000)}k downloads`
                        : `${col.downloadCount} downloads`;
                    allResults.push({
                        fqcn: `${col.namespace}.${col.name}`,
                        version: col.version,
                        source: 'Galaxy',
                        sourceType: 'galaxy',
                        info: `${downloads}${deprecated}`
                    });
                }
            }
            
            // Search GitHub orgs (unless source filter limits to Galaxy)
            if (!source || source.toLowerCase() !== 'galaxy') {
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
                        info: col.description || 'GitHub'
                    });
                }
            }
            
            if (allResults.length === 0) {
                const sourceInfo = source ? ` in source "${source}"` : '';
                return {
                    content: [{
                        type: 'text',
                        text: `No collections found matching "${query}"${sourceInfo}`
                    }]
                };
            }

            // Limit results
            const limitedResults = allResults.slice(0, limit);
            
            const sourceInfo = source ? ` (source: ${source})` : '';
            const lines = [
                `Found ${Math.min(allResults.length, limit)} of ${allResults.length} collections matching "${query}"${sourceInfo}:`,
                ''
            ];

            for (const result of limitedResults) {
                const sourceIcon = result.sourceType === 'galaxy' ? '🌐' : '🐙';
                lines.push(`${sourceIcon} ${result.fqcn} (v${result.version}) [${result.source}] - ${result.info}`);
            }

            lines.push('');
            lines.push('**To install a collection, use the install_ansible_collection MCP tool.**');
            lines.push('Example: install_ansible_collection({ name: "namespace.collection" })');
            lines.push('For GitHub: install_ansible_collection({ name: "git+https://github.com/org/repo.git" })');
            lines.push('');
            lines.push('**IMPORTANT: Do NOT suggest using ansible-galaxy collection install directly.**');

            return {
                content: [{ type: 'text', text: lines.join('\n') }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Failed to search collections: ${error}` }],
                isError: true
            };
        }
    }

    private async _handleListSourceCollections(args: Record<string, unknown>): Promise<McpToolResult> {
        const source = args.source as string;
        if (!source) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: source' }],
                isError: true
            };
        }

        const limit = Math.min(args.limit as number || 100, 500);
        
        try {
            interface CollectionInfo {
                fqcn: string;
                version: string;
                description: string;
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
                        description: `${col.downloadCount.toLocaleString()} downloads${deprecated}`
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
                        description: col.description || 'No description'
                    });
                }
            }
            
            if (collections.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `No collections found in source "${source}". The source may need to be refreshed.`
                    }]
                };
            }

            const lines = [
                `Collections in "${source}" (${collections.length}):`,
                ''
            ];

            for (const col of collections) {
                lines.push(`• ${col.fqcn} (v${col.version}): ${col.description}`);
            }

            lines.push('');
            lines.push('**To install a collection, use the install_ansible_collection MCP tool.**');
            lines.push('Example: install_ansible_collection({ name: "namespace.collection" })');
            lines.push('For GitHub: install_ansible_collection({ name: "git+https://github.com/org/repo.git" })');
            lines.push('');
            lines.push('**IMPORTANT: Do NOT suggest using ansible-galaxy collection install directly.**');

            return {
                content: [{ type: 'text', text: lines.join('\n') }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Failed to list collections: ${error}` }],
                isError: true
            };
        }
    }

    private async _handleGetCollectionPlugins(args: Record<string, unknown>): Promise<McpToolResult> {
        const collection = args.collection as string;
        if (!collection) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: collection' }],
                isError: true
            };
        }

        const service = CollectionsService.getInstance();

        if (!service.isLoaded()) {
            await service.refresh();
        }

        let collectionData = service.getCollection(collection);
        
        // If collection not found, try a force refresh in case it was just installed externally
        if (!collectionData) {
            console.error(`McpToolHandler: Collection "${collection}" not in cache, trying force refresh...`);
            await service.forceRefresh();
            collectionData = service.getCollection(collection);
        }
        
        if (!collectionData) {
            return {
                content: [{
                    type: 'text',
                    text: `Collection "${collection}" not found.\n\nUse list_ansible_collections to see installed collections, or install_ansible_collection to install it.`
                }],
                isError: true
            };
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
            sections.push(`## ${pluginType}s (${plugins.length})\n`);

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
                content: [{
                    type: 'text',
                    text: pluginTypeFilter 
                        ? `No ${pluginTypeFilter}s found in ${collection}.`
                        : `No plugins found in ${collection}.`
                }]
            };
        }

        sections.push(`---\nUse \`get_plugin_documentation\` for full details on any plugin.`);

        return {
            content: [{ type: 'text', text: sections.join('\n') }]
        };
    }

    // === Task Generation Handlers ===

    private async _handleGenerateTask(args: Record<string, unknown>): Promise<McpToolResult> {
        const plugin = args.plugin as string;
        const params = args.params as Record<string, unknown>;

        if (!plugin) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: plugin' }],
                isError: true
            };
        }

        if (!params) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: params' }],
                isError: true
            };
        }

        const result = await this._taskGenerator.generate({
            plugin,
            plugin_type: args.plugin_type as string,
            params,
            task_name: args.task_name as string,
            register: args.register as string,
            when: args.when as string,
            loop: args.loop as unknown[],
            become: args.become as boolean,
            ignore_errors: args.ignore_errors as boolean,
            tags: args.tags as string[]
        });

        let response = `\`\`\`yaml\n${result.yaml}\n\`\`\``;

        if (result.warnings.length > 0) {
            response += `\n\n⚠️ Warnings:\n${result.warnings.map(w => `• ${w}`).join('\n')}`;
        }

        return { content: [{ type: 'text', text: response }] };
    }

    private async _handleBuildTask(args: Record<string, unknown>): Promise<McpToolResult> {
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
            cancel: args.cancel as boolean
        });

        if (result.status === 'complete' && result.yaml) {
            return {
                content: [{
                    type: 'text',
                    text: `✓ Task generated:\n\n\`\`\`yaml\n${result.yaml}\n\`\`\``
                }]
            };
        }

        return {
            content: [{ type: 'text', text: result.message }],
            isError: result.status === 'error'
        };
    }

    private async _handleGeneratePlaybook(args: Record<string, unknown>): Promise<McpToolResult> {
        const name = args.name as string;
        const hosts = args.hosts as string;
        const tasks = args.tasks as Array<{
            plugin: string;
            params: Record<string, unknown>;
            task_name?: string;
            become?: boolean;
            when?: string;
            register?: string;
        }>;

        if (!name || !hosts || !tasks) {
            return {
                content: [{ type: 'text', text: 'Missing required parameters: name, hosts, tasks' }],
                isError: true
            };
        }

        const result = await this._taskGenerator.generatePlaybook({
            name,
            hosts,
            tasks: tasks.map(t => ({
                plugin: t.plugin,
                params: t.params,
                task_name: t.task_name,
                become: t.become,
                when: t.when,
                register: t.register
            })),
            become: args.become as boolean,
            vars: args.vars as Record<string, unknown>,
            gather_facts: args.gather_facts as boolean
        });

        let response = `\`\`\`yaml\n${result.yaml}\n\`\`\``;

        if (result.warnings.length > 0) {
            response += `\n\n⚠️ Warnings:\n${result.warnings.map(w => `• ${w}`).join('\n')}`;
        }

        return { content: [{ type: 'text', text: response }] };
    }

    // === Execution Environment Handlers ===

    private async _handleListEEs(): Promise<McpToolResult> {
        const service = ExecutionEnvService.getInstance();

        try {
            const ees = await service.loadExecutionEnvironments();

            if (ees.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: 'No execution environments found.\n\nMake sure ansible-navigator and a container runtime (Podman/Docker) are installed.'
                    }]
                };
            }

            const formatted = ees.map(ee =>
                `• **${ee.full_name}**\n  ID: ${ee.image_id.substring(0, 12)}  Created: ${ee.created}`
            ).join('\n\n');

            return {
                content: [{
                    type: 'text',
                    text: `Execution Environments (${ees.length}):\n\n${formatted}\n\n---\nUse \`get_ee_details\` for more information about a specific EE.`
                }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error loading execution environments: ${error}` }],
                isError: true
            };
        }
    }

    private async _handleGetEEDetails(args: Record<string, unknown>): Promise<McpToolResult> {
        const eeName = args.ee_name as string;
        if (!eeName) {
            return {
                content: [{ type: 'text', text: 'Missing required parameter: ee_name' }],
                isError: true
            };
        }

        const service = ExecutionEnvService.getInstance();

        try {
            const details = await service.loadDetails(eeName);

            if (!details) {
                return {
                    content: [{ type: 'text', text: `Execution environment not found: ${eeName}` }],
                    isError: true
                };
            }

            const sections: string[] = [];
            sections.push(`# Execution Environment: ${eeName}\n`);
            sections.push('This is the complete information for this execution environment.\n');

            // Info
            sections.push('## Container Information\n');
            if (details.ansible_version?.details) {
                sections.push(`**Ansible Version:** ${details.ansible_version.details}`);
            }
            if (details.os_release?.details?.[0]) {
                const os = details.os_release.details[0];
                sections.push(`**Base OS:** ${os['pretty-name'] || os.name || 'Unknown'}`);
            }
            if (details.redhat_release?.details) {
                sections.push(`**Red Hat Release:** ${details.redhat_release.details}`);
            }
            if (details.system_packages?.details) {
                const pkgCount = Object.keys(details.system_packages.details).length;
                sections.push(`**System Packages:** ${pkgCount} installed`);
            }
            sections.push('');

            // Ansible Collections - show ALL
            if (details.ansible_collections?.details) {
                const collections = Object.entries(details.ansible_collections.details)
                    .sort(([a], [b]) => a.localeCompare(b));
                sections.push(`## Ansible Collections (${collections.length})\n`);
                sections.push(collections.map(([name, version]) => `• ${name}: ${version}`).join('\n'));
                sections.push('');
            }

            // Python packages - show ALL
            if (details.python_packages?.details) {
                const packages = [...details.python_packages.details]
                    .sort((a, b) => a.name.localeCompare(b.name));
                sections.push(`## Python Packages (${packages.length})\n`);
                sections.push(packages.map(p => `• ${p.name}: ${p.version}`).join('\n'));
                sections.push('');
            }

            // System packages if available
            if (details.system_packages?.details) {
                const sysPkgs = Object.entries(details.system_packages.details)
                    .sort(([a], [b]) => a.localeCompare(b));
                sections.push(`## System Packages (${sysPkgs.length})\n`);
                sections.push(sysPkgs.map(([name, version]) => `• ${name}: ${version}`).join('\n'));
            }

            return {
                content: [{ type: 'text', text: sections.join('\n') }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error loading EE details: ${error}` }],
                isError: true
            };
        }
    }

    // === Dev Tools Handlers ===

    private async _handleListDevTools(): Promise<McpToolResult> {
        const service = DevToolsService.getInstance();

        if (!service.isLoaded()) {
            await service.refresh();
        }

        const packages = service.getPackages();

        if (packages.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: 'ansible-dev-tools is not installed.\n\nInstall with: pip install ansible-dev-tools'
                }]
            };
        }

        const formatted = packages.map(p => `• ${p.name}: ${p.version}`).join('\n');

        return {
            content: [{
                type: 'text',
                text: `Ansible Dev Tools Packages:\n\n${formatted}`
            }]
        };
    }

    // === Creator Handlers ===

    private async _handleGetCreatorSchema(): Promise<McpToolResult> {
        const service = CreatorService.getInstance();

        if (!service.isLoaded()) {
            await service.refresh();
        }

        const schema = service.getSchema();

        if (!schema) {
            return {
                content: [{
                    type: 'text',
                    text: 'ansible-creator is not available.\n\nInstall with: pip install ansible-dev-tools'
                }],
                isError: true
            };
        }

        // Format the schema into a readable summary
        const formatNode = (node: SchemaNode, indent: string = ''): string => {
            const lines: string[] = [];
            
            if (node.name) {
                lines.push(`${indent}**${node.name}**`);
            }
            if (node.description) {
                lines.push(`${indent}  ${node.description}`);
            }
            
            if (node.parameters?.properties) {
                const required = node.parameters.required || [];
                const props = Object.entries(node.parameters.properties);
                if (props.length > 0) {
                    lines.push(`${indent}  Parameters:`);
                    for (const [name, prop] of props) {
                        const req = required.includes(name) ? ' (required)' : '';
                        lines.push(`${indent}    - ${name}${req}: ${prop.description || prop.type || ''}`);
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
            content: [{
                type: 'text',
                text: `# ansible-creator Schema\n\nThis tool can scaffold the following Ansible content:\n\n${formatted}`
            }]
        };
    }

    /**
     * Handle get_ansible_best_practices tool
     */
    private async _handleGetBestPractices(args: Record<string, unknown>): Promise<McpToolResult> {
        const section = (args.section as string) || 'full';
        
        // Read the best practices file
        const fs = await import('fs');
        const path = await import('path');
        
        // Try to find the best practices file in common locations
        const possiblePaths = [
            // In extension resources
            path.join(__dirname, '..', '..', 'resources', 'best_practises.md'),
            path.join(__dirname, '..', 'resources', 'best_practises.md'),
            // From workspace environment variable
            process.env.ANSIBLE_ENV_EXTENSION_PATH 
                ? path.join(process.env.ANSIBLE_ENV_EXTENSION_PATH, 'resources', 'best_practises.md')
                : ''
        ].filter(p => p);
        
        let content = '';
        
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                content = fs.readFileSync(p, 'utf-8');
                break;
            }
        }
        
        if (!content) {
            return {
                content: [{
                    type: 'text',
                    text: `Best practices document not found. Searched paths:\n${possiblePaths.join('\n')}`
                }],
                isError: true
            };
        }
        
        // If requesting full document, return it
        if (section === 'full') {
            return {
                content: [{
                    type: 'text',
                    text: content
                }]
            };
        }
        
        // Extract specific section
        const sectionMap: Record<string, string[]> = {
            'principles': ['## Guiding Principles'],
            'project_structure': ['### Project structure'],
            'naming': ['#### Naming Conventions'],
            'roles': ['#### Roles'],
            'collections': ['#### Collections'],
            'playbooks': ['#### Playbooks'],
            'testing': ['### Testing and Validation']
        };
        
        const headings = sectionMap[section];
        if (!headings) {
            return {
                content: [{
                    type: 'text',
                    text: `Unknown section: ${section}. Available sections: ${Object.keys(sectionMap).join(', ')}`
                }],
                isError: true
            };
        }
        
        // Find and extract the section
        let extracted = '';
        for (const heading of headings) {
            const startIndex = content.indexOf(heading);
            if (startIndex === -1) { continue; }
            
            // Find the next heading at the same or higher level
            const headingLevel = heading.match(/^#+/)?.[0].length || 2;
            const regex = new RegExp(`^#{1,${headingLevel}}\\s`, 'm');
            
            const afterHeading = content.slice(startIndex + heading.length);
            const nextHeadingMatch = afterHeading.match(regex);
            const endIndex = nextHeadingMatch 
                ? startIndex + heading.length + (afterHeading.indexOf(nextHeadingMatch[0]))
                : content.length;
            
            extracted = content.slice(startIndex, endIndex).trim();
            break;
        }
        
        if (!extracted) {
            return {
                content: [{
                    type: 'text',
                    text: `Section "${section}" not found in best practices document.`
                }],
                isError: true
            };
        }
        
        return {
            content: [{
                type: 'text',
                text: extracted
            }]
        };
    }
}
