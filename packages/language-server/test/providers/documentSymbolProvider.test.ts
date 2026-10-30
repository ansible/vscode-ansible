import { describe, it, expect } from 'vitest';
import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { doDocumentSymbols } from '../../src/providers/documentSymbolProvider';

/**
 * Creates a TextDocument from YAML lines for document symbol tests.
 *
 * @param lines - YAML source lines.
 * @param uri - Document URI.
 * @returns A language-server TextDocument instance.
 */
function doc(lines: string[], uri = 'file:///playbook.yml'): TextDocument {
    return TextDocument.create(uri, 'ansible', 1, lines.join('\n'));
}

/**
 * Reduces symbols to a name/kind tree for readable assertions.
 *
 * @param symbols - Symbols to summarize.
 * @returns Nested name and kind pairs.
 */
function outline(symbols: DocumentSymbol[] | undefined): unknown[] {
    return (symbols ?? []).map((s) => ({
        name: s.name,
        kind: s.kind,
        ...(s.children?.length ? { children: outline(s.children) } : {}),
    }));
}

/**
 * Tests whether `inner` lies within `outer`.
 *
 * @param outer - Enclosing range.
 * @param inner - Candidate contained range.
 * @returns True when `inner` is contained in `outer`.
 */
function contains(outer: Range, inner: Range): boolean {
    const before = (a: Range['start'], b: Range['start']) =>
        a.line < b.line || (a.line === b.line && a.character <= b.character);
    return before(outer.start, inner.start) && before(inner.end, outer.end);
}

/**
 * Asserts every symbol's selection range and children lie within its range.
 *
 * @param symbols - Symbols to check recursively.
 */
function expectNestedRanges(symbols: DocumentSymbol[]): void {
    for (const symbol of symbols) {
        expect(contains(symbol.range, symbol.selectionRange)).toBe(true);
        for (const child of symbol.children ?? []) {
            expect(contains(symbol.range, child.range)).toBe(true);
        }
        expectNestedRanges(symbol.children ?? []);
    }
}

describe('doDocumentSymbols', () => {
    it('outlines plays, task sections, and tasks in a playbook', () => {
        const d = doc([
            '- name: Configure web',
            '  hosts: web',
            '  pre_tasks:',
            '    - name: Update cache',
            '      ansible.builtin.apt:',
            '        update_cache: true',
            '  tasks:',
            '    - name: Install nginx',
            '      ansible.builtin.package:',
            '        name: nginx',
            '    - ansible.builtin.debug:',
            '        msg: no name',
            '  handlers:',
            '    - name: Restart nginx',
            '      ansible.builtin.service:',
            '        name: nginx',
            '        state: restarted',
        ]);

        const symbols = doDocumentSymbols(d);

        expect(outline(symbols)).toEqual([
            {
                name: 'Configure web',
                kind: SymbolKind.Module,
                children: [
                    {
                        name: 'pre_tasks',
                        kind: SymbolKind.Array,
                        children: [{ name: 'Update cache', kind: SymbolKind.Function }],
                    },
                    {
                        name: 'tasks',
                        kind: SymbolKind.Array,
                        children: [
                            { name: 'Install nginx', kind: SymbolKind.Function },
                            { name: 'ansible.builtin.debug', kind: SymbolKind.Function },
                        ],
                    },
                    {
                        name: 'handlers',
                        kind: SymbolKind.Array,
                        children: [{ name: 'Restart nginx', kind: SymbolKind.Function }],
                    },
                ],
            },
        ]);
        expect(symbols[0]?.detail).toBe('hosts: web');
        expect(symbols[0]?.children?.[1]?.children?.[0]?.detail).toBe('ansible.builtin.package');
        expectNestedRanges(symbols);
    });

    it('selects the name value and spans the whole play', () => {
        const d = doc(['- name: Site', '  hosts: all', '  tasks:', '    - ansible.builtin.ping:']);

        const symbols = doDocumentSymbols(d);

        expect(symbols).toHaveLength(1);
        const play = symbols[0];
        expect(play.selectionRange).toEqual({
            start: { line: 0, character: 8 },
            end: { line: 0, character: 12 },
        });
        expect(play.range.start).toEqual({ line: 0, character: 2 });
        expect(play.range.end.line).toBeGreaterThanOrEqual(3);
    });

    it('falls back to hosts or position for unnamed plays', () => {
        const d = doc([
            '- hosts: db',
            '  tasks: []',
            '- gather_facts: false',
            '  hosts: ""',
            '  tasks: []',
        ]);

        expect(doDocumentSymbols(d).map((s) => s.name)).toEqual(['Play: db', 'Play 2']);
    });

    it('nests block, rescue, and always sections', () => {
        const d = doc([
            '- hosts: all',
            '  tasks:',
            '    - name: Guarded',
            '      block:',
            '        - name: Try',
            '          ansible.builtin.command: /bin/false',
            '      rescue:',
            '        - block:',
            '            - ansible.builtin.debug:',
            '                msg: inner',
            '      always:',
            '        - name: Cleanup',
            '          ansible.builtin.file:',
            '            path: /tmp/x',
            '            state: absent',
        ]);

        const symbols = doDocumentSymbols(d);
        const block = symbols[0]?.children?.[0]?.children?.[0];

        expect(outline(block ? [block] : [])).toEqual([
            {
                name: 'Guarded',
                kind: SymbolKind.Namespace,
                children: [
                    {
                        name: 'block',
                        kind: SymbolKind.Array,
                        children: [{ name: 'Try', kind: SymbolKind.Function }],
                    },
                    {
                        name: 'rescue',
                        kind: SymbolKind.Array,
                        children: [
                            {
                                name: 'Block 1',
                                kind: SymbolKind.Namespace,
                                children: [
                                    {
                                        name: 'block',
                                        kind: SymbolKind.Array,
                                        children: [
                                            {
                                                name: 'ansible.builtin.debug',
                                                kind: SymbolKind.Function,
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        name: 'always',
                        kind: SymbolKind.Array,
                        children: [{ name: 'Cleanup', kind: SymbolKind.Function }],
                    },
                ],
            },
        ]);
        expectNestedRanges(symbols);
    });

    it('lists roles given as strings and maps', () => {
        const d = doc([
            '- hosts: all',
            '  roles:',
            '    - common',
            '    - role: acme.web.nginx',
            '      vars:',
            '        port: 80',
            '    - name: geerlingguy.mysql',
            '    - tags: [x]',
            '    - [nested]',
        ]);

        const roles = doDocumentSymbols(d)[0]?.children?.[0];

        expect(roles?.name).toBe('roles');
        expect(outline(roles?.children)).toEqual([
            { name: 'common', kind: SymbolKind.Package },
            { name: 'acme.web.nginx', kind: SymbolKind.Package },
            { name: 'geerlingguy.mysql', kind: SymbolKind.Package },
            { name: 'Role 4', kind: SymbolKind.Package },
        ]);
    });

    it('represents playbook imports as file symbols', () => {
        const d = doc([
            '- ansible.builtin.import_playbook: setup.yml',
            '- name: Deploy app',
            '  import_playbook: deploy.yml',
            '- import_playbook:',
        ]);

        const symbols = doDocumentSymbols(d);

        expect(symbols.map((s) => [s.name, s.kind, s.detail])).toEqual([
            ['import_playbook: setup.yml', SymbolKind.File, 'setup.yml'],
            ['Deploy app', SymbolKind.File, 'deploy.yml'],
            ['import_playbook: ?', SymbolKind.File, undefined],
        ]);
    });

    it('outlines a task file without a play wrapper', () => {
        const d = doc(
            [
                '- name: Install packages',
                '  ansible.builtin.package:',
                '    name: git',
                '- ansible.builtin.include_tasks: other.yml',
                '- when: false',
            ],
            'file:///roles/x/tasks/main.yml',
        );

        expect(outline(doDocumentSymbols(d))).toEqual([
            { name: 'Install packages', kind: SymbolKind.Function },
            { name: 'ansible.builtin.include_tasks', kind: SymbolKind.Function },
            { name: 'Task 3', kind: SymbolKind.Function },
        ]);
    });

    it('outlines every document in a multi-document stream', () => {
        const d = doc([
            '---',
            '- hosts: a',
            '  tasks: []',
            '---',
            'not: a playbook',
            '---',
            '- hosts: b',
        ]);

        expect(doDocumentSymbols(d).map((s) => s.name)).toEqual(['Play: a', 'Play: b']);
    });

    it.each([
        ['an empty document', ['']],
        ['a mapping root', ['foo: bar', 'baz: 1']],
        ['a scalar root', ['just text']],
        ['a sequence of scalars', ['- a', '- b']],
    ])('returns no symbols for %s', (_label, lines) => {
        expect(doDocumentSymbols(doc(lines))).toEqual([]);
    });

    it('ignores section values that are not lists', () => {
        const d = doc(['- hosts: all', '  tasks: "{{ dynamic }}"', '  handlers:']);

        expect(doDocumentSymbols(d)[0]?.children).toEqual([]);
    });

    it('tolerates incomplete YAML while typing', () => {
        const d = doc([
            '- name: Partial',
            '  hosts: all',
            '  tasks:',
            '    - name: Half',
            '      ansible.builtin.',
        ]);

        const symbols = doDocumentSymbols(d);

        expect(symbols[0]?.name).toBe('Partial');
        expect(symbols[0]?.children?.[0]?.children?.[0]?.name).toBe('Half');
        expectNestedRanges(symbols);
    });
});
