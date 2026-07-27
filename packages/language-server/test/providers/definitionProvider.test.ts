import { describe, it, expect, vi } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { doDefinition, type OpenPluginDocParams } from '../../src/providers/definitionProvider';

/**
 * Creates a TextDocument from YAML content for definition tests.
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

describe('doDefinition', () => {
    it('opens plugin doc for FQCN modules and returns a self DefinitionLink', async () => {
        const content = '- hosts: all\n  tasks:\n    - ansible.builtin.copy:\n        src: a';
        const d = doc(content);
        const pluginData = {
            doc: {
                module: 'copy',
                short_description: 'Copy files',
                options: {},
            },
        };
        const svc = mockCollectionsService({ 'ansible.builtin.copy': pluginData });
        const sendOpenPluginDoc = vi.fn();

        const result = await doDefinition(d, { line: 2, character: 6 }, svc, sendOpenPluginDoc);

        expect(sendOpenPluginDoc).toHaveBeenCalledOnce();
        expect(sendOpenPluginDoc).toHaveBeenCalledWith({
            fqcn: 'ansible.builtin.copy',
            pluginType: 'module',
        } satisfies OpenPluginDocParams);
        expect(result).toHaveLength(1);
        expect(result?.[0]?.targetUri).toBe(d.uri);
        expect(result?.[0]?.targetRange).toEqual(result?.[0]?.originSelectionRange);
        expect(result?.[0]?.targetSelectionRange).toEqual(result?.[0]?.originSelectionRange);
    });

    it('resolves short module names via ansible.builtin prefix', async () => {
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
        const sendOpenPluginDoc = vi.fn();

        const result = await doDefinition(d, { line: 2, character: 6 }, svc, sendOpenPluginDoc);

        expect(sendOpenPluginDoc).toHaveBeenCalledWith({
            fqcn: 'ansible.builtin.copy',
            pluginType: 'module',
        });
        expect(result).toHaveLength(1);
    });

    it('returns null for unknown modules without docs', async () => {
        const content = '- hosts: all\n  tasks:\n    - unknown_module:\n        opt: val';
        const d = doc(content);
        const svc = mockCollectionsService();
        const sendOpenPluginDoc = vi.fn();

        const result = await doDefinition(d, { line: 2, character: 6 }, svc, sendOpenPluginDoc);

        expect(result).toBeNull();
        expect(sendOpenPluginDoc).not.toHaveBeenCalled();
    });

    it('returns null for task keywords', async () => {
        const content = '- hosts: all\n  tasks:\n    - name: test\n      register: out';
        const d = doc(content);
        const svc = mockCollectionsService();
        const sendOpenPluginDoc = vi.fn();

        const result = await doDefinition(d, { line: 2, character: 6 }, svc, sendOpenPluginDoc);

        expect(result).toBeNull();
        expect(sendOpenPluginDoc).not.toHaveBeenCalled();
    });

    it('returns null for empty documents', async () => {
        const d = doc('');
        const svc = mockCollectionsService();
        const sendOpenPluginDoc = vi.fn();

        const result = await doDefinition(d, { line: 0, character: 0 }, svc, sendOpenPluginDoc);

        expect(result).toBeNull();
        expect(sendOpenPluginDoc).not.toHaveBeenCalled();
    });

    it('returns null for non-scalar positions', async () => {
        const content = '- hosts: all\n  tasks: []';
        const d = doc(content);
        const svc = mockCollectionsService();
        const sendOpenPluginDoc = vi.fn();

        const result = await doDefinition(d, { line: 1, character: 11 }, svc, sendOpenPluginDoc);

        expect(result).toBeNull();
        expect(sendOpenPluginDoc).not.toHaveBeenCalled();
    });

    it('returns null for play-level keys', async () => {
        const content = '- hosts: all\n  gather_facts: false';
        const d = doc(content);
        const svc = mockCollectionsService();
        const sendOpenPluginDoc = vi.fn();

        const result = await doDefinition(d, { line: 0, character: 2 }, svc, sendOpenPluginDoc);

        expect(result).toBeNull();
        expect(sendOpenPluginDoc).not.toHaveBeenCalled();
    });
});
