import { describe, it, expect } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getPathAt, parseAllDocuments } from '../../src/utils/yaml';
import { getVarsCompletion } from '../../src/providers/completionProviderUtils';

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

describe('getVarsCompletion', () => {
    it('collects variables from play-level vars', () => {
        const content = [
            '- hosts: all',
            '  vars:',
            '    my_var: hello',
            '    other_var: world',
            '  tasks:',
            '    - name: "{{ _ }}"',
        ].join('\n');
        const d = doc(content);
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 5, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('my_var');
        expect(labels).toContain('other_var');
        items.forEach((item) => {
            expect(item.kind).toBe(CompletionItemKind.Variable);
        });
    });

    it('collects variables from vars_prompt', () => {
        const content = [
            '- hosts: all',
            '  vars_prompt:',
            '    - name: username',
            '      prompt: "Enter username"',
            '    - name: password',
            '      prompt: "Enter password"',
            '      private: true',
            '  tasks:',
            '    - name: "{{ _ }}"',
        ].join('\n');
        const d = doc(content);
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 8, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('username');
        expect(labels).toContain('password');
    });

    it('returns empty when no vars are defined', () => {
        const content = ['- hosts: all', '  tasks:', '    - name: "{{ _ }}"'].join('\n');
        const d = doc(content);
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 2, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        expect(items).toEqual([]);
    });

    it('assigns sortText based on scope priority', () => {
        const content = [
            '- hosts: all',
            '  vars:',
            '    play_var: 1',
            '  tasks:',
            '    - name: "{{ _ }}"',
        ].join('\n');
        const d = doc(content);
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 4, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        for (const item of items) {
            expect(item.sortText).toBeDefined();
            expect(item.sortText).toMatch(/^\d+_/);
        }
    });
});
