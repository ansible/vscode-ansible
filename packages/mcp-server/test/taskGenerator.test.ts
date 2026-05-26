import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetPluginDocumentation = vi.fn();

vi.mock('@ansible/core', () => ({
    CollectionsService: {
        getInstance: () => ({
            getPluginDocumentation: mockGetPluginDocumentation,
        }),
    },
}));

import { TaskGenerator } from '../src/taskGenerator';

function copyPluginDoc() {
    return {
        doc: {
            short_description: 'Copy files to remote locations',
            description: 'The copy module copies a file on the local machine to remote hosts.',
            options: {
                src: { required: true, type: 'str', description: 'Path to local file' },
                dest: { required: true, type: 'str', description: 'Destination path' },
                mode: { required: false, type: 'str', description: 'File mode' },
            },
        },
    };
}

describe('TaskGenerator', () => {
    let generator: TaskGenerator;

    beforeEach(() => {
        vi.clearAllMocks();
        generator = new TaskGenerator();
        mockGetPluginDocumentation.mockResolvedValue(copyPluginDoc());
    });

    it('generate produces YAML with task name, module key, and params', async () => {
        const { yaml } = await generator.generate({
            plugin: 'ansible.builtin.copy',
            params: { src: '/tmp/a', dest: '/tmp/b' },
        });

        expect(yaml).toMatch(/^- name: /m);
        expect(yaml).toContain('ansible.builtin.copy:');
        expect(yaml).toContain('src:');
        expect(yaml).toContain('dest:');
    });

    it('generate warns when required plugin params are missing', async () => {
        const { yaml, warnings } = await generator.generate({
            plugin: 'ansible.builtin.copy',
            params: { src: '/only-src' },
        });

        expect(yaml).toBeTruthy();
        expect(warnings.some(w => w.includes('Missing required parameter: dest'))).toBe(true);
    });

    it('generate includes become, when, register, loop, ignore_errors, and tags when set', async () => {
        const { yaml } = await generator.generate({
            plugin: 'ansible.builtin.copy',
            params: { src: 'x', dest: 'y' },
            become: true,
            when: "ansible_os_family == 'Debian'",
            register: 'copy_out',
            loop: ['a', 'b'],
            ignore_errors: true,
            tags: ['app', 'config'],
        });

        expect(yaml).toContain('register: copy_out');
        expect(yaml).toContain("when: ansible_os_family == 'Debian'");
        expect(yaml).toContain('loop:');
        expect(yaml).toContain('- a');
        expect(yaml).toContain('- b');
        expect(yaml).toContain('become: true');
        expect(yaml).toContain('ignore_errors: true');
        expect(yaml).toMatch(/tags:\s*\[/);
        expect(yaml).toContain('app');
        expect(yaml).toContain('config');
    });

    it('generate uses custom task_name when provided', async () => {
        const { yaml } = await generator.generate({
            plugin: 'ansible.builtin.copy',
            params: { src: 's', dest: 'd' },
            task_name: 'Deploy configuration file',
        });

        expect(yaml).toMatch(/^- name: Deploy configuration file$/m);
    });

    it('generatePlaybook wraps tasks in a play structure', async () => {
        const { yaml } = await generator.generatePlaybook({
            name: 'Configure web servers',
            hosts: 'webservers',
            tasks: [
                {
                    plugin: 'ansible.builtin.copy',
                    params: { src: 'a', dest: 'b' },
                },
            ],
        });

        expect(yaml.startsWith('---\n')).toBe(true);
        expect(yaml).toMatch(/^- name: Configure web servers$/m);
        expect(yaml).toMatch(/^\s{2}hosts: webservers$/m);
        expect(yaml).toMatch(/^\s{2}tasks:$/m);
        expect(yaml).toContain('  - name:');
        expect(yaml).toContain('    ansible.builtin.copy:');
    });

    it('generatePlaybook includes play-level become, vars, and gather_facts: false', async () => {
        const { yaml } = await generator.generatePlaybook({
            name: 'App deploy',
            hosts: 'all',
            become: true,
            gather_facts: false,
            vars: { app_version: '1.2.3', feature_enabled: true },
            tasks: [
                { plugin: 'ansible.builtin.copy', params: { src: '1', dest: '2' } },
            ],
        });

        expect(yaml).toMatch(/^\s{2}gather_facts: false$/m);
        expect(yaml).toMatch(/^\s{2}become: true$/m);
        expect(yaml).toMatch(/^\s{2}vars:$/m);
        expect(yaml).toMatch(/^\s{4}app_version: 1\.2\.3$/m);
        expect(yaml).toMatch(/^\s{4}feature_enabled: true$/m);
    });

    it('generatePlaybook passes task-level become, when, and register into each task', async () => {
        const { yaml } = await generator.generatePlaybook({
            name: 'Multi',
            hosts: 'localhost',
            tasks: [
                {
                    plugin: 'ansible.builtin.copy',
                    params: { src: 'x', dest: 'y' },
                    become: true,
                    when: 'inventory_hostname == "localhost"',
                    register: 'r1',
                },
            ],
        });

        expect(yaml).toContain('register: r1');
        expect(yaml).toContain('when:');
        expect(yaml).toContain('become: true');
    });

    it('throws when plugin documentation is missing', async () => {
        mockGetPluginDocumentation.mockResolvedValue(null);

        await expect(
            generator.generate({
                plugin: 'missing.collection.nope',
                params: {},
            }),
        ).rejects.toThrow(/Plugin not found/);
    });

    it('generate auto-generates task name from short_description', async () => {
        const { yaml } = await generator.generate({
            plugin: 'ansible.builtin.copy',
            params: { src: 's', dest: 'd' },
        });
        expect(yaml).toMatch(/^- name: Copy files to remote locations$/m);
    });

    it('generate auto-generates task name from plugin name when no short_description', async () => {
        mockGetPluginDocumentation.mockResolvedValue({
            doc: { options: {} },
        });
        const { yaml } = await generator.generate({
            plugin: 'ansible.builtin.debug',
            params: { msg: 'hello' },
        });
        expect(yaml).toMatch(/^- name: Debug$/m);
    });

    it('generate handles nested object parameters', async () => {
        const { yaml } = await generator.generate({
            plugin: 'ansible.builtin.copy',
            params: { content: { key: 'value', nested: { deep: true } } },
        });
        expect(yaml).toContain('content:');
        expect(yaml).toContain('key:');
        expect(yaml).toContain('nested:');
        expect(yaml).toContain('deep: true');
    });

    it('generate handles array of objects in params', async () => {
        const { yaml } = await generator.generate({
            plugin: 'ansible.builtin.copy',
            params: { items: [{ name: 'a', path: '/a' }, { name: 'b', path: '/b' }] },
        });
        expect(yaml).toContain('items:');
        expect(yaml).toContain('- name:');
    });

    it('_formatValue handles null, undefined, booleans, numbers, empty array, empty object', () => {
        const gen = generator as unknown as {
            _formatValue: (v: unknown, d: number) => string;
        };
        expect(gen._formatValue(null, 0)).toBe('null');
        expect(gen._formatValue(undefined, 0)).toBe('null');
        expect(gen._formatValue(true, 0)).toBe('true');
        expect(gen._formatValue(false, 0)).toBe('false');
        expect(gen._formatValue(42, 0)).toBe('42');
        expect(gen._formatValue([], 0)).toBe('[]');
        expect(gen._formatValue({}, 0)).toBe('{}');
    });

    it('_formatValue handles array of mixed complex objects', () => {
        const gen = generator as unknown as {
            _formatValue: (v: unknown, d: number) => string;
        };
        const result = gen._formatValue([{ a: 1 }], 0);
        expect(result).toContain('{');
    });

    it('_formatString quotes special YAML values', () => {
        const gen = generator as unknown as { _formatString: (v: string) => string };
        expect(gen._formatString('true')).toBe('"true"');
        expect(gen._formatString('false')).toBe('"false"');
        expect(gen._formatString('yes')).toBe('"yes"');
        expect(gen._formatString('null')).toBe('"null"');
        expect(gen._formatString('42')).toBe('"42"');
        expect(gen._formatString('')).toBe('""');
        expect(gen._formatString('key: value')).toContain('"');
        expect(gen._formatString('# comment')).toContain('"');
        expect(gen._formatString('{jinja}')).toContain('"');
        expect(gen._formatString('[list]')).toContain('"');
        expect(gen._formatString('*anchor')).toContain('"');
        expect(gen._formatString('&ref')).toContain('"');
        expect(gen._formatString('!tag')).toContain('"');
        expect(gen._formatString('|literal')).toContain('"');
        expect(gen._formatString('>folded')).toContain('"');
        expect(gen._formatString(' leading space')).toContain('"');
    });

    it('_formatString uses block scalar for multiline strings', () => {
        const gen = generator as unknown as { _formatString: (v: string) => string };
        const result = gen._formatString('line1\nline2\nline3');
        expect(result).toContain('|');
        expect(result).toContain('line1');
    });

    it('_formatString passes through safe strings unquoted', () => {
        const gen = generator as unknown as { _formatString: (v: string) => string };
        expect(gen._formatString('simple')).toBe('simple');
        expect(gen._formatString('my_var')).toBe('my_var');
    });

    it('_formatListItem handles non-object items', () => {
        const gen = generator as unknown as {
            _formatListItem: (item: unknown, indent: number) => string[];
        };
        const result = gen._formatListItem('simple', 2);
        expect(result[0]).toContain('- simple');
    });

    it('generatePlaybook catches errors for individual tasks', async () => {
        mockGetPluginDocumentation
            .mockResolvedValueOnce(copyPluginDoc())
            .mockResolvedValueOnce(null);
        const { yaml, warnings } = await generator.generatePlaybook({
            name: 'Mixed',
            hosts: 'all',
            tasks: [
                { plugin: 'ansible.builtin.copy', params: { src: 'a', dest: 'b' } },
                { plugin: 'missing.thing', params: {} },
            ],
        });
        expect(yaml).toContain('ansible.builtin.copy');
        expect(warnings.some(w => w.includes('Failed to generate task'))).toBe(true);
    });

    it('generate caches plugin docs across calls', async () => {
        await generator.generate({ plugin: 'ansible.builtin.copy', params: { src: 'a', dest: 'b' } });
        await generator.generate({ plugin: 'ansible.builtin.copy', params: { src: 'c', dest: 'd' } });
        expect(mockGetPluginDocumentation).toHaveBeenCalledTimes(1);
    });

    it('clearCache clears the doc cache', async () => {
        await generator.generate({ plugin: 'ansible.builtin.copy', params: { src: 'a', dest: 'b' } });
        generator.clearCache();
        await generator.generate({ plugin: 'ansible.builtin.copy', params: { src: 'c', dest: 'd' } });
        expect(mockGetPluginDocumentation).toHaveBeenCalledTimes(2);
    });

    it('_validateParams recognizes aliases satisfy requirements', async () => {
        mockGetPluginDocumentation.mockResolvedValue({
            doc: {
                short_description: 'Test',
                options: {
                    source: { required: true, type: 'str', aliases: ['src'] },
                    dest: { required: true, type: 'str' },
                },
            },
        });
        const { warnings } = await generator.generate({
            plugin: 'test.module',
            params: { src: '/a', dest: '/b' },
        });
        expect(warnings.some(w => w.includes('source'))).toBe(false);
    });
});
