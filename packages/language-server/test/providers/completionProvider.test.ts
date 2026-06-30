import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    doCompletion,
    doCompletionResolve,
    resolveSuffix,
} from '../../src/providers/completionProvider';

/**
 * Creates a TextDocument from YAML content for completion tests.
 *
 * @param content - YAML source text.
 * @param uri - Document URI.
 * @returns A language-server TextDocument instance.
 */
function doc(content: string, uri = 'file:///test.yml'): TextDocument {
    return TextDocument.create(uri, 'ansible', 1, content);
}

/**
 * Builds a stub CollectionsService with optional plugin docs and collections.
 *
 * @param pluginMap - Map of FQCN to plugin data stubs.
 * @param collections - Map of collection names to metadata.
 * @returns A mock CollectionsService.
 */
function mockCollectionsService(pluginMap: Record<string, unknown> = {}, collections = new Map()) {
    return {
        getPluginDocumentation: vi.fn((fqcn: string) => {
            return Promise.resolve(pluginMap[fqcn] ?? null);
        }),
        getCollections: vi.fn(() => collections),
    };
}

/**
 * Builds a mock workspace context with optional settings overrides.
 *
 * @param overrides - Partial settings to merge with defaults.
 * @returns A stub workspace context.
 */
function mockContext(overrides: Record<string, unknown> = {}) {
    return {
        documentSettings: {
            get: vi.fn().mockResolvedValue({
                ansible: { path: 'ansible', useFullyQualifiedCollectionNames: true },
                validation: { enabled: true, lint: { enabled: true } },
                ...overrides,
            }),
        },
        ansibleInventory: Promise.resolve({ hostList: [] }),
    };
}

vi.mock('@ansible/developer-services', () => {
    const store: { svc: unknown } = { svc: null };
    return {
        CollectionsService: {
            getInstance: () => store.svc,
            _setMockInstance: (s: unknown) => {
                store.svc = s;
            },
        },
    };
});

describe('resolveSuffix', () => {
    it('returns newline+indent for dict in playbook', () => {
        const result = resolveSuffix('dict', false, true);
        expect(result).toContain('\t');
        expect(result).toContain('\n');
    });

    it('returns deeper indent for first element of list in playbook', () => {
        const firstEl = resolveSuffix('dict', true, true);
        const notFirstEl = resolveSuffix('dict', false, true);
        expect(firstEl.length).toBeGreaterThan(notFirstEl.length);
    });

    it('returns list marker for list type in playbook', () => {
        const result = resolveSuffix('list', false, true);
        expect(result).toContain('- ');
    });

    it('returns space for scalar types', () => {
        expect(resolveSuffix('str', false, true)).toBe(' ');
        expect(resolveSuffix('bool', false, true)).toBe(' ');
        expect(resolveSuffix('int', true, true)).toBe(' ');
    });

    it('handles non-playbook documents', () => {
        const dict = resolveSuffix('dict', false, false);
        expect(dict).toContain('\t');

        const list = resolveSuffix('list', false, false);
        expect(list).toContain('- ');

        const str = resolveSuffix('str', false, false);
        expect(str).toBe(' ');
    });

    it('first element flag has no effect for non-playbook', () => {
        const firstEl = resolveSuffix('dict', true, false);
        const notFirstEl = resolveSuffix('dict', false, false);
        expect(firstEl).toBe(notFirstEl);
    });
});

describe('doCompletion', () => {
    let CollectionsServiceMock: { _setMockInstance: (s: unknown) => void };

    beforeEach(async () => {
        const mod = await import('@ansible/developer-services');
        CollectionsServiceMock = mod.CollectionsService;
    });

    it('returns play-level keyword completions for play context', async () => {
        const content = '- hosts: all\n  ';
        const d = doc(content);
        const svc = mockCollectionsService();
        CollectionsServiceMock._setMockInstance(svc);
        const ctx = mockContext();

        const items = await doCompletion(d, { line: 1, character: 2 }, ctx as never);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('gather_facts');
        expect(labels).toContain('tasks');
    });

    it('returns task keyword and module completions for task context', async () => {
        const content = '- hosts: all\n  tasks:\n    - ';
        const d = doc(content);
        const svc = mockCollectionsService(
            {},
            new Map([
                [
                    'ansible.builtin',
                    {
                        pluginTypes: new Map([['module', [{ fullName: 'ansible.builtin.copy' }]]]),
                    },
                ],
            ]),
        );
        CollectionsServiceMock._setMockInstance(svc);
        const ctx = mockContext();

        const items = await doCompletion(d, { line: 2, character: 6 }, ctx as never);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('name');
        expect(labels).toContain('when');
    });

    it('returns block keyword completions for block context', async () => {
        const content = '- hosts: all\n  tasks:\n    - block:\n        - name: inside\n      ';
        const d = doc(content);
        const svc = mockCollectionsService();
        CollectionsServiceMock._setMockInstance(svc);
        const ctx = mockContext();

        const items = await doCompletion(d, { line: 4, character: 6 }, ctx as never);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('rescue');
        expect(labels).toContain('always');
    });

    it('returns empty for empty document', async () => {
        const d = doc('');
        const svc = mockCollectionsService();
        CollectionsServiceMock._setMockInstance(svc);
        const ctx = mockContext();

        const items = await doCompletion(d, { line: 0, character: 0 }, ctx as never);
        expect(items).toEqual([]);
    });

    it('provides module option completions when inside module params', async () => {
        const content = '- hosts: all\n  tasks:\n    - ansible.builtin.copy:\n        ';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                options: {
                    src: { type: 'str', required: true, description: ['Source'] },
                    dest: { type: 'str', required: true, description: ['Dest'] },
                },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });
        CollectionsServiceMock._setMockInstance(svc);
        const ctx = mockContext();

        const items = await doCompletion(d, { line: 3, character: 8 }, ctx as never);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('src');
        expect(labels).toContain('dest');
    });

    it('filters already-provided keywords', async () => {
        const content = '- hosts: all\n  gather_facts: true\n  ';
        const d = doc(content);
        const svc = mockCollectionsService();
        CollectionsServiceMock._setMockInstance(svc);
        const ctx = mockContext();

        const items = await doCompletion(d, { line: 2, character: 2 }, ctx as never);
        const labels = items.map((i) => i.label);
        expect(labels).not.toContain('hosts');
        expect(labels).not.toContain('gather_facts');
    });

    it('filters already-provided module options', async () => {
        const content =
            '- hosts: all\n  tasks:\n    - ansible.builtin.copy:\n        src: a\n        ';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                options: {
                    src: { type: 'str', required: true, description: ['Source'] },
                    dest: { type: 'str', required: true, description: ['Dest'] },
                },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });
        CollectionsServiceMock._setMockInstance(svc);
        const ctx = mockContext();

        const items = await doCompletion(d, { line: 4, character: 8 }, ctx as never);
        const labels = items.map((i) => i.label);
        expect(labels).not.toContain('src');
        expect(labels).toContain('dest');
    });
});

describe('doCompletionResolve', () => {
    let CollectionsServiceMock: { _setMockInstance: (s: unknown) => void };

    beforeEach(async () => {
        const mod = await import('@ansible/developer-services');
        CollectionsServiceMock = mod.CollectionsService;
    });

    it('enriches module completion items with documentation', async () => {
        const pluginData = {
            doc: {
                module: 'copy',
                short_description: 'Copy files',
                description: ['Copy files to targets'],
                options: {},
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });
        CollectionsServiceMock._setMockInstance(svc);

        const ctx = mockContext();
        const item = {
            label: 'ansible.builtin.copy',
            kind: CompletionItemKind.Class,
            data: {
                documentUri: 'file:///test.yml',
                moduleFqcn: 'ansible.builtin.copy',
                atEndOfLine: true,
                firstElementOfList: false,
            },
        };

        const resolved = await doCompletionResolve(item, ctx as never);
        expect(resolved.documentation).toBeDefined();
    });

    it('resolves option type suffixes', async () => {
        const ctx = mockContext();
        const item = {
            label: 'src',
            kind: CompletionItemKind.Property,
            data: {
                documentUri: 'file:///test.yml',
                type: 'str',
                atEndOfLine: true,
            },
        };

        const resolved = await doCompletionResolve(item, ctx as never);
        expect(resolved.insertText).toContain('src');
    });

    it('passes through items without data', async () => {
        const ctx = mockContext();
        const item = {
            label: 'plain',
            kind: CompletionItemKind.Text,
        };

        const resolved = await doCompletionResolve(item, ctx as never);
        expect(resolved.label).toBe('plain');
    });
});
