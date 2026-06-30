import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
    const mockRunCommand = vi.fn();
    const mockRunCommandArgs = vi.fn();
    return {
        mockRunCommand,
        mockRunCommandArgs,
        getCommandService: vi.fn(() => ({
            runCommand: mockRunCommand,
            runCommandArgs: mockRunCommandArgs,
        })),
    };
});

vi.mock('../../src/CommandService', () => ({
    getCommandService: mocks.getCommandService,
}));

import {
    detectEngine,
    listImages,
    inspectImage,
    classifyEE,
    runInContainer,
    getScriptCacheDir,
    deployScripts,
} from '../../src/ContainerRuntime';

// ── Sample data ─────────────────────────────────────────────────────

const PODMAN_IMAGES_JSON = JSON.stringify([
    {
        Id: 'sha256:aaa111',
        Names: ['quay.io/ansible/ee-supported:latest'],
        CreatedAt: '2026-06-01T10:00:00Z',
        Size: 1073741824,
    },
    {
        Id: 'sha256:bbb222',
        Names: ['quay.io/ansible/ee-minimal:2.19', 'quay.io/ansible/ee-minimal:latest'],
        CreatedAt: '2026-05-15T08:00:00Z',
        Size: 536870912,
    },
    {
        Id: 'sha256:ccc333',
        Names: null,
    },
]);

const DOCKER_IMAGES_LINES = [
    '{"ID":"sha256:aaa111","Repository":"quay.io/ansible/ee-supported","Tag":"latest","CreatedAt":"2026-06-01T10:00:00Z","Size":"1.2GB"}',
    '{"ID":"sha256:bbb222","Repository":"quay.io/ansible/ee-minimal","Tag":"2.19","CreatedAt":"2026-05-15T08:00:00Z","Size":"512MB"}',
    '{"ID":"sha256:ddd444","Repository":"<none>","Tag":"<none>","CreatedAt":"2026-01-01T00:00:00Z","Size":"0B"}',
].join('\n');

const INSPECT_EE_JSON = JSON.stringify([
    {
        Id: 'sha256:aaa111',
        Config: {
            Labels: { 'ansible-execution-environment': 'true' },
            WorkingDir: '/runner',
        },
        Architecture: 'amd64',
        Os: 'linux',
    },
]);

const INSPECT_NON_EE_JSON = JSON.stringify([
    {
        Id: 'sha256:eee555',
        Config: {
            Labels: {},
            WorkingDir: '/app',
        },
    },
]);

// ── Tests ───────────────────────────────────────────────────────────

describe('ContainerRuntime', () => {
    beforeEach(() => {
        mocks.mockRunCommand.mockReset();
        mocks.mockRunCommandArgs.mockReset();
    });

    describe('detectEngine', () => {
        it('returns podman when available', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: 'podman 5.0',
                stderr: '',
            });
            const engine = await detectEngine();
            expect(engine).toBe('podman');
            expect(mocks.mockRunCommand).toHaveBeenCalledWith('podman --version');
        });

        it('falls back to docker when podman is not found', async () => {
            mocks.mockRunCommand
                .mockResolvedValueOnce({ exitCode: 127, stdout: '', stderr: 'not found' })
                .mockResolvedValueOnce({ exitCode: 0, stdout: 'Docker version 24.0', stderr: '' });
            const engine = await detectEngine();
            expect(engine).toBe('docker');
        });

        it('returns null when neither is found', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 127,
                stdout: '',
                stderr: 'not found',
            });
            const engine = await detectEngine();
            expect(engine).toBeNull();
        });
    });

    describe('listImages (podman)', () => {
        it('parses podman JSON format', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: PODMAN_IMAGES_JSON,
                stderr: '',
            });
            const images = await listImages('podman');

            // 3 images: ee-supported:latest, ee-minimal:2.19, ee-minimal:latest
            // The null-Names entry is skipped
            expect(images).toHaveLength(3);
            expect(images[0]).toMatchObject({
                id: 'sha256:aaa111',
                repository: 'quay.io/ansible/ee-supported',
                tag: 'latest',
            });
            expect(images[1]).toMatchObject({
                id: 'sha256:bbb222',
                repository: 'quay.io/ansible/ee-minimal',
                tag: '2.19',
            });
            expect(images[2]).toMatchObject({
                id: 'sha256:bbb222',
                repository: 'quay.io/ansible/ee-minimal',
                tag: 'latest',
            });
        });

        it('returns empty array on failure', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 1,
                stdout: '',
                stderr: 'error',
            });
            const images = await listImages('podman');
            expect(images).toEqual([]);
        });
    });

    describe('listImages (docker)', () => {
        it('parses docker line-delimited JSON format', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: DOCKER_IMAGES_LINES,
                stderr: '',
            });
            const images = await listImages('docker');

            // 2 valid images (<none> is filtered)
            expect(images).toHaveLength(2);
            expect(images[0]).toMatchObject({
                id: 'sha256:aaa111',
                repository: 'quay.io/ansible/ee-supported',
                tag: 'latest',
            });
        });
    });

    describe('inspectImage', () => {
        it('classifies EE image correctly', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: INSPECT_EE_JSON,
                stderr: '',
            });
            const image = {
                id: 'sha256:aaa111',
                repository: 'quay.io/ansible/ee-supported',
                tag: 'latest',
                created: '2026-06-01',
                size: '1.2 GB',
                names: ['quay.io/ansible/ee-supported:latest'],
            };
            const result = await inspectImage('podman', image);
            expect(result.executionEnvironment).toBe(true);
            expect(result.inspect.config.labels['ansible-execution-environment']).toBe('true');
        });

        it('classifies non-EE image correctly', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: INSPECT_NON_EE_JSON,
                stderr: '',
            });
            const image = {
                id: 'sha256:eee555',
                repository: 'python',
                tag: '3.11',
                created: '2026-01-01',
                size: '200 MB',
                names: ['python:3.11'],
            };
            const result = await inspectImage('podman', image);
            expect(result.executionEnvironment).toBe(false);
        });
    });

    describe('classifyEE', () => {
        it('returns true for ansible-execution-environment label', () => {
            expect(classifyEE({ 'ansible-execution-environment': 'true' }, '/app')).toBe(true);
        });

        it('returns true for legacy /runner working dir', () => {
            expect(classifyEE({}, '/runner')).toBe(true);
        });

        it('returns false for non-EE image', () => {
            expect(classifyEE({}, '/app')).toBe(false);
        });

        it('returns false when label is not "true"', () => {
            expect(classifyEE({ 'ansible-execution-environment': 'false' }, '/app')).toBe(false);
        });
    });

    describe('inspectImage edge cases', () => {
        it('handles malformed JSON in inspect output', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: 'not valid json {{{',
                stderr: '',
            });
            const image = {
                id: 'sha256:fff666',
                repository: 'myimage',
                tag: 'v1',
                created: '2026-01-01',
                size: '100 MB',
                names: ['myimage:v1'],
            };
            const result = await inspectImage('podman', image);
            expect(result.executionEnvironment).toBe(false);
            expect(result.inspect.config.labels).toEqual({});
        });

        it('handles inspect command failure', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 1,
                stdout: '',
                stderr: 'no such image',
            });
            const image = {
                id: 'sha256:gone',
                repository: 'deleted',
                tag: 'latest',
                created: '',
                size: '',
                names: ['deleted:latest'],
            };
            const result = await inspectImage('docker', image);
            expect(result.executionEnvironment).toBe(false);
            expect(result.inspect.config.workingDir).toBe('');
        });

        it('handles non-array inspect JSON', async () => {
            const singleObj = JSON.stringify({
                Id: 'sha256:single',
                Config: {
                    Labels: { 'ansible-execution-environment': 'true' },
                    WorkingDir: '/runner',
                },
            });
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: singleObj,
                stderr: '',
            });
            const image = {
                id: 'sha256:single',
                repository: 'ee-image',
                tag: '1.0',
                created: '',
                size: '',
                names: ['ee-image:1.0'],
            };
            const result = await inspectImage('podman', image);
            expect(result.executionEnvironment).toBe(true);
        });

        it('handles inspect JSON with missing Config', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: JSON.stringify([{ Id: 'sha256:noconfig' }]),
                stderr: '',
            });
            const image = {
                id: 'sha256:noconfig',
                repository: 'bare',
                tag: 'latest',
                created: '',
                size: '',
                names: ['bare:latest'],
            };
            const result = await inspectImage('docker', image);
            expect(result.executionEnvironment).toBe(false);
            expect(result.inspect.config.labels).toEqual({});
            expect(result.inspect.config.workingDir).toBe('');
        });
    });

    describe('listImages edge cases', () => {
        it('returns empty on empty stdout', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: '',
                stderr: '',
            });
            const images = await listImages('podman');
            expect(images).toEqual([]);
        });

        it('handles malformed podman JSON gracefully', async () => {
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: 'not json at all',
                stderr: '',
            });
            const images = await listImages('podman');
            expect(images).toEqual([]);
        });

        it('handles malformed docker line gracefully', async () => {
            const lines = [
                '{"ID":"sha256:good","Repository":"img","Tag":"v1","CreatedAt":"now","Size":"1MB"}',
                'not json line',
                '{"ID":"sha256:good2","Repository":"img2","Tag":"v2","CreatedAt":"now","Size":"2MB"}',
            ].join('\n');
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: lines,
                stderr: '',
            });
            const images = await listImages('docker');
            expect(images).toHaveLength(2);
        });

        it('skips podman images with <none> tag', async () => {
            const data = JSON.stringify([
                {
                    Id: 'sha256:none-tag',
                    Names: ['myimage:<none>'],
                    CreatedAt: '2026-01-01T00:00:00Z',
                    Size: 0,
                },
            ]);
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: data,
                stderr: '',
            });
            const images = await listImages('podman');
            expect(images).toHaveLength(0);
        });

        it('formats podman image size as human-readable', async () => {
            const data = JSON.stringify([
                {
                    Id: 'sha256:sized',
                    Names: ['img:v1'],
                    CreatedAt: '2026-01-01',
                    Size: 1073741824,
                },
            ]);
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: data,
                stderr: '',
            });
            const images = await listImages('podman');
            expect(images[0].size).toBe('1.0 GB');
        });

        it('handles podman image with Created instead of CreatedAt', async () => {
            const data = JSON.stringify([
                {
                    Id: 'sha256:old-format',
                    Names: ['old:v1'],
                    Created: '2025-01-01T00:00:00Z',
                    Size: 512,
                },
            ]);
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: data,
                stderr: '',
            });
            const images = await listImages('podman');
            expect(images[0].created).toBe('2025-01-01T00:00:00Z');
        });

        it('handles podman image name without colon (no tag)', async () => {
            const data = JSON.stringify([
                {
                    Id: 'sha256:notag',
                    Names: ['localhost/myimage'],
                    CreatedAt: '2026-01-01',
                    Size: 1024,
                },
            ]);
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: data,
                stderr: '',
            });
            const images = await listImages('podman');
            expect(images[0].repository).toBe('localhost/myimage');
            expect(images[0].tag).toBe('latest');
        });

        it('handles podman image size of zero', async () => {
            const data = JSON.stringify([
                { Id: 'sha256:zero', Names: ['zero:v1'], CreatedAt: '2026-01-01', Size: 0 },
            ]);
            mocks.mockRunCommand.mockResolvedValue({
                exitCode: 0,
                stdout: data,
                stderr: '',
            });
            const images = await listImages('podman');
            expect(images[0].size).toBe('0 B');
        });
    });

    describe('runInContainer', () => {
        it('runs introspection script with podman (includes --user=root)', async () => {
            mocks.mockRunCommandArgs.mockResolvedValue({
                exitCode: 0,
                stdout: '{"collections": []}',
                stderr: '',
            });
            const result = await runInContainer('podman', 'ee:latest', '/cache/scripts');
            expect(result).toBe('{"collections": []}');
            expect(mocks.mockRunCommandArgs).toHaveBeenCalledWith(
                'podman',
                expect.arrayContaining(['--user=root', 'ee:latest']),
                { timeout: 120_000 },
            );
        });

        it('runs introspection script with docker (no --user=root)', async () => {
            mocks.mockRunCommandArgs.mockResolvedValue({
                exitCode: 0,
                stdout: '{"python": "/usr/bin/python3"}',
                stderr: '',
            });
            const result = await runInContainer('docker', 'ee:v2', '/tmp/cache');
            expect(result).toBe('{"python": "/usr/bin/python3"}');
            const lastCall = mocks.mockRunCommandArgs.mock.calls.at(-1);
            expect(lastCall).toBeDefined();
            const args = (lastCall as unknown[])[1] as string[];
            expect(args).not.toContain('--user=root');
        });

        it('passes sections argument when provided', async () => {
            mocks.mockRunCommandArgs.mockResolvedValue({
                exitCode: 0,
                stdout: '{}',
                stderr: '',
            });
            await runInContainer('podman', 'ee:v1', '/cache', ['collections', 'python']);
            const lastCall = mocks.mockRunCommandArgs.mock.calls.at(-1);
            expect(lastCall).toBeDefined();
            const args = (lastCall as unknown[])[1] as string[];
            expect(args).toContain('--sections');
            expect(args).toContain('collections');
            expect(args).toContain('python');
        });

        it('throws when introspection fails', async () => {
            mocks.mockRunCommandArgs.mockResolvedValue({
                exitCode: 1,
                stdout: '',
                stderr: 'container not found',
            });
            await expect(runInContainer('podman', 'missing:latest', '/cache')).rejects.toThrow(
                'Introspection failed for missing:latest: container not found',
            );
        });
    });

    describe('getScriptCacheDir', () => {
        it('uses XDG_CACHE_HOME when set', () => {
            const prev = process.env.XDG_CACHE_HOME;
            process.env.XDG_CACHE_HOME = '/custom/cache';
            try {
                expect(getScriptCacheDir()).toBe('/custom/cache/ansible-tools');
            } finally {
                if (prev === undefined) delete process.env.XDG_CACHE_HOME;
                else process.env.XDG_CACHE_HOME = prev;
            }
        });

        it('falls back to ~/.cache when XDG_CACHE_HOME is unset', () => {
            const prev = process.env.XDG_CACHE_HOME;
            delete process.env.XDG_CACHE_HOME;
            try {
                expect(getScriptCacheDir()).toBe(
                    path.join(os.homedir(), '.cache', 'ansible-tools'),
                );
            } finally {
                if (prev !== undefined) process.env.XDG_CACHE_HOME = prev;
            }
        });
    });

    describe('deployScripts', () => {
        let tmpDir: string;
        let dataDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-deploy-'));
            dataDir = path.join(tmpDir, 'data');
            fs.mkdirSync(dataDir);
            fs.writeFileSync(path.join(dataDir, 'image_introspect.py'), '#!/usr/bin/env python3\n');
            fs.writeFileSync(path.join(dataDir, 'python_latest.sh'), '#!/bin/bash\n');
            process.env.XDG_CACHE_HOME = path.join(tmpDir, 'cache');
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            delete process.env.XDG_CACHE_HOME;
        });

        it('copies scripts to cache directory', () => {
            const cacheDir = deployScripts(dataDir);
            expect(fs.existsSync(path.join(cacheDir, 'image_introspect.py'))).toBe(true);
            expect(fs.existsSync(path.join(cacheDir, 'python_latest.sh'))).toBe(true);
        });

        it('makes scripts executable', () => {
            const cacheDir = deployScripts(dataDir);
            const stat = fs.statSync(path.join(cacheDir, 'image_introspect.py'));
            expect(stat.mode & 0o755).toBe(0o755);
        });

        it('does not re-copy when destination is newer', () => {
            const cacheDir = deployScripts(dataDir);

            // Make destination newer than source
            const future = new Date(Date.now() + 100000);
            fs.utimesSync(path.join(cacheDir, 'image_introspect.py'), future, future);
            const beforeSecondDeploy = fs.statSync(
                path.join(cacheDir, 'image_introspect.py'),
            ).mtimeMs;

            deployScripts(dataDir);
            const afterSecondDeploy = fs.statSync(
                path.join(cacheDir, 'image_introspect.py'),
            ).mtimeMs;
            expect(afterSecondDeploy).toBe(beforeSecondDeploy);
        });

        it('re-copies when source is newer than destination', () => {
            deployScripts(dataDir);

            // Update source file
            const future = new Date(Date.now() + 200000);
            fs.utimesSync(path.join(dataDir, 'image_introspect.py'), future, future);

            const cacheDir = deployScripts(dataDir);
            const stat = fs.statSync(path.join(cacheDir, 'image_introspect.py'));
            expect(stat.mode & 0o755).toBe(0o755);
        });
    });
});
