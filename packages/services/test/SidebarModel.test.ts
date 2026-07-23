import { describe, expect, it } from 'vitest';
import { SidebarModel } from '../src/SidebarModel';
import { assembleAiTools } from '../src/sidebar/assembleSidebarInput';

describe('SidebarModel', () => {
    const model = new SidebarModel();

    it('suggests envManagers when Python is unavailable', () => {
        const input = {
            pythonAvailable: false,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [],
            hasDevTools: false,
            collections: [],
            playbooks: [],
        };
        expect(model.suggestOpenSection(input)).toBe('envManagers');
        const snap = model.buildSnapshot(input);
        expect(snap.suggestedOpenSectionId).toBe('envManagers');
        const welcome = snap.sections.find((s) => s.id === 'envManagers')?.welcomeActions?.[0];
        expect(welcome?.label).toBe('Install Python Extension');
        expect(welcome?.args).toEqual(['ms-python.python']);
    });

    it('suggests devTools when ADT packages are missing', () => {
        const input = {
            pythonAvailable: true,
            enableAiFeatures: true,
            envManagers: [
                {
                    id: 'venv',
                    name: 'venv',
                    isGlobal: false,
                    environments: [
                        {
                            id: 'e1',
                            label: 'ansible-dev',
                            version: '3.12',
                            selected: true,
                        },
                    ],
                },
            ],
            devTools: [],
            hasDevTools: false,
            collections: [],
            playbooks: [],
        };
        expect(model.suggestOpenSection(input)).toBe('devTools');
        const snap = model.buildSnapshot(input);
        expect(snap.sections.find((s) => s.id === 'devTools')?.welcomeActions?.[0]?.command).toBe(
            'ansibleDevToolsPackages.install',
        );
    });

    it('collapses all when healthy', () => {
        const input = {
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
        };
        expect(model.suggestOpenSection(input)).toBeNull();
        expect(
            model.buildSnapshot(input).sections.find((s) => s.id === 'devTools')?.nodes,
        ).toHaveLength(1);
    });

    it('includes view/title header actions on env managers', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
        });
        const env = snap.sections.find((s) => s.id === 'envManagers');
        expect(env?.headerActions?.map((a) => a.command)).toEqual([
            'ansibleDevToolsEnvManagers.create',
            'ansibleDevToolsEnvManagers.refresh',
        ]);
    });

    it('buildSkeletonSnapshot paints headers with loading bodies', () => {
        const snap = model.buildSkeletonSnapshot({
            enableAiFeatures: true,
            lightspeedEnabled: true,
        });
        expect(snap.sections.map((s) => s.id)).toEqual([
            'envManagers',
            'devTools',
            'collections',
            'collectionSources',
            'executionEnvironments',
            'creator',
            'playbooks',
            'aiTools',
            'aiSkills',
            'lightspeed',
        ]);
        expect(snap.sections.every((s) => s.loading && s.nodes[0]?.label === 'Loading…')).toBe(
            true,
        );
        expect(snap.suggestedOpenSectionId).toBeNull();
    });

    it('includes all always-on native sections in order', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
        });
        expect(snap.sections.map((s) => s.id)).toEqual([
            'envManagers',
            'devTools',
            'collections',
            'collectionSources',
            'executionEnvironments',
            'creator',
            'playbooks',
        ]);
    });

    it('appends AI Tools and AI Skills when AI features are enabled', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: true,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            aiTools: [
                {
                    category: 'discovery',
                    categoryLabel: 'Discovery',
                    name: 'search_collections',
                    label: 'Search collections',
                    examplePrompt: 'search for collections',
                    toolInfo: { name: 'search_collections' },
                },
            ],
            skillSources: [
                {
                    id: 'builtin',
                    type: 'builtin',
                    url: 'bundled',
                    trust: 'certified',
                },
            ],
            skills: [
                {
                    id: 'builtin/demo',
                    source: 'builtin',
                    module: 'demo',
                    name: 'Demo Skill',
                    description: 'A demo skill',
                    triggers: [],
                    category: 'domain',
                    trust: 'certified',
                    tags: [],
                },
            ],
        });
        expect(snap.sections.map((s) => s.id)).toEqual([
            'envManagers',
            'devTools',
            'collections',
            'collectionSources',
            'executionEnvironments',
            'creator',
            'playbooks',
            'aiTools',
            'aiSkills',
        ]);
        const aiNodes = snap.sections.find((s) => s.id === 'aiTools')?.nodes ?? [];
        const discovery = aiNodes.find((n) => n.label === 'Discovery');
        expect(discovery?.description).toBe('1 tools');
    });

    it('appends Lightspeed when enabled', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            lightspeedEnabled: true,
            lightspeedItems: [
                {
                    label: 'Generate Playbook',
                    icon: 'wand',
                    command: 'ansible.lightspeed.playbookGeneration',
                },
            ],
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
        });
        expect(snap.sections.map((s) => s.id).at(-1)).toBe('lightspeed');
    });

    it('collection source collections are lazy-expandable like native', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: true,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            collectionSources: [
                {
                    id: 'galaxy',
                    name: 'Ansible Galaxy',
                    type: 'galaxy',
                    count: 100,
                    galaxyFilter: 'aws',
                    galaxyFilterResultCount: 1,
                    topCollections: [
                        {
                            name: 'amazon.aws',
                            namespace: 'amazon',
                            collectionName: 'aws',
                            version: '1.0.0',
                        },
                    ],
                },
                {
                    id: 'ansible',
                    name: 'ansible',
                    type: 'github',
                    count: 2,
                    topCollections: [
                        {
                            name: 'ansible.posix',
                            namespace: 'ansible',
                            collectionName: 'posix',
                            version: '1.5.0',
                            org: 'ansible',
                            repository: 'ansible/ansible.posix',
                        },
                    ],
                },
            ],
        });
        const section = snap.sections.find((s) => s.id === 'collectionSources');
        expect(section?.headerActions?.map((a) => a.command)).toEqual([
            'ansibleCollectionSources.search',
            'ansibleCollectionSources.install',
            'ansibleCollectionSources.addSource',
            'ansibleCollectionSources.refresh',
            'ansibleCollectionSources.aiSummary',
        ]);
        const galaxy = section?.nodes[0];
        expect(galaxy?.description).toContain('filter: "aws"');
        expect(galaxy?.actions?.map((a) => a.command)).toContain(
            'ansibleCollectionSources.clearGalaxyFilter',
        );
        const col = galaxy?.children?.[0];
        expect(col?.lazyChildren).toBe(true);
        expect(col?.expand).toEqual({
            kind: 'galaxyCollection',
            namespace: 'amazon',
            name: 'aws',
            version: '1.0.0',
        });
        expect(col?.actions?.[0]?.command).toBe('ansibleCollectionSources.installGalaxyCollection');
        const gh = section?.nodes[1];
        expect(gh?.actions?.map((a) => a.command)).toContain(
            'ansibleCollectionSources.installFromSource',
        );
        expect(gh?.children?.[0]?.actions?.[0]?.command).toBe(
            'ansibleCollectionSources.refreshGitHubCollection',
        );
    });

    it('creator leaf matches native title/summary and openForm args', () => {
        const schema = {
            name: 'ansible-creator',
            subcommands: {
                init: {
                    name: 'init',
                    subcommands: {
                        collection: {
                            name: 'collection',
                            description: 'Create a new Ansible collection project.',
                        },
                    },
                },
            },
        };
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: true,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            creator: { status: 'ready', schema },
        });
        const init = snap.sections.find((s) => s.id === 'creator')?.nodes[0];
        const collection = init?.children?.[0];
        expect(collection?.label).toBe('Collection');
        expect(collection?.description).toBe('Create a new Ansible collection project.');
        expect(collection?.actions?.[0]).toMatchObject({
            command: 'ansibleCreator.openForm',
            args: [['init', 'collection'], schema.subcommands.init.subcommands.collection],
        });
        expect(collection?.actions?.[1]).toMatchObject({
            command: 'ansibleCreator.aiEntrySummary',
            label: 'Generate with AI',
        });
    });

    it('passes playbook payload args on edit/run actions (not node ids)', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: true,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [
                {
                    name: 'site.yml',
                    path: '/tmp/ws/site.yml',
                    relativePath: 'site.yml',
                    plays: [{ name: 'Play 1', hosts: 'all', lineNumber: 1 }],
                },
            ],
            playbookWorkspaces: [
                {
                    name: 'ws',
                    path: '/tmp/ws',
                    playbooks: [
                        {
                            name: 'site.yml',
                            path: '/tmp/ws/site.yml',
                            relativePath: 'site.yml',
                            plays: [{ name: 'Play 1', hosts: 'all', lineNumber: 1 }],
                        },
                    ],
                },
            ],
        });
        const pb = snap.sections.find((s) => s.id === 'playbooks')?.nodes[0];
        const edit = pb?.actions?.find((a) => a.command === 'ansiblePlaybooks.openPlaybook');
        expect(edit?.args?.[0]).toEqual({
            playbook: {
                name: 'site.yml',
                path: '/tmp/ws/site.yml',
                relativePath: 'site.yml',
                plays: [{ name: 'Play 1', hosts: 'all', lineNumber: 1 }],
            },
        });
        expect(pb?.children?.[0]?.actions?.[0]?.command).toBe('ansiblePlaybooks.goToPlay');
    });

    it('env leaves select via envId args for host enrich', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [
                {
                    id: 'venv',
                    name: 'venv',
                    isGlobal: false,
                    environments: [
                        {
                            id: 'env-1',
                            label: 'ansible-dev',
                            version: '3.12',
                            path: '/home/user/.venv',
                            selected: true,
                        },
                    ],
                },
            ],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
        });
        const env = snap.sections.find((s) => s.id === 'envManagers')?.nodes[0]?.children?.[0];
        expect(env?.actions?.[0]).toMatchObject({
            command: 'ansibleDevTools.selectEnvironment',
            args: [{ envId: 'env-1' }],
        });
        expect(env?.tooltip).toContain('ansible-dev');
        expect(env?.tooltip).toContain('Version: 3.12');
        expect(env?.tooltip).toContain('Path: /home/user/.venv');
    });

    it('shows MCP warning and Lightspeed auth-gated sign-in', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: true,
            mcpConfigured: false,
            mcpIdeLabel: 'Cursor',
            lightspeedEnabled: true,
            lightspeedAuthenticated: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            aiTools: [],
        });
        const ai = snap.sections.find((s) => s.id === 'aiTools');
        expect(ai?.nodes[0]?.id).toBe('mcp-warning');
        expect(ai?.nodes[0]?.actions?.[0]?.command).toBe('ansibleMcpTools.configure');
        const ls = snap.sections.find((s) => s.id === 'lightspeed');
        expect(ls?.nodes).toHaveLength(1);
        expect(ls?.nodes[0]?.command ?? ls?.nodes[0]?.actions?.[0]?.command).toBe(
            'ansible.lightspeed.oauth',
        );
    });

    it('EE rows are lazy-expandable for detail categories', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            executionEnvironments: [
                {
                    created: 'today',
                    execution_environment: true,
                    full_name: 'ghcr.io/ansible/community-ansible-dev-tools:devel',
                    image_id: 'sha',
                },
            ],
        });
        const ee = snap.sections.find((s) => s.id === 'executionEnvironments')?.nodes[0];
        expect(ee?.label).toBe('community-ansible-dev-tools:devel');
        expect(ee?.description).toBeUndefined();
        expect(ee?.tooltip).toContain('ghcr.io/ansible/community-ansible-dev-tools:devel');
        expect(ee?.tooltip).toContain('Created: today');
        expect(ee?.lazyChildren).toBe(true);
        expect(ee?.expand).toEqual({
            kind: 'eeDetail',
            fullName: 'ghcr.io/ansible/community-ansible-dev-tools:devel',
        });
        expect(ee?.actions?.[0]?.args).toEqual([
            'ghcr.io/ansible/community-ansible-dev-tools:devel',
        ]);
    });

    it('shows python-only welcome with python-envs install when no managers', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            pythonEnvCapability: 'python-only',
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
        });
        const env = snap.sections.find((s) => s.id === 'envManagers');
        expect(env?.welcomeActions?.map((a) => a.command)).toEqual([
            'workbench.extensions.search',
            'ansibleDevToolsEnvManagers.create',
        ]);
        expect(env?.welcomeActions?.[0]?.args).toEqual(['ms-python.vscode-python-envs']);
    });

    it('marks global manager not recommended only when a global env is selected', () => {
        const base = {
            pythonAvailable: true,
            enableAiFeatures: false,
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [] as [],
            playbooks: [] as [],
        };
        const unselected = model.buildSnapshot({
            ...base,
            envManagers: [
                {
                    id: 'ms-python:system',
                    name: 'Global',
                    isGlobal: true,
                    environments: [{ id: 'g1', label: 'python', version: '3.12', selected: false }],
                },
            ],
        });
        const globalNode = unselected.sections.find((s) => s.id === 'envManagers')?.nodes[0];
        expect(globalNode?.description).toBeUndefined();
        expect(globalNode?.warning).toBe(false);

        const selected = model.buildSnapshot({
            ...base,
            envManagers: [
                {
                    id: 'ms-python:system',
                    name: 'Global',
                    isGlobal: true,
                    environments: [{ id: 'g1', label: 'python', version: '3.12', selected: true }],
                },
            ],
        });
        const selectedGlobal = selected.sections.find((s) => s.id === 'envManagers')?.nodes[0];
        expect(selectedGlobal?.description).toBe('not recommended');
        expect(selectedGlobal?.warning).toBe(true);
    });

    it('shows ansible-navigator missing EE message with install action', () => {
        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            executionEnvironmentsError: 'ansible-navigator not found in PATH',
        });
        const ee = snap.sections.find((s) => s.id === 'executionEnvironments')?.nodes[0];
        expect(ee?.id).toBe('ee-navigator-missing');
        expect(ee?.actions?.[0]?.command).toBe('ansibleDevToolsPackages.install');
    });

    it('shows empty EE description and creator message nodes', () => {
        const emptyEe = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            executionEnvironments: [],
        });
        expect(
            emptyEe.sections.find((s) => s.id === 'executionEnvironments')?.nodes[0],
        ).toMatchObject({
            id: 'ee-empty',
            description: 'Build or pull an EE image',
        });

        const creator = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            creator: { status: 'not-installed', schema: null },
        });
        const node = creator.sections.find((s) => s.id === 'creator')?.nodes[0];
        expect(node?.label).toBe('ansible-creator not found');
        expect(node?.actions?.[0]?.command).toBe('ansibleDevToolsPackages.install');
    });

    it('AI skills: empty source shows URL hint; no skills shows root message', () => {
        const none = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: true,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            skillSources: [
                {
                    id: 'ai-forge',
                    type: 'github',
                    url: 'https://example.com/skills',
                    trust: 'community',
                },
            ],
            skills: [],
        });
        expect(none.sections.find((s) => s.id === 'aiSkills')?.nodes[0]?.id).toBe('skills-none');

        const mixed = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: true,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '25.1.0' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            skillSources: [
                {
                    id: 'empty-src',
                    type: 'github',
                    url: 'https://example.com/empty',
                    trust: 'community',
                },
                {
                    id: 'full-src',
                    type: 'builtin',
                    url: '',
                    trust: 'certified',
                },
            ],
            skills: [
                {
                    id: 'full-src/mod/skill',
                    source: 'full-src',
                    module: 'mod',
                    name: 'Skill',
                    description: 'd',
                    triggers: [],
                    category: 'domain',
                    trust: 'certified',
                    tags: [],
                },
            ],
        });
        const emptySrc = mixed.sections
            .find((s) => s.id === 'aiSkills')
            ?.nodes.find((n) => n.id === 'skill-src-empty-src');
        expect(emptySrc?.children?.[0]?.label).toContain('https://example.com/empty');
    });

    it('buildEeDetailNodes builds info and package categories', () => {
        const nodes = model.buildEeDetailNodes(
            'ee-1',
            'img:latest',
            {
                ansible_version: { details: '2.16' },
                image_name: 'img:latest',
                python_packages: {
                    details: [{ name: 'ansible-core', version: '2.16.0', summary: 'core' }],
                },
            },
            [{ name: 'bash', version: '5.0' }],
        );
        expect(nodes.map((n) => n.label)).toEqual(['Info', 'Python Packages', 'System Packages']);
        expect(nodes[1]?.children?.[0]?.actions?.[0]?.args).toEqual([
            'img:latest',
            'ansible-core',
            'python',
        ]);
    });

    it('buildPluginTypeNodes and patchNodeChildren resolve lazy rows', () => {
        const children = model.buildPluginTypeNodes(
            'col-1',
            {
                modules: [
                    {
                        name: 'copy',
                        fullName: 'ansible.builtin.copy',
                        shortDescription: 'Copy files',
                    },
                ],
            },
            { namespace: 'ansible', name: 'builtin', version: '1.0.0' },
            'galaxy',
            true,
        );
        expect(children[0]?.label).toBe('modules');
        expect(children[0]?.children?.[0]?.actions?.[0]?.command).toBe(
            'ansibleCollectionSources.showGalaxyPluginDoc',
        );
        expect(children[0]?.children?.[0]?.actions?.[1]?.command).toBe(
            'ansibleCollectionSources.galaxyPluginAiSummary',
        );

        const snap = model.buildSnapshot({
            pythonAvailable: true,
            enableAiFeatures: false,
            envManagers: [],
            devTools: [{ name: 'ansible-lint', version: '1' }],
            hasDevTools: true,
            collections: [],
            playbooks: [],
            executionEnvironments: [
                {
                    created: 't',
                    execution_environment: true,
                    full_name: 'ee:latest',
                    image_id: 'id',
                },
            ],
        });
        const eeId = snap.sections.find((s) => s.id === 'executionEnvironments')?.nodes[0]?.id;
        expect(eeId).toBeTruthy();
        if (!eeId) {
            return;
        }
        const patched = model.patchNodeChildren(snap, eeId, children);
        const ee = patched.sections.find((s) => s.id === 'executionEnvironments')?.nodes[0];
        expect(ee?.lazyChildren).toBe(false);
        expect(ee?.children?.[0]?.label).toBe('modules');
    });

    it('falls back to tool name when MCP description is empty', () => {
        const tools = assembleAiTools(
            [
                {
                    category: 'discovery',
                    tool: { name: 'list_collections', description: '' },
                    examplePrompt: 'List collections',
                    toolInfo: {},
                },
            ],
            { discovery: 'Discovery' },
        );
        expect(tools?.[0]?.label).toBe('list_collections');
    });
});
