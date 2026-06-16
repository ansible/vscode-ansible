import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
    const mockRunCommand = vi.fn();
    return {
        mockRunCommand,
        getCommandService: vi.fn(() => ({
            runCommand: mockRunCommand,
        })),
    };
});

vi.mock('../../src/CommandService', () => ({
    getCommandService: mocks.getCommandService,
}));

import { detectEngine, listImages, inspectImage, classifyEE } from '../../src/ContainerRuntime';

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
});
