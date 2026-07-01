import { describe, it, expect, vi } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getPathAt, parseAllDocuments } from '../../src/utils/yaml';
import { getVarsCompletion } from '../../src/providers/completionProviderUtils';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));
vi.mock('fs', () => ({
    existsSync: fsMocks.existsSync,
    readFileSync: fsMocks.readFileSync,
}));

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

    it('collects variables from vars_files with array-of-dicts YAML', () => {
        const varsFileContent = '- db_host: localhost\n  db_port: 5432\n';
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFileSync.mockReturnValue(varsFileContent);

        const content = [
            '- hosts: all',
            '  vars_files:',
            '    - vars/db.yml',
            '  tasks:',
            '    - name: "{{ _ }}"',
        ].join('\n');
        const d = doc(content, 'file:///project/playbook.yml');
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 4, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('db_host');
        expect(labels).toContain('db_port');
    });

    it('does not extract vars from dict-format vars_files (only array format supported)', () => {
        const varsFileContent = 'db_host: localhost\ndb_port: 5432\n';
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFileSync.mockReturnValue(varsFileContent);

        const content = [
            '- hosts: all',
            '  vars_files:',
            '    - vars/db.yml',
            '  tasks:',
            '    - name: "{{ _ }}"',
        ].join('\n');
        const d = doc(content, 'file:///project/playbook.yml');
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 4, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        expect(items).toEqual([]);
    });

    it('collects variables from multi-item array-style vars_files', () => {
        const varsFileContent = '- app_name: myapp\n- app_port: 8080\n- app_debug: true\n';
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFileSync.mockReturnValue(varsFileContent);

        const content = [
            '- hosts: all',
            '  vars_files:',
            '    - vars/app.yml',
            '  tasks:',
            '    - name: "{{ _ }}"',
        ].join('\n');
        const d = doc(content, 'file:///project/playbook.yml');
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 4, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('app_name');
        expect(labels).toContain('app_port');
        expect(labels).toContain('app_debug');
    });

    it('skips vars_files that do not exist on disk', () => {
        fsMocks.existsSync.mockReturnValue(false);

        const content = [
            '- hosts: all',
            '  vars_files:',
            '    - missing.yml',
            '  tasks:',
            '    - name: "{{ _ }}"',
        ].join('\n');
        const d = doc(content, 'file:///project/playbook.yml');
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 4, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        expect(items).toEqual([]);
    });

    it('handles absolute paths in vars_files', () => {
        const varsFileContent = '- secret_key: abc123\n';
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFileSync.mockReturnValue(varsFileContent);

        const content = [
            '- hosts: all',
            '  vars_files:',
            '    - /etc/ansible/secrets.yml',
            '  tasks:',
            '    - name: "{{ _ }}"',
        ].join('\n');
        const d = doc(content, 'file:///project/playbook.yml');
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 4, character: 18 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('secret_key');
    });

    it('collects vars defined as a list of objects (collectVars array path)', () => {
        const content = [
            '- hosts: all',
            '  vars:',
            '    - first_var: a',
            '    - second_var: b',
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
        expect(labels).toContain('first_var');
        expect(labels).toContain('second_var');
    });

    it('ignores non-object entries in array-style vars', () => {
        const content = [
            '- hosts: all',
            '  vars:',
            '    - valid_var: value',
            '    - plain_string',
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
        expect(labels).toContain('valid_var');
        expect(labels).not.toContain('plain_string');
    });

    it('collects scoped vars from nested block/role structures', () => {
        const content = [
            '- hosts: all',
            '  tasks:',
            '    - block:',
            '        - name: inner',
            '          vars:',
            '            block_var: yes',
            '          debug:',
            '            msg: "{{ _ }}"',
        ].join('\n');
        const d = doc(content);
        const docs = parseAllDocuments(content);
        const path = getPathAt(d, { line: 7, character: 20 }, docs, true);
        expect(path).toBeTruthy();
        if (!path) return;

        const items = getVarsCompletion(d.uri, path);
        const labels = items.map((i) => i.label);
        expect(labels).toContain('block_var');
    });
});
