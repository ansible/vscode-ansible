import { describe, it, expect, vi } from 'vitest';
import { MarkupKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { doHover } from '../../src/providers/hoverProvider';

/**
 * Creates a TextDocument from YAML content for hover tests.
 *
 * @param content - YAML source text.
 * @param uri - Document URI.
 * @returns A language-server TextDocument instance.
 */
function doc(content: string, uri = 'file:///test.yml'): TextDocument {
    return TextDocument.create(uri, 'ansible', 1, content);
}

/**
 * Builds a stub CollectionsService that resolves plugin docs from the map.
 *
 * @param pluginMap - Map of FQCN to plugin data stubs.
 * @returns A mock CollectionsService.
 */
function mockCollectionsService(pluginMap: Record<string, unknown> = {}) {
    return {
        getPluginDocumentation: vi.fn((fqcn: string) => {
            return Promise.resolve(pluginMap[fqcn] ?? null);
        }),
    } as never;
}

describe('doHover', () => {
    it('returns hover for play-level keywords', async () => {
        const content = '- hosts: all\n  gather_facts: false';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doHover(d, { line: 0, character: 2 }, svc);
        expect(result).toBeTruthy();
        expect(result?.contents).toBeDefined();
    });

    it('returns hover for task-level keywords', async () => {
        const content = '- hosts: all\n  tasks:\n    - name: test\n      register: out';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doHover(d, { line: 2, character: 6 }, svc);
        expect(result).toBeTruthy();
    });

    it('returns hover for block-level keywords', async () => {
        const content =
            '- hosts: all\n  tasks:\n    - block:\n        - name: inside\n      rescue:\n        - name: rescue';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doHover(d, { line: 2, character: 6 }, svc);
        expect(result).toBeTruthy();
    });

    it('returns hover for modules with plugin documentation', async () => {
        const content = '- hosts: all\n  tasks:\n    - ansible.builtin.copy:\n        src: a';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                short_description: 'Copy files',
                description: ['Copy files to remote locations'],
                options: { src: { description: ['Source file'] } },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });

        const result = await doHover(d, { line: 2, character: 6 }, svc);
        expect(result).toBeTruthy();
        if (result) {
            const contents = result.contents as { kind: string; value: string };
            expect(contents.kind).toBe(MarkupKind.Markdown);
        }
    });

    it('returns hover for short module names resolved via builtin prefix', async () => {
        const content = '- hosts: all\n  tasks:\n    - copy:\n        src: a';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                short_description: 'Copy files',
                options: {},
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });

        const result = await doHover(d, { line: 2, character: 6 }, svc);
        expect(result).toBeTruthy();
    });

    it('returns null for empty documents', async () => {
        const d = doc('');
        const svc = mockCollectionsService();

        const result = await doHover(d, { line: 0, character: 0 }, svc);
        expect(result).toBeNull();
    });

    it('returns null for non-scalar positions', async () => {
        const content = '- hosts: all\n  tasks: []';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doHover(d, { line: 1, character: 11 }, svc);
        expect(result).toBeNull();
    });

    it('returns null for unknown modules without docs', async () => {
        const content = '- hosts: all\n  tasks:\n    - unknown_module:\n        opt: val';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doHover(d, { line: 2, character: 6 }, svc);
        expect(result).toBeNull();
    });

    it('returns hover with range when node has source range', async () => {
        const content = '- hosts: all\n  gather_facts: false';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doHover(d, { line: 1, character: 2 }, svc);
        expect(result).toBeTruthy();
        expect(result?.range).toBeDefined();
    });

    it('returns hover for module options via getPossibleOptionsForPath', async () => {
        const content = '- hosts: all\n  tasks:\n    - ansible.builtin.copy:\n        src: a';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                short_description: 'Copy files',
                options: {
                    src: {
                        description: ['Source file'],
                        type: 'str',
                        required: true,
                    },
                },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });

        const result = await doHover(d, { line: 3, character: 10 }, svc);
        expect(result).toBeTruthy();
    });
});
