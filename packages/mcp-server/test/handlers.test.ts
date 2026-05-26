import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
    const mod = await importOriginal<typeof import('fs')>();
    return {
        ...mod,
        existsSync: (...args: Parameters<typeof mod.existsSync>) => fsMock.existsSync(...args),
        readFileSync: (...args: Parameters<typeof mod.readFileSync>) => fsMock.readFileSync(...args),
    };
});

const hoisted = vi.hoisted(() => {
    const getPluginDocumentation = vi.fn();
    const forceRefresh = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const listCollectionNames = vi.fn(() => ['ansible.builtin']);
    const getCollection = vi.fn((name: string) => ({
        info: {
            name,
            version: '1.0.0',
            description: 'Built-in modules',
            authors: [] as string[],
        },
        pluginTypes: new Map([
            [
                'module',
                [
                    {
                        name: 'copy',
                        fullName: 'ansible.builtin.copy',
                        shortDescription: 'Copy files to path',
                    },
                ],
            ],
        ]),
    }));
    const getCollections = vi.fn(() => new Map<string, unknown>());
    const listPluginTypes = vi.fn(() => ['module']);
    const getPlugins = vi.fn(() => [
        {
            name: 'copy',
            fullName: 'ansible.builtin.copy',
            shortDescription: 'Copy files to path',
        },
    ]);
    const installCollection = vi.fn().mockResolvedValue('Collection installed successfully');
    const isLoaded = vi.fn(() => true);

    const collectionsInstance = {
        getPluginDocumentation,
        isLoaded,
        forceRefresh,
        refresh,
        listCollectionNames,
        getCollection,
        getCollections,
        listPluginTypes,
        getPlugins,
        installCollection,
        onDidChange: vi.fn((_listener: () => void) => ({ dispose: vi.fn() })),
    };

    const galaxyInstance = {
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
        search: vi.fn(() => [] as Array<{
            namespace: string;
            name: string;
            version: string;
            deprecated: boolean;
            downloadCount: number;
        }>),
        getCollections: vi.fn(() => [] as Array<{
            namespace: string;
            name: string;
            version: string;
            deprecated: boolean;
            downloadCount: number;
        }>),
    };

    const githubInstance = {
        loadFromDisk: vi.fn(),
        search: vi.fn(() => [] as Array<{
            namespace: string;
            name: string;
            version: string;
            description: string;
            org: string;
        }>),
        getCollections: vi.fn(() => [] as Array<{
            namespace: string;
            name: string;
            version: string;
            description: string;
        }>),
    };

    const eeInstance = {
        loadExecutionEnvironments: vi.fn().mockResolvedValue([] as Array<{
            full_name: string;
            image_id: string;
            created: string;
        }>),
        loadDetails: vi.fn().mockResolvedValue(null as unknown),
    };

    const devToolsInstance = {
        isLoaded: vi.fn(() => true),
        refresh: vi.fn().mockResolvedValue(undefined),
        getPackages: vi.fn(() => [{ name: 'ansible-lint', version: '1.0.0' }]),
    };

    const creatorInstance = {
        isLoaded: vi.fn(() => true),
        refresh: vi.fn().mockResolvedValue(undefined),
        getSchema: vi.fn(() => null as unknown),
        loadSchema: vi.fn().mockResolvedValue(null),
    };

    return {
        getPluginDocumentation,
        collectionsInstance,
        galaxyInstance,
        githubInstance,
        eeInstance,
        devToolsInstance,
        creatorInstance,
        forceRefresh,
        listCollectionNames,
        getCollection,
        getCollections,
        listPluginTypes,
        getPlugins,
        installCollection,
        isLoaded,
        galaxySearch: galaxyInstance.search,
        githubSearch: githubInstance.search,
        githubGetCollections: githubInstance.getCollections,
    };
});

vi.mock('@ansible/core', () => ({
    CollectionsService: {
        getInstance: vi.fn(() => hoisted.collectionsInstance),
    },
    DevToolsService: {
        getInstance: vi.fn(() => hoisted.devToolsInstance),
    },
    ExecutionEnvService: {
        getInstance: vi.fn(() => hoisted.eeInstance),
    },
    CreatorService: {
        getInstance: vi.fn(() => hoisted.creatorInstance),
    },
    GalaxyCollectionCache: {
        getInstance: vi.fn(() => hoisted.galaxyInstance),
    },
    GitHubCollectionCache: {
        getInstance: vi.fn(() => hoisted.githubInstance),
    },
}));

import { McpToolHandler } from '../src/handlers';

describe('McpToolHandler', () => {
    let handler: McpToolHandler;

    beforeEach(async () => {
        vi.clearAllMocks();
        fsMock.existsSync.mockReturnValue(false);
        fsMock.readFileSync.mockReturnValue('');

        hoisted.isLoaded.mockReturnValue(true);
        hoisted.listCollectionNames.mockReturnValue(['ansible.builtin']);
        hoisted.getCollection.mockImplementation((name: string) => ({
            info: {
                name,
                version: '1.0.0',
                description: 'Built-in modules',
                authors: [] as string[],
            },
            pluginTypes: new Map([
                [
                    'module',
                    [
                        {
                            name: 'copy',
                            fullName: 'ansible.builtin.copy',
                            shortDescription: 'Copy files to path',
                        },
                    ],
                ],
            ]),
        }));
        hoisted.getCollections.mockReturnValue(new Map());
        hoisted.listPluginTypes.mockReturnValue(['module']);
        hoisted.getPlugins.mockReturnValue([
            {
                name: 'copy',
                fullName: 'ansible.builtin.copy',
                shortDescription: 'Copy files to path',
            },
        ]);
        hoisted.installCollection.mockResolvedValue('Collection installed successfully');
        hoisted.forceRefresh.mockResolvedValue(undefined);
        hoisted.galaxyInstance.ensureLoaded.mockResolvedValue(undefined);
        hoisted.galaxyInstance.search.mockReturnValue([]);
        hoisted.galaxyInstance.getCollections.mockReturnValue([]);
        hoisted.githubInstance.search.mockReturnValue([]);
        hoisted.githubInstance.getCollections.mockReturnValue([]);
        hoisted.eeInstance.loadExecutionEnvironments.mockResolvedValue([]);
        hoisted.eeInstance.loadDetails.mockResolvedValue(null);
        hoisted.devToolsInstance.isLoaded.mockReturnValue(true);
        hoisted.devToolsInstance.getPackages.mockReturnValue([{ name: 'ansible-lint', version: '1.0.0' }]);
        hoisted.creatorInstance.getSchema.mockReturnValue(null);
        hoisted.creatorInstance.isLoaded.mockReturnValue(true);

        hoisted.getPluginDocumentation.mockResolvedValue({
            doc: {
                short_description: 'Copy files',
                options: {
                    src: { required: true, type: 'str', description: 'src' },
                    dest: { required: true, type: 'str', description: 'dest' },
                },
            },
        });
        handler = new McpToolHandler();
        await handler.initialize();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns error for unknown tool name', async () => {
        const result = await handler.handleTool('not_a_real_tool', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown tool');
    });

    it('routes search_ansible_plugins to the search handler', async () => {
        const result = await handler.handleTool('search_ansible_plugins', { query: 'copy' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('plugins');
    });

    it('routes get_plugin_documentation to the doc handler', async () => {
        const result = await handler.handleTool('get_plugin_documentation', {
            plugin: 'ansible.builtin.copy',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('ansible.builtin.copy');
        expect(hoisted.getPluginDocumentation).toHaveBeenCalledWith('ansible.builtin.copy', 'module');
    });

    it('routes generate_ansible_task through TaskGenerator', async () => {
        const result = await handler.handleTool('generate_ansible_task', {
            plugin: 'ansible.builtin.copy',
            params: { src: 'a', dest: 'b' },
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('```yaml');
        expect(result.content[0].text).toContain('ansible.builtin.copy');
    });

    it('routes creator-prefixed tools to CreatorToolGenerator', async () => {
        const result = await handler.handleTool('ac_fake_command', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown creator tool');
    });

    describe('list_ansible_collections', () => {
        it('calls forceRefresh and formats installed collections', async () => {
            hoisted.listCollectionNames.mockReturnValue(['ansible.builtin', 'community.general']);
            hoisted.getCollection.mockImplementation((name: string) => ({
                info: {
                    name,
                    version: name === 'ansible.builtin' ? '2.15.0' : '4.0.0',
                    description: '',
                    authors: [],
                },
                pluginTypes: new Map(),
            }));

            const result = await handler.handleTool('list_ansible_collections', {});

            expect(hoisted.forceRefresh).toHaveBeenCalled();
            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('Installed collections (2)');
            expect(result.content[0].text).toContain('ansible.builtin (v2.15.0)');
            expect(result.content[0].text).toContain('community.general (v4.0.0)');
        });

        it('filters collections when filter arg is set', async () => {
            hoisted.listCollectionNames.mockReturnValue(['ansible.builtin', 'community.general']);

            const result = await handler.handleTool('list_ansible_collections', { filter: 'community' });

            expect(result.content[0].text).toContain('community.general');
            expect(result.content[0].text).not.toContain('ansible.builtin');
        });

        it('returns message when no collections installed', async () => {
            hoisted.listCollectionNames.mockReturnValue([]);

            const result = await handler.handleTool('list_ansible_collections', {});

            expect(result.content[0].text).toContain('No Ansible collections installed');
        });

        it('returns message when filter matches nothing', async () => {
            hoisted.listCollectionNames.mockReturnValue(['ansible.builtin']);

            const result = await handler.handleTool('list_ansible_collections', { filter: 'nomatch' });

            expect(result.content[0].text).toContain('No collections found matching');
        });
    });

    describe('install_ansible_collection', () => {
        it('returns error when name is missing', async () => {
            const result = await handler.handleTool('install_ansible_collection', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Missing required parameter: name');
        });

        it('installs collection and formats success', async () => {
            const result = await handler.handleTool('install_ansible_collection', {
                name: 'namespace.mycollection',
            });

            expect(hoisted.installCollection).toHaveBeenCalledWith('namespace.mycollection');
            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('namespace.mycollection has been installed');
        });

        it('returns error when install fails', async () => {
            hoisted.installCollection.mockRejectedValue(new Error('galaxy offline'));

            const result = await handler.handleTool('install_ansible_collection', { name: 'x.y' });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Failed to install');
            expect(result.content[0].text).toContain('galaxy offline');
        });
    });

    describe('search_available_collections', () => {
        it('returns error when query is missing', async () => {
            const result = await handler.handleTool('search_available_collections', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Missing required parameter: query');
        });

        it('formats Galaxy search results', async () => {
            hoisted.galaxyInstance.search.mockReturnValue([
                {
                    namespace: 'ansible',
                    name: 'posix',
                    version: '1.5.0',
                    deprecated: false,
                    downloadCount: 5000,
                },
            ]);

            const result = await handler.handleTool('search_available_collections', {
                query: 'posix',
                limit: 10,
            });

            expect(hoisted.galaxyInstance.ensureLoaded).toHaveBeenCalled();
            expect(hoisted.galaxySearch).toHaveBeenCalledWith('posix');
            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('ansible.posix');
            expect(result.content[0].text).toContain('5k downloads');
            expect(result.content[0].text).toContain('install_ansible_collection');
        });

        it('includes GitHub results when source is not limited to galaxy', async () => {
            hoisted.githubInstance.search.mockReturnValue([
                {
                    namespace: 'ansible',
                    name: 'utils',
                    version: 'main',
                    description: 'Helpers',
                    org: 'ansible-collections',
                },
            ]);

            const result = await handler.handleTool('search_available_collections', {
                query: 'utils',
            });

            expect(hoisted.githubInstance.loadFromDisk).toHaveBeenCalled();
            expect(result.content[0].text).toContain('ansible.utils');
            expect(result.content[0].text).toContain('ansible-collections');
        });

        it('returns empty message when no matches', async () => {
            const result = await handler.handleTool('search_available_collections', { query: 'zzznone' });

            expect(result.content[0].text).toContain('No collections found');
        });

        it('returns error when search throws', async () => {
            hoisted.galaxyInstance.ensureLoaded.mockRejectedValue(new Error('network'));

            const result = await handler.handleTool('search_available_collections', { query: 'x' });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Failed to search collections');
        });
    });

    describe('list_source_collections', () => {
        it('returns error when source is missing', async () => {
            const result = await handler.handleTool('list_source_collections', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Missing required parameter: source');
        });

        it('lists Galaxy cache collections', async () => {
            hoisted.galaxyInstance.getCollections.mockReturnValue([
                {
                    namespace: 'a',
                    name: 'b',
                    version: '1.0.0',
                    deprecated: false,
                    downloadCount: 100,
                },
            ]);

            const result = await handler.handleTool('list_source_collections', { source: 'galaxy', limit: 50 });

            expect(hoisted.galaxyInstance.ensureLoaded).toHaveBeenCalled();
            expect(result.content[0].text).toContain('a.b');
            expect(result.content[0].text).toContain('100');
        });

        it('lists GitHub org collections', async () => {
            hoisted.githubInstance.getCollections.mockReturnValue([
                {
                    namespace: 'c',
                    name: 'd',
                    version: '2.0.0',
                    description: 'From GitHub',
                },
            ]);

            const result = await handler.handleTool('list_source_collections', { source: 'myorg' });

            expect(hoisted.githubInstance.loadFromDisk).toHaveBeenCalledWith('myorg');
            expect(hoisted.githubGetCollections).toHaveBeenCalledWith('myorg');
            expect(result.content[0].text).toContain('c.d');
            expect(result.content[0].text).toContain('From GitHub');
        });

        it('returns message when source has no collections', async () => {
            hoisted.githubInstance.getCollections.mockReturnValue([]);

            const result = await handler.handleTool('list_source_collections', { source: 'emptyorg' });

            expect(result.content[0].text).toContain('No collections found in source');
        });

        it('returns error when listing throws', async () => {
            hoisted.galaxyInstance.ensureLoaded.mockRejectedValue(new Error('disk'));

            const result = await handler.handleTool('list_source_collections', { source: 'galaxy' });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Failed to list collections');
        });
    });

    describe('get_collection_plugins', () => {
        it('returns error when collection is missing', async () => {
            const result = await handler.handleTool('get_collection_plugins', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Missing required parameter: collection');
        });

        it('formats plugins for an installed collection', async () => {
            const result = await handler.handleTool('get_collection_plugins', {
                collection: 'ansible.builtin',
            });

            expect(hoisted.listPluginTypes).toHaveBeenCalledWith('ansible.builtin');
            expect(hoisted.getPlugins).toHaveBeenCalled();
            expect(result.content[0].text).toContain('# ansible.builtin');
            expect(result.content[0].text).toContain('**copy**');
            expect(result.content[0].text).toContain('get_plugin_documentation');
        });

        it('returns not found when collection missing after refresh', async () => {
            hoisted.getCollection.mockReturnValue(undefined);

            const result = await handler.handleTool('get_collection_plugins', {
                collection: 'missing.ns',
            });

            expect(hoisted.forceRefresh).toHaveBeenCalled();
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('not found');
        });

        it('refreshes when service is not loaded', async () => {
            hoisted.isLoaded.mockReturnValue(false);

            await handler.handleTool('get_collection_plugins', { collection: 'ansible.builtin' });

            expect(hoisted.collectionsInstance.refresh).toHaveBeenCalled();
        });

        it('returns empty section when plugin_type filter matches nothing', async () => {
            hoisted.listPluginTypes.mockReturnValue(['module']);

            const result = await handler.handleTool('get_collection_plugins', {
                collection: 'ansible.builtin',
                plugin_type: 'lookup',
            });

            expect(result.content[0].text).toContain('No lookups found');
        });
    });

    describe('build_ansible_task', () => {
        it('completes when TaskBuilder returns yaml', async () => {
            const first = await handler.handleTool('build_ansible_task', {
                plugin: 'ansible.builtin.copy',
            });
            const sidMatch = first.content[0].text.match(/"session_id": "(task_[^"]+)"/);
            expect(sidMatch).toBeTruthy();
            const sid = sidMatch![1];

            const complete = await handler.handleTool('build_ansible_task', {
                session_id: sid,
                params: { src: '/a', dest: '/b' },
                generate: true,
            });

            expect(complete.isError).toBeUndefined();
            expect(complete.content[0].text).toContain('Task generated');
            expect(complete.content[0].text).toContain('```yaml');
            expect(complete.content[0].text).toContain('ansible.builtin.copy');
        });
    });

    describe('generate_ansible_playbook', () => {
        it('returns error when required args missing', async () => {
            const result = await handler.handleTool('generate_ansible_playbook', {
                name: 'Site',
                hosts: 'all',
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Missing required parameters');
        });

        it('generates playbook yaml', async () => {
            const result = await handler.handleTool('generate_ansible_playbook', {
                name: 'Deploy',
                hosts: 'web',
                tasks: [
                    {
                        plugin: 'ansible.builtin.copy',
                        params: { src: '/x', dest: '/y' },
                        task_name: 'Copy config',
                    },
                ],
                become: true,
                gather_facts: false,
                vars: { app: 'demo' },
            });

            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('```yaml');
            expect(result.content[0].text).toContain('Deploy');
            expect(result.content[0].text).toContain('hosts: web');
            expect(result.content[0].text).toContain('gather_facts: false');
            expect(result.content[0].text).toContain('become: true');
            expect(result.content[0].text).toContain('app: demo');
        });
    });

    describe('list_execution_environments', () => {
        it('returns guidance when no EEs', async () => {
            const result = await handler.handleTool('list_execution_environments', {});

            expect(hoisted.eeInstance.loadExecutionEnvironments).toHaveBeenCalled();
            expect(result.content[0].text).toContain('No execution environments found');
        });

        it('formats EE list', async () => {
            hoisted.eeInstance.loadExecutionEnvironments.mockResolvedValue([
                {
                    full_name: 'ee-minimal',
                    image_id: 'sha256:abcdef123456',
                    created: '2024-01-01',
                },
            ]);

            const result = await handler.handleTool('list_execution_environments', {});

            expect(result.content[0].text).toContain('ee-minimal');
            expect(result.content[0].text).toContain('sha256:abcde');
            expect(result.content[0].text).toContain('get_ee_details');
        });

        it('returns error when load throws', async () => {
            hoisted.eeInstance.loadExecutionEnvironments.mockRejectedValue(new Error('podman'));

            const result = await handler.handleTool('list_execution_environments', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error loading execution environments');
        });
    });

    describe('get_ee_details', () => {
        it('returns error when ee_name missing', async () => {
            const result = await handler.handleTool('get_ee_details', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Missing required parameter: ee_name');
        });

        it('returns error when EE not found', async () => {
            const result = await handler.handleTool('get_ee_details', { ee_name: 'missing' });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('not found');
        });

        it('formats full EE details', async () => {
            hoisted.eeInstance.loadDetails.mockResolvedValue({
                ansible_version: { details: 'ansible [core 2.15]' },
                os_release: { details: [{ 'pretty-name': 'Fedora 40', name: 'fedora' }] },
                redhat_release: { details: 'Platform' },
                ansible_collections: {
                    details: { 'ansible.posix': '1.0.0', 'ansible.utils': '2.0.0' },
                },
                python_packages: {
                    details: [
                        { name: 'ansible', version: '8.0' },
                        { name: 'jinja2', version: '3.1' },
                    ],
                },
                system_packages: {
                    details: { bash: '5.2', curl: '8.0' },
                },
            });

            const result = await handler.handleTool('get_ee_details', { ee_name: 'my-ee' });

            expect(hoisted.eeInstance.loadDetails).toHaveBeenCalledWith('my-ee');
            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('Execution Environment: my-ee');
            expect(result.content[0].text).toContain('Ansible Collections (2)');
            expect(result.content[0].text).toContain('ansible.posix: 1.0.0');
            expect(result.content[0].text).toContain('Python Packages (2)');
            expect(result.content[0].text).toContain('System Packages (2)');
        });

        it('returns error when loadDetails throws', async () => {
            hoisted.eeInstance.loadDetails.mockRejectedValue(new Error('timeout'));

            const result = await handler.handleTool('get_ee_details', { ee_name: 'x' });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error loading EE details');
        });
    });

    describe('list_ansible_dev_tools', () => {
        it('refreshes when not loaded', async () => {
            hoisted.devToolsInstance.isLoaded.mockReturnValue(false);

            await handler.handleTool('list_ansible_dev_tools', {});

            expect(hoisted.devToolsInstance.refresh).toHaveBeenCalled();
        });

        it('formats package list', async () => {
            hoisted.devToolsInstance.getPackages.mockReturnValue([
                { name: 'ansible-navigator', version: '3.0' },
            ]);

            const result = await handler.handleTool('list_ansible_dev_tools', {});

            expect(result.content[0].text).toContain('Ansible Dev Tools Packages');
            expect(result.content[0].text).toContain('ansible-navigator: 3.0');
        });

        it('returns install hint when no packages', async () => {
            hoisted.devToolsInstance.getPackages.mockReturnValue([]);

            const result = await handler.handleTool('list_ansible_dev_tools', {});

            expect(result.content[0].text).toContain('ansible-dev-tools is not installed');
        });
    });

    describe('get_ansible_creator_schema', () => {
        it('returns error when schema is null', async () => {
            hoisted.creatorInstance.getSchema.mockReturnValue(null);

            const result = await handler.handleTool('get_ansible_creator_schema', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('ansible-creator is not available');
        });

        it('formats schema summary', async () => {
            hoisted.creatorInstance.getSchema.mockReturnValue({
                name: 'ansible-creator',
                description: 'Root',
                subcommands: {
                    init: {
                        name: 'init',
                        description: 'Initialize',
                        subcommands: {
                            playbook: {
                                name: 'playbook',
                                description: 'Scaffold playbook',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        project: { type: 'string', description: 'Name' },
                                    },
                                    required: ['project'],
                                },
                            },
                        },
                    },
                },
            });

            const result = await handler.handleTool('get_ansible_creator_schema', {});

            expect(hoisted.creatorInstance.refresh).not.toHaveBeenCalled();
            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('# ansible-creator Schema');
            expect(result.content[0].text).toContain('project');
            expect(result.content[0].text).toContain('(required)');
        });

        it('calls refresh when creator service is not loaded', async () => {
            hoisted.creatorInstance.isLoaded.mockReturnValue(false);
            hoisted.creatorInstance.getSchema.mockReturnValue({ name: 'ansible-creator', subcommands: {} });

            await handler.handleTool('get_ansible_creator_schema', {});

            expect(hoisted.creatorInstance.refresh).toHaveBeenCalled();
        });
    });

    describe('get_ansible_best_practices', () => {
        const doc = `## Guiding Principles\nDo good.\n\n### Project structure\nLayout here.\n\n#### Naming Conventions\nNames.\n`;

        it('returns error when file not found', async () => {
            fsMock.existsSync.mockReturnValue(false);

            const result = await handler.handleTool('get_ansible_best_practices', {});

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Best practices document not found');
        });

        it('returns full document when section is full', async () => {
            fsMock.existsSync.mockReturnValue(true);
            fsMock.readFileSync.mockReturnValue(doc);

            const result = await handler.handleTool('get_ansible_best_practices', { section: 'full' });

            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toBe(doc);
        });

        it('extracts named section', async () => {
            fsMock.existsSync.mockReturnValue(true);
            fsMock.readFileSync.mockReturnValue(doc);

            const result = await handler.handleTool('get_ansible_best_practices', {
                section: 'principles',
            });

            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('Guiding Principles');
            expect(result.content[0].text).toContain('Do good');
        });

        it('returns error for unknown section', async () => {
            fsMock.existsSync.mockReturnValue(true);
            fsMock.readFileSync.mockReturnValue(doc);

            const result = await handler.handleTool('get_ansible_best_practices', {
                section: 'not_a_section',
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unknown section');
        });

        it('returns error when known section heading is missing from file', async () => {
            fsMock.existsSync.mockReturnValue(true);
            fsMock.readFileSync.mockReturnValue('# Other doc\nNo principles here.\n');

            const result = await handler.handleTool('get_ansible_best_practices', {
                section: 'principles',
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Section "principles" not found');
        });

        it('stops section extraction at the next heading of same or higher level', async () => {
            const multi = `## Guiding Principles\nFirst line.\n## Other Section\nSkip this.\n`;
            fsMock.existsSync.mockReturnValue(true);
            fsMock.readFileSync.mockReturnValue(multi);

            const result = await handler.handleTool('get_ansible_best_practices', {
                section: 'principles',
            });

            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toContain('Guiding Principles');
            expect(result.content[0].text).toContain('First line');
            expect(result.content[0].text).not.toContain('Skip this');
        });
    });
});
