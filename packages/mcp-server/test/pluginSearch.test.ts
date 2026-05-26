import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const changeListeners: (() => void)[] = [];

const hoisted = vi.hoisted(() => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const isLoaded = vi.fn(() => true);
    const getCollections = vi.fn(() => new Map());

    const collectionsInstance = {
        refresh,
        isLoaded,
        getCollections,
        onDidChange: vi.fn((listener: () => void) => {
            changeListeners.push(listener);
            return { dispose: vi.fn() };
        }),
    };

    return { collectionsInstance, refresh, isLoaded, getCollections };
});

vi.mock('@ansible/core', () => ({
    CollectionsService: {
        getInstance: vi.fn(() => hoisted.collectionsInstance),
    },
}));

function makeCollectionMap(): Map<
    string,
    {
        info: { name: string; version: string; description: string; authors: string[] };
        pluginTypes: Map<
            string,
            Array<{ name: string; fullName: string; shortDescription: string }>
        >;
    }
> {
    const m = new Map();
    m.set('ansible.builtin', {
        info: {
            name: 'ansible.builtin',
            version: '1.0',
            description: 'Built-in',
            authors: [],
        },
        pluginTypes: new Map([
            [
                'module',
                [
                    {
                        name: 'copy',
                        fullName: 'ansible.builtin.copy',
                        shortDescription: 'Copy files to remote path',
                    },
                    {
                        name: 'file',
                        fullName: 'ansible.builtin.file',
                        shortDescription: 'Manage file attributes',
                    },
                ],
            ],
        ]),
    });
    m.set('community.general', {
        info: {
            name: 'community.general',
            version: '2.0',
            description: 'General community collection',
            authors: [],
        },
        pluginTypes: new Map([
            [
                'module',
                [
                    {
                        name: 'ipa_user',
                        fullName: 'community.general.ipa_user',
                        shortDescription: 'Manage FreeIPA users',
                    },
                ],
            ],
        ]),
    });
    return m;
}

describe('PluginSearchIndex', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        changeListeners.length = 0;
        hoisted.isLoaded.mockReturnValue(true);
        hoisted.refresh.mockResolvedValue(undefined);
        hoisted.getCollections.mockReturnValue(makeCollectionMap());
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('getInstance returns the same singleton', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const a = PluginSearchIndex.getInstance();
        const b = PluginSearchIndex.getInstance();
        expect(a).toBe(b);
    });

    it('ensureBuilt triggers rebuild from CollectionsService data', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        expect(hoisted.getCollections).toHaveBeenCalled();
        expect(index.isBuilt()).toBe(true);
        expect(index.getCount()).toBe(3);
    });

    it('calls refresh when collections are not loaded', async () => {
        hoisted.isLoaded.mockReturnValue(false);
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        expect(hoisted.refresh).toHaveBeenCalled();
    });

    it('search returns scored results by plugin name', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        const results = index.search('copy');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe('copy');
        expect(results[0].fullName).toContain('ansible.builtin.copy');
    });

    it('search matches collection name', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        const results = index.search('community');
        expect(results.some((r) => r.collection === 'community.general')).toBe(true);
    });

    it('search matches description text', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        const results = index.search('FreeIPA');
        expect(results.length).toBe(1);
        expect(results[0].name).toBe('ipa_user');
    });

    it('search returns empty when there are no matches', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        expect(index.search('zzznonexistentpluginname')).toEqual([]);
    });

    it('search returns empty for token-less query', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        expect(index.search('a')).toEqual([]);
    });

    it('rebuild clears and recreates index from current service data', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();

        hoisted.getCollections.mockReturnValue(makeCollectionMap());
        await index.rebuild();
        expect(index.getCount()).toBe(3);

        const smaller = new Map();
        smaller.set('ansible.builtin', {
            info: {
                name: 'ansible.builtin',
                version: '1.0',
                description: '',
                authors: [],
            },
            pluginTypes: new Map([
                [
                    'module',
                    [
                        {
                            name: 'stat',
                            fullName: 'ansible.builtin.stat',
                            shortDescription: 'Retrieve file stat',
                        },
                    ],
                ],
            ]),
        });
        hoisted.getCollections.mockReturnValue(smaller);
        await index.rebuild();

        expect(index.getCount()).toBe(1);
        expect(index.search('stat')).toHaveLength(1);
        expect(index.search('copy')).toEqual([]);
    });

    it('ensureBuilt skips work when already built', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();
        hoisted.getCollections.mockClear();

        await index.ensureBuilt();

        expect(hoisted.getCollections).not.toHaveBeenCalled();
    });

    it('marks index dirty when CollectionsService signals change', async () => {
        vi.resetModules();
        changeListeners.length = 0;
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();
        expect(index.isBuilt()).toBe(true);

        expect(changeListeners.length).toBeGreaterThan(0);
        changeListeners[changeListeners.length - 1]();

        expect(index.isBuilt()).toBe(false);
    });

    it('applies plugin_type and collection filters', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        const onlyModule = index.search('file', { pluginType: 'module' });
        expect(onlyModule.every((r) => r.pluginType === 'module')).toBe(true);

        const inBuiltin = index.search('file', { collection: 'ansible.builtin' });
        expect(inBuiltin.every((r) => r.collection.includes('ansible.builtin'))).toBe(true);
    });

    it('scores matches on full FQCN when name alone does not match', async () => {
        const m = new Map();
        m.set('custom.ns', {
            info: { name: 'custom.ns', version: '1', description: '', authors: [] },
            pluginTypes: new Map([
                [
                    'module',
                    [
                        {
                            name: 'x',
                            fullName: 'custom.ns.verylonghelper',
                            shortDescription: 'Helper module',
                        },
                    ],
                ],
            ]),
        });
        hoisted.getCollections.mockReturnValue(m);

        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        const results = index.search('verylong');
        expect(results.length).toBe(1);
        expect(results[0].fullName).toBe('custom.ns.verylonghelper');
    });

    it('adds a bonus when multiple query terms match', async () => {
        const { PluginSearchIndex } = await import('../src/pluginSearch');
        const index = PluginSearchIndex.getInstance();
        await index.rebuild();

        const multi = index.search('copy files');
        const single = index.search('copy');
        expect(multi.length).toBeGreaterThan(0);
        expect(single.length).toBeGreaterThan(0);
        expect(multi[0].name).toBe('copy');
    });
});
