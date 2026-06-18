import { describe, it, expect } from 'vitest';
import { extractMetadataJson, parseMetadataDump } from '../../src/parsers/metadataDumpParser';
import type { MetadataDump } from '../../src/parsers/metadataDumpParser';

describe('extractMetadataJson', () => {
    it('returns null for empty string', () => {
        expect(extractMetadataJson('')).toBeNull();
    });

    it('returns null when no JSON is present', () => {
        expect(extractMetadataJson('WARNING: something went wrong')).toBeNull();
    });

    it('strips leading warnings before JSON', () => {
        const raw = 'WARNING: some warning\n{"all": {}}';
        const result = extractMetadataJson(raw);
        expect(result).toEqual({ all: {} });
    });

    it('parses clean JSON', () => {
        const raw = '{"all": {"module": {}}}';
        const result = extractMetadataJson(raw);
        expect(result).toHaveProperty('all');
    });
});

describe('parseMetadataDump', () => {
    it('returns empty maps for empty metadata', () => {
        const result = parseMetadataDump({});
        expect(result.collections.size).toBe(0);
        expect(result.pluginDocs.size).toBe(0);
    });

    it('returns empty maps when all is empty', () => {
        const result = parseMetadataDump({ all: {} });
        expect(result.collections.size).toBe(0);
        expect(result.pluginDocs.size).toBe(0);
    });

    it('parses a single plugin into a collection', () => {
        const metadata: MetadataDump = {
            all: {
                module: {
                    'cisco.ios.ios_acls': {
                        doc: {
                            collection: 'cisco.ios',
                            plugin_name: 'cisco.ios.ios_acls',
                            short_description: 'Manage ACLs',
                            options: {
                                config: { type: 'list', description: 'ACL config' },
                            },
                        },
                        examples: '- name: Example\n  cisco.ios.ios_acls:',
                        return: {
                            commands: { type: 'list', description: 'Commands sent' },
                        },
                    },
                },
            },
        };

        const result = parseMetadataDump(metadata);

        expect(result.collections.size).toBe(1);
        expect(result.collections.has('cisco.ios')).toBe(true);

        const coll = result.collections.get('cisco.ios');
        expect(coll?.pluginTypes.has('module')).toBe(true);

        const plugins = coll?.pluginTypes.get('module');
        expect(plugins).toHaveLength(1);
        expect(plugins?.[0].name).toBe('ios_acls');
        expect(plugins?.[0].fullName).toBe('cisco.ios.ios_acls');
        expect(plugins?.[0].shortDescription).toBe('Manage ACLs');

        expect(result.pluginDocs.has('cisco.ios.ios_acls:module')).toBe(true);
        const doc = result.pluginDocs.get('cisco.ios.ios_acls:module');
        expect(doc?.examples).toContain('Example');
        expect(doc?.return).toHaveProperty('commands');
    });

    it('handles multiple plugin types', () => {
        const metadata: MetadataDump = {
            all: {
                module: {
                    'ns.col.mod_a': {
                        doc: {
                            collection: 'ns.col',
                            plugin_name: 'ns.col.mod_a',
                            short_description: 'Module A',
                        },
                    },
                },
                lookup: {
                    'ns.col.look_b': {
                        doc: {
                            collection: 'ns.col',
                            plugin_name: 'ns.col.look_b',
                            short_description: 'Lookup B',
                        },
                    },
                },
            },
        };

        const result = parseMetadataDump(metadata);

        expect(result.collections.size).toBe(1);
        const coll = result.collections.get('ns.col');
        expect(coll?.pluginTypes.size).toBe(2);
        expect(coll?.pluginTypes.has('module')).toBe(true);
        expect(coll?.pluginTypes.has('lookup')).toBe(true);
    });

    it('deduplicates plugins with the same unique key', () => {
        const metadata: MetadataDump = {
            all: {
                module: {
                    'ns.col.dup': {
                        doc: {
                            collection: 'ns.col',
                            plugin_name: 'ns.col.dup',
                            short_description: 'First',
                        },
                    },
                    'ns.col.dup_copy': {
                        doc: {
                            collection: 'ns.col',
                            plugin_name: 'ns.col.dup',
                            short_description: 'Second',
                        },
                    },
                },
            },
        };

        const result = parseMetadataDump(metadata);
        const plugins = result.collections.get('ns.col')?.pluginTypes.get('module');
        expect(plugins).toHaveLength(2);
    });

    it('skips plugins without doc', () => {
        const metadata: MetadataDump = {
            all: {
                module: {
                    'ns.col.no_doc': {},
                },
            },
        };

        const result = parseMetadataDump(metadata);
        expect(result.collections.size).toBe(0);
        expect(result.pluginDocs.size).toBe(0);
    });

    it('uses collectionInfoMap for collection metadata', () => {
        const metadata: MetadataDump = {
            all: {
                module: {
                    'cisco.ios.ios_config': {
                        doc: {
                            collection: 'cisco.ios',
                            plugin_name: 'cisco.ios.ios_config',
                            short_description: 'Config',
                        },
                    },
                },
            },
        };

        const infoMap = new Map([
            [
                'cisco.ios',
                {
                    name: 'cisco.ios',
                    version: '4.6.0',
                    authors: ['Cisco'],
                    description: 'Cisco IOS collection',
                },
            ],
        ]);

        const result = parseMetadataDump(metadata, infoMap);
        const coll = result.collections.get('cisco.ios');
        expect(coll?.info.version).toBe('4.6.0');
        expect(coll?.info.description).toBe('Cisco IOS collection');
    });

    it('sorts plugins alphabetically within each type', () => {
        const metadata: MetadataDump = {
            all: {
                module: {
                    'ns.col.zebra': {
                        doc: {
                            collection: 'ns.col',
                            plugin_name: 'ns.col.zebra',
                            short_description: 'Z',
                        },
                    },
                    'ns.col.alpha': {
                        doc: {
                            collection: 'ns.col',
                            plugin_name: 'ns.col.alpha',
                            short_description: 'A',
                        },
                    },
                    'ns.col.middle': {
                        doc: {
                            collection: 'ns.col',
                            plugin_name: 'ns.col.middle',
                            short_description: 'M',
                        },
                    },
                },
            },
        };

        const result = parseMetadataDump(metadata);
        const plugins = result.collections.get('ns.col')?.pluginTypes.get('module');
        expect(plugins?.map((p) => p.name)).toEqual(['alpha', 'middle', 'zebra']);
    });
});
