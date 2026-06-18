import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
const execMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
    execFile: execFileMock,
    exec: execMock,
}));

vi.mock('vscode', () => undefined);

vi.mock('../../src/CommandService', () => ({
    getCommandService: () => ({
        getToolPath: vi.fn().mockResolvedValue('/usr/bin/ansible-doc'),
    }),
}));

import { SCMDocsCache } from '../../src/SCMDocsCache';

/**
 * Builds a minimal metadata dump JSON for testing.
 *
 * @param namespace - Ansible collection namespace.
 * @param name - Ansible collection name.
 * @returns Stringified metadata dump JSON.
 */
function buildMetadataDump(namespace: string, name: string): string {
    return JSON.stringify({
        all: {
            module: {
                [`${namespace}.${name}.my_module`]: {
                    doc: {
                        collection: `${namespace}.${name}`,
                        plugin_name: `${namespace}.${name}.my_module`,
                        short_description: 'Test module',
                        options: {
                            param1: { type: 'str', description: 'A parameter' },
                        },
                    },
                    examples: '- name: Example\n  my_module:',
                    return: {
                        result: { type: 'str', description: 'The result' },
                    },
                },
            },
            lookup: {
                [`${namespace}.${name}.my_lookup`]: {
                    doc: {
                        collection: `${namespace}.${name}`,
                        plugin_name: `${namespace}.${name}.my_lookup`,
                        short_description: 'Test lookup',
                    },
                },
            },
        },
    });
}

describe('SCMDocsCache', () => {
    let tmpDir: string;
    let cacheDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scm-docs-test-'));
        cacheDir = path.join(os.homedir(), '.cache', 'ansible-environments', 'scm-docs');
        SCMDocsCache._setInstance(undefined);
        execFileMock.mockReset();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        // Clean up test cache files to avoid cross-test contamination
        if (fs.existsSync(cacheDir)) {
            for (const f of fs.readdirSync(cacheDir)) {
                if (
                    f.startsWith('test-org__') ||
                    f.startsWith('inv-org__') ||
                    f.startsWith('empty-org__')
                ) {
                    fs.unlinkSync(path.join(cacheDir, f));
                }
            }
        }
        SCMDocsCache._setInstance(undefined);
    });

    it('returns singleton instance', () => {
        const a = SCMDocsCache.getInstance();
        const b = SCMDocsCache.getInstance();
        expect(a).toBe(b);
    });

    it('invalidate clears memory cache', () => {
        const cache = SCMDocsCache.getInstance();
        cache.invalidate('test-org', 'test-repo');
        // Should not throw, just clears the key
    });

    it('returns null from getPluginTypes when clone fails', async () => {
        execFileMock.mockImplementation(
            (
                _cmd: string,
                _args: string[],
                _opts: unknown,
                cb: (err: Error | null, stdout: string, stderr: string) => void,
            ) => {
                cb(new Error('git clone failed'), '', 'fatal: repo not found');
            },
        );

        const cache = SCMDocsCache.getInstance();
        cache.setLogFunction(vi.fn());

        const result = await cache.getPluginTypes('test-org', 'test-repo', 'test', 'col');
        expect(result).toBeNull();
    });

    it('indexes plugins via shallow clone and ansible-doc', async () => {
        let callCount = 0;
        execFileMock.mockImplementation(
            (
                cmd: string,
                args: string[],
                _opts: unknown,
                cb: (err: Error | null, stdout: string, stderr: string) => void,
            ) => {
                callCount++;
                if (cmd === 'git' && args[0] === 'clone') {
                    cb(null, '', '');
                } else if (cmd === 'git' && args.includes('rev-parse')) {
                    cb(null, 'abc1234def5678\n', '');
                } else if (args.includes('--metadata-dump')) {
                    cb(null, buildMetadataDump('test', 'col'), '');
                } else {
                    cb(new Error(`Unexpected command: ${cmd} ${args.join(' ')}`), '', '');
                }
            },
        );

        const cache = SCMDocsCache.getInstance();
        cache.setLogFunction(vi.fn());

        const pluginTypes = await cache.getPluginTypes('test-org', 'test-repo', 'test', 'col');

        expect(pluginTypes).not.toBeNull();
        expect(pluginTypes).toHaveProperty('module');
        expect(pluginTypes).toHaveProperty('lookup');
        expect((pluginTypes as Record<string, unknown[]>).module).toHaveLength(1);
        expect((pluginTypes as Record<string, unknown[]>).lookup).toHaveLength(1);
        expect(callCount).toBe(3);
    });

    it('returns plugin documentation for a specific plugin', async () => {
        execFileMock.mockImplementation(
            (
                cmd: string,
                args: string[],
                _opts: unknown,
                cb: (err: Error | null, stdout: string, stderr: string) => void,
            ) => {
                if (cmd === 'git' && args[0] === 'clone') {
                    cb(null, '', '');
                } else if (cmd === 'git' && args.includes('rev-parse')) {
                    cb(null, 'abc1234def5678\n', '');
                } else if (args.includes('--metadata-dump')) {
                    cb(null, buildMetadataDump('test', 'col'), '');
                } else {
                    cb(new Error(`Unexpected: ${cmd}`), '', '');
                }
            },
        );

        const cache = SCMDocsCache.getInstance();
        cache.setLogFunction(vi.fn());

        const doc = await cache.getPluginDoc(
            'test-org',
            'test-repo',
            'test',
            'col',
            'test.col.my_module',
            'module',
        );

        expect(doc).not.toBeNull();
        expect(doc?.doc?.short_description).toBe('Test module');
        expect(doc?.examples).toContain('Example');
        expect(doc?.return).toHaveProperty('result');
    });

    it('returns null for a non-existent plugin', async () => {
        execFileMock.mockImplementation(
            (
                cmd: string,
                args: string[],
                _opts: unknown,
                cb: (err: Error | null, stdout: string, stderr: string) => void,
            ) => {
                if (cmd === 'git' && args[0] === 'clone') {
                    cb(null, '', '');
                } else if (cmd === 'git' && args.includes('rev-parse')) {
                    cb(null, 'abc1234def5678\n', '');
                } else if (args.includes('--metadata-dump')) {
                    cb(null, buildMetadataDump('test', 'col'), '');
                } else {
                    cb(new Error(`Unexpected: ${cmd}`), '', '');
                }
            },
        );

        const cache = SCMDocsCache.getInstance();
        cache.setLogFunction(vi.fn());

        const doc = await cache.getPluginDoc(
            'test-org',
            'test-repo',
            'test',
            'col',
            'test.col.nonexistent',
            'module',
        );

        expect(doc).toBeNull();
    });

    it('uses memory cache on second call', async () => {
        let cloneCount = 0;
        execFileMock.mockImplementation(
            (
                cmd: string,
                args: string[],
                _opts: unknown,
                cb: (err: Error | null, stdout: string, stderr: string) => void,
            ) => {
                if (cmd === 'git' && args[0] === 'clone') {
                    cloneCount++;
                    cb(null, '', '');
                } else if (cmd === 'git' && args.includes('rev-parse')) {
                    cb(null, 'abc1234def5678\n', '');
                } else if (args.includes('--metadata-dump')) {
                    cb(null, buildMetadataDump('test', 'col'), '');
                } else {
                    cb(new Error(`Unexpected: ${cmd}`), '', '');
                }
            },
        );

        const cache = SCMDocsCache.getInstance();
        cache.setLogFunction(vi.fn());

        await cache.getPluginTypes('test-org', 'test-repo', 'test', 'col');
        await cache.getPluginTypes('test-org', 'test-repo', 'test', 'col');

        expect(cloneCount).toBe(1);
    });

    it('refetches after invalidate', async () => {
        let cloneCount = 0;
        execFileMock.mockImplementation(
            (
                cmd: string,
                args: string[],
                _opts: unknown,
                cb: (err: Error | null, stdout: string, stderr: string) => void,
            ) => {
                if (cmd === 'git' && args[0] === 'clone') {
                    cloneCount++;
                    cb(null, '', '');
                } else if (cmd === 'git' && args.includes('rev-parse')) {
                    cb(null, `sha-${String(cloneCount)}aaaa\n`, '');
                } else if (args.includes('--metadata-dump')) {
                    cb(null, buildMetadataDump('inv', 'refetch'), '');
                } else {
                    cb(new Error(`Unexpected: ${cmd}`), '', '');
                }
            },
        );

        const cache = SCMDocsCache.getInstance();
        cache.setLogFunction(vi.fn());

        await cache.getPluginTypes('inv-org', 'inv-repo', 'inv', 'refetch');
        cache.invalidate('inv-org', 'inv-repo');
        await cache.getPluginTypes('inv-org', 'inv-repo', 'inv', 'refetch');

        expect(cloneCount).toBe(2);
    });

    it('handles empty metadata dump', async () => {
        execFileMock.mockImplementation(
            (
                cmd: string,
                args: string[],
                _opts: unknown,
                cb: (err: Error | null, stdout: string, stderr: string) => void,
            ) => {
                if (cmd === 'git' && args[0] === 'clone') {
                    cb(null, '', '');
                } else if (cmd === 'git' && args.includes('rev-parse')) {
                    cb(null, 'empty111222333\n', '');
                } else if (args.includes('--metadata-dump')) {
                    cb(null, '{"all": {}}', '');
                } else {
                    cb(new Error(`Unexpected: ${cmd}`), '', '');
                }
            },
        );

        const cache = SCMDocsCache.getInstance();
        cache.setLogFunction(vi.fn());

        const result = await cache.getPluginTypes('empty-org', 'empty-repo', 'empty', 'col');
        expect(result).toEqual({});
    });
});
