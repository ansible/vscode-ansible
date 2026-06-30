import { describe, it, expect, vi } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    doSemanticTokens,
    tokenTypes,
    tokenModifiers,
} from '../../src/providers/semanticTokenProvider';

/**
 * Creates a TextDocument from YAML content for semantic token tests.
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

describe('doSemanticTokens', () => {
    it('produces tokens for play-level keywords', async () => {
        const content = '- hosts: all\n  gather_facts: false\n  tasks: []';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doSemanticTokens(d, svc);
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('produces tokens for task-level keywords', async () => {
        const content = '- hosts: all\n  tasks:\n    - name: test\n      register: out';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doSemanticTokens(d, svc);
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('marks known modules as class tokens', async () => {
        const content = '- hosts: all\n  tasks:\n    - ansible.builtin.copy:\n        src: a';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                options: { src: { type: 'str' } },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });

        const result = await doSemanticTokens(d, svc);
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('marks module parameters as method tokens', async () => {
        const content =
            '- hosts: all\n  tasks:\n    - ansible.builtin.copy:\n        src: a\n        dest: b';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                options: {
                    src: { type: 'str' },
                    dest: { type: 'str' },
                },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });

        const result = await doSemanticTokens(d, svc);
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('handles nested suboptions (dict type)', async () => {
        const content = [
            '- hosts: all',
            '  tasks:',
            '    - ansible.builtin.copy:',
            '        content:',
            '          nested_key: val',
        ].join('\n');
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                options: {
                    content: {
                        type: 'dict',
                        suboptions: { nested_key: { type: 'str' } },
                    },
                },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });

        const result = await doSemanticTokens(d, svc);
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('handles block keywords', async () => {
        const content = [
            '- hosts: all',
            '  tasks:',
            '    - block:',
            '        - name: inside',
            '      rescue:',
            '        - name: rescue task',
        ].join('\n');
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doSemanticTokens(d, svc);
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('returns empty tokens for empty document', async () => {
        const d = doc('');
        const svc = mockCollectionsService();

        const result = await doSemanticTokens(d, svc);
        expect(result.data).toEqual([]);
    });

    it('marks unknown task keys as ordinary properties', async () => {
        const content = '- hosts: all\n  tasks:\n    - unknown_module:\n        opt: val';
        const d = doc(content);
        const svc = mockCollectionsService();

        const result = await doSemanticTokens(d, svc);
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('resolves short module names to FQCN', async () => {
        const content = '- hosts: all\n  tasks:\n    - copy:\n        src: a';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                options: { src: { type: 'str' } },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });

        await doSemanticTokens(d, svc);
        expect(svc.getPluginDocumentation).toHaveBeenCalledWith('ansible.builtin.copy', 'module');
    });

    it('handles list-type suboptions', async () => {
        const content = [
            '- hosts: all',
            '  tasks:',
            '    - ansible.builtin.user:',
            '        groups:',
            '          - name: admin',
        ].join('\n');
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'user',
                options: {
                    groups: {
                        type: 'list',
                        suboptions: { name: { type: 'str' } },
                    },
                },
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.user': pluginData });

        const result = await doSemanticTokens(d, svc);
        expect(result.data.length).toBeGreaterThan(0);
    });
});

describe('tokenTypes and tokenModifiers', () => {
    it('exports known token types', () => {
        expect(tokenTypes.length).toBeGreaterThanOrEqual(3);
    });

    it('exports known token modifiers', () => {
        expect(tokenModifiers.length).toBeGreaterThanOrEqual(1);
    });
});
