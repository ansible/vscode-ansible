import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetPluginDocumentation = vi.fn();

vi.mock('@ansible/core', () => ({
    CollectionsService: {
        getInstance: () => ({
            getPluginDocumentation: mockGetPluginDocumentation,
        }),
    },
}));

import { TaskBuilder } from '../src/taskBuilder';

function copyPluginDoc() {
    return {
        doc: {
            short_description: 'Copy files',
            options: {
                src: { required: true, type: 'str', description: 'Source file' },
                dest: { required: true, type: 'str', description: 'Destination' },
                mode: { required: false, type: 'str', description: 'Mode', default: '0644' },
            },
        },
    };
}

describe('TaskBuilder', () => {
    let builder: TaskBuilder;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetPluginDocumentation.mockResolvedValue(copyPluginDoc());
        builder = new TaskBuilder();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates a session and lists missing required parameters', async () => {
        const result = await builder.build({ plugin: 'ansible.builtin.copy' });

        expect(result.status).toBe('in_progress');
        expect(result.session_id).toMatch(/^task_/);
        expect(result.plugin).toBe('ansible.builtin.copy');
        expect(result.missing_required?.sort()).toEqual(['dest', 'src']);
        expect(result.can_generate).toBe(false);
        expect(result.message).toContain('**Required parameters');
        expect(result.message).toContain('src');
        expect(result.message).toContain('dest');
        expect(result.optional_available).toContain('mode');
    });

    it('tracks collected params and updates missing required list', async () => {
        const first = await builder.build({ plugin: 'ansible.builtin.copy' });
        const sid = first.session_id!;

        const second = await builder.build({
            session_id: sid,
            params: { src: '/local/file' },
        });

        expect(second.status).toBe('in_progress');
        expect(second.missing_required).toEqual(['dest']);
        expect(second.collected).toMatchObject({ src: '/local/file' });
        expect(second.can_generate).toBe(false);
    });

    it('prompts in the message when generate is true but required params are missing', async () => {
        const first = await builder.build({ plugin: 'ansible.builtin.copy' });
        const sid = first.session_id!;

        const result = await builder.build({
            session_id: sid,
            generate: true,
        });

        expect(result.status).toBe('in_progress');
        expect(result.can_generate).toBe(false);
        expect(result.message).toContain('Cannot generate yet');
        expect(result.message).toContain('missing required');
    });

    it('generates YAML and completes when all required params are provided and generate is true', async () => {
        const first = await builder.build({ plugin: 'ansible.builtin.copy' });
        const sid = first.session_id!;

        const result = await builder.build({
            session_id: sid,
            params: { src: '/a', dest: '/b', mode: '0600' },
            task_name: 'Copy app file',
            become: true,
            register: 'copy_result',
            when: 'ansible_os_family == "Debian"',
            generate: true,
        });

        expect(result.status).toBe('complete');
        expect(result.yaml).toContain('- name: Copy app file');
        expect(result.yaml).toContain('ansible.builtin.copy:');
        expect(result.yaml).toContain('src: /a');
        expect(result.yaml).toContain('dest: /b');
        expect(result.yaml).toContain('mode:');
        expect(result.yaml).toContain('register: copy_result');
        expect(result.yaml).toContain('when:');
        expect(result.yaml).toContain('become: true');
        expect(builder.getActiveSessionCount()).toBe(0);
    });

    it('cancel clears the session', async () => {
        const first = await builder.build({ plugin: 'ansible.builtin.copy' });
        const sid = first.session_id!;
        expect(builder.getActiveSessionCount()).toBe(1);

        const cancelled = await builder.build({
            session_id: sid,
            cancel: true,
        });

        expect(cancelled.status).toBe('cancelled');
        expect(cancelled.message).toContain('cancelled');
        expect(builder.getActiveSessionCount()).toBe(0);
    });

    it('expires sessions after TTL and rejects stale session_id', async () => {
        const now = vi.spyOn(Date, 'now');
        now.mockReturnValue(1_700_000_000_000);

        const first = await builder.build({ plugin: 'ansible.builtin.copy' });
        const sid = first.session_id!;

        now.mockReturnValue(1_700_000_000_000 + 11 * 60 * 1000);

        const afterExpiry = await builder.build({
            session_id: sid,
            params: { src: 'x', dest: 'y' },
        });

        expect(afterExpiry.status).toBe('error');
        expect(afterExpiry.message).toContain('session_id');

        now.mockRestore();
    });

    it('returns error when neither plugin nor valid session_id is provided', async () => {
        const result = await builder.build({ session_id: 'task_nonexistent_xxx' });

        expect(result.status).toBe('error');
        expect(result.message).toContain('Provide either session_id');
    });

    it('cancel removes session', async () => {
        const startResult = await builder.build({ plugin: 'ansible.builtin.copy' });
        const sessionId = startResult.session_id!;
        const result = await builder.build({ session_id: sessionId, cancel: true });
        expect(result.status).toBe('cancelled');
        expect(builder.getActiveSessionCount()).toBe(0);
    });

    it('returns error when neither session_id nor plugin provided', async () => {
        const result = await builder.build({});
        expect(result.status).toBe('error');
        expect(result.message).toContain('session_id');
    });

    it('generate with missing required params returns in_progress', async () => {
        const startResult = await builder.build({ plugin: 'ansible.builtin.copy' });
        const result = await builder.build({ session_id: startResult.session_id, generate: true });
        expect(result.status).toBe('in_progress');
        expect(result.can_generate).toBe(false);
        expect(result.missing_required!.length).toBeGreaterThan(0);
    });

    it('collects task options across builds', async () => {
        const start = await builder.build({ plugin: 'ansible.builtin.copy' });
        await builder.build({
            session_id: start.session_id,
            task_name: 'My task',
            become: true,
            register: 'result',
            when: "ansible_os_family == 'Debian'",
        });
        const result = await builder.build({
            session_id: start.session_id,
            params: { src: '/a', dest: '/b' },
            generate: true,
        });
        expect(result.status).toBe('complete');
        expect(result.yaml).toContain('name: My task');
        expect(result.yaml).toContain('become: true');
        expect(result.yaml).toContain('register: result');
        expect(result.yaml).toContain('when:');
    });

    it('_formatYamlValue handles multiline strings with block scalar', () => {
        const fmt = (builder as unknown as { _formatYamlValue: (v: unknown, i: number) => string })._formatYamlValue.bind(builder);
        const result = fmt('line1\nline2', 0);
        expect(result).toContain('|');
        expect(result).toContain('line1');
    });

    it('_formatYamlValue handles YAML-sensitive strings by quoting', () => {
        const fmt = (builder as unknown as { _formatYamlValue: (v: unknown, i: number) => string })._formatYamlValue.bind(builder);
        expect(fmt('true', 0)).toBe('"true"');
        expect(fmt('123', 0)).toBe('"123"');
        expect(fmt('key: val', 0)).toContain('"');
        expect(fmt('has # comment', 0)).toContain('"');
    });

    it('_formatYamlValue handles arrays and objects', () => {
        const fmt = (builder as unknown as { _formatYamlValue: (v: unknown, i: number) => string })._formatYamlValue.bind(builder);
        expect(fmt([], 0)).toBe('[]');
        expect(fmt([1, 2], 0)).toBe('[1, 2]');
        expect(fmt([{ a: 1 }], 0)).toContain('{');
        expect(fmt({ key: 'val' }, 0)).toContain('{');
    });

    it('_formatYamlValue handles null, undefined, boolean, number', () => {
        const fmt = (builder as unknown as { _formatYamlValue: (v: unknown, i: number) => string })._formatYamlValue.bind(builder);
        expect(fmt(null, 0)).toBe('null');
        expect(fmt(undefined, 0)).toBe('null');
        expect(fmt(true, 0)).toBe('true');
        expect(fmt(false, 0)).toBe('false');
        expect(fmt(42, 0)).toBe('42');
    });

    it('session cleanup removes expired sessions', async () => {
        const start = await builder.build({ plugin: 'ansible.builtin.copy' });
        const session = (builder as unknown as { _sessions: Map<string, { createdAt: number }> })._sessions.get(start.session_id!);
        session!.createdAt = Date.now() - 20 * 60 * 1000;
        await builder.build({ plugin: 'ansible.builtin.copy' });
        expect((builder as unknown as { _sessions: Map<string, unknown> })._sessions.has(start.session_id!)).toBe(false);
    });

    it('_generateYaml uses plugin suffix for default task name', async () => {
        const start = await builder.build({ plugin: 'ansible.builtin.copy' });
        const result = await builder.build({
            session_id: start.session_id,
            params: { src: 'a', dest: 'b' },
            generate: true,
        });
        expect(result.yaml).toMatch(/^- name: Copy$/m);
    });

    it('_generateYaml formats multiline param value as block', async () => {
        const start = await builder.build({ plugin: 'ansible.builtin.copy' });
        const result = await builder.build({
            session_id: start.session_id,
            params: { src: 'a', dest: 'b', content: 'line1\nline2' },
            generate: true,
        });
        expect(result.yaml).toContain('content:');
        expect(result.yaml).toContain('|');
    });

    it('_buildPromptMessage includes optional params when all required are met', async () => {
        const start = await builder.build({ plugin: 'ansible.builtin.copy' });
        const result = await builder.build({
            session_id: start.session_id,
            params: { src: 'a', dest: 'b' },
        });
        expect(result.message).toContain('Ready to generate');
        expect(result.optional_available!.length).toBeGreaterThan(0);
    });

    it('_getShortDescription truncates long descriptions', () => {
        const getDesc = (builder as unknown as { _getShortDescription: (spec?: unknown) => string })._getShortDescription.bind(builder);
        expect(getDesc(undefined)).toBe('');
        expect(getDesc({ description: 'short' })).toBe('short');
        expect(getDesc({ description: 'x'.repeat(150) })).toHaveLength(100);
        expect(getDesc({ description: ['first line', 'second line'] })).toBe('first line');
    });

    it('_updateMissingRequired handles aliases', async () => {
        mockGetPluginDocumentation.mockResolvedValue({
            doc: {
                short_description: 'Test',
                options: {
                    source: { required: true, type: 'str', aliases: ['src'] },
                    dest: { required: true, type: 'str' },
                },
            },
        });
        const start = await builder.build({ plugin: 'test.aliased' });
        const result = await builder.build({
            session_id: start.session_id,
            params: { src: '/a', dest: '/b' },
        });
        expect(result.can_generate).toBe(true);
        expect(result.missing_required).toEqual([]);
    });
});
