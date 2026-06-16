import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Mock ContainerRuntime ───────────────────────────────────────────

const containerMocks = vi.hoisted(() => ({
    detectEngine: vi.fn(),
    listImages: vi.fn(),
    inspectImage: vi.fn(),
    runInContainer: vi.fn(),
    deployScripts: vi.fn(),
    getScriptCacheDir: vi.fn(),
}));

vi.mock('../../src/ContainerRuntime', () => containerMocks);

// ── Mock EECache (use real implementation with temp dir) ────────────

let tmpCacheDir: string;

vi.mock('../../src/EECache', async () => {
    const actual = await vi.importActual<typeof import('../../src/EECache')>('../../src/EECache');
    return {
        EECache: class extends actual.EECache {
            /** Create a test cache in a temp directory. */
            constructor() {
                tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-svc-test-'));
                super(tmpCacheDir);
            }
        },
    };
});

import { ExecutionEnvService } from '../../src/ExecutionEnvService';
import type { ContainerImage, InspectedImage } from '../../src/ContainerRuntime';

// ── Sample data ─────────────────────────────────────────────────────

const IMG_SUPPORTED: ContainerImage = {
    id: 'sha256:aaa111',
    repository: 'quay.io/ansible/ee-supported',
    tag: 'latest',
    created: '2026-06-01',
    size: '1.2 GB',
    names: ['quay.io/ansible/ee-supported:latest'],
};

const IMG_MINIMAL: ContainerImage = {
    id: 'sha256:bbb222',
    repository: 'quay.io/ansible/ee-minimal',
    tag: 'latest',
    created: '2026-05-15',
    size: '512 MB',
    names: ['quay.io/ansible/ee-minimal:latest'],
};

const IMG_PYTHON: ContainerImage = {
    id: 'sha256:ccc333',
    repository: 'python',
    tag: '3.11',
    created: '2026-01-01',
    size: '200 MB',
    names: ['python:3.11'],
};

const INSPECTED_SUPPORTED: InspectedImage = {
    ...IMG_SUPPORTED,
    executionEnvironment: true,
    inspect: {
        config: { labels: { 'ansible-execution-environment': 'true' }, workingDir: '/runner' },
        architecture: 'amd64',
        os: 'linux',
    },
};

const INSPECTED_MINIMAL: InspectedImage = {
    ...IMG_MINIMAL,
    executionEnvironment: true,
    inspect: {
        config: { labels: { 'ansible-execution-environment': 'true' }, workingDir: '/runner' },
    },
};

const INSPECTED_PYTHON: InspectedImage = {
    ...IMG_PYTHON,
    executionEnvironment: false,
    inspect: {
        config: { labels: {}, workingDir: '/app' },
    },
};

const INTROSPECTION_JSON = JSON.stringify({
    errors: [],
    python_version: { details: { version: '3.11.7' } },
    environment_variables: { details: {} },
    ansible_collections: {
        details: { 'ansible.builtin': '2.19.0', 'community.general': '10.2.0' },
        errors: [],
    },
    ansible_version: { details: 'ansible [core 2.19.0]', errors: [] },
    os_release: {
        details: [{ 'pretty-name': 'RHEL 9.4', name: 'RHEL', version: '9.4' }],
        errors: [],
    },
    python_packages: {
        details: [
            {
                name: 'ansible-core',
                version: '2.19.0',
                summary: 'Ansible',
                license: 'GPL-3.0',
                'home-page': 'https://ansible.com',
                author: 'Ansible',
                'author-email': 'info@ansible.com',
                location: '/usr/lib/python3.11/site-packages',
                requires: ['jinja2', 'PyYAML'],
                'required-by': [],
            },
            {
                name: 'jinja2',
                version: '3.1.4',
                summary: 'Template engine',
                requires: ['MarkupSafe'],
                'required-by': ['ansible-core'],
            },
        ],
        errors: [],
    },
    system_packages: {
        details: [
            {
                name: 'bash',
                version: '5.2.26',
                release: '1.el9',
                architecture: 'x86_64',
                description: 'GNU Bourne Again shell',
                size: '7.5M',
                license: 'GPLv3+',
                url: 'https://www.gnu.org/software/bash',
            },
            {
                name: 'openssl',
                version: '3.2.1',
                release: '2.el9',
                architecture: 'x86_64',
            },
        ],
        errors: [],
    },
    redhat_release: { details: 'Red Hat Enterprise Linux release 9.4', errors: [] },
});

// ── Helpers ─────────────────────────────────────────────────────────

/** Clears the ExecutionEnvService singleton so each test starts fresh. */
function resetSingleton(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ExecutionEnvService as any)._instance = undefined;
}

/** Wire up ContainerRuntime mocks with standard test data. */
function setupDefaultMocks(): void {
    containerMocks.detectEngine.mockResolvedValue('podman');
    containerMocks.listImages.mockResolvedValue([IMG_SUPPORTED, IMG_MINIMAL, IMG_PYTHON]);
    containerMocks.inspectImage
        .mockResolvedValueOnce(INSPECTED_SUPPORTED)
        .mockResolvedValueOnce(INSPECTED_MINIMAL)
        .mockResolvedValueOnce(INSPECTED_PYTHON);
    containerMocks.deployScripts.mockReturnValue('/tmp/scripts');
}

// ── Tests ───────────────────────────────────────────────────────────

describe('ExecutionEnvService', () => {
    beforeEach(() => {
        resetSingleton();
        vi.clearAllMocks();
    });

    afterEach(() => {
        if (tmpCacheDir) {
            try {
                fs.rmSync(tmpCacheDir, { recursive: true, force: true });
            } catch {
                /* */
            }
        }
    });

    it('getInstance returns the same singleton', () => {
        const a = ExecutionEnvService.getInstance();
        const b = ExecutionEnvService.getInstance();
        expect(a).toBe(b);
    });

    it('isInVSCode is false in test environment', () => {
        expect(ExecutionEnvService.getInstance().isInVSCode()).toBe(false);
    });

    describe('loadExecutionEnvironments', () => {
        it('discovers EEs via ContainerRuntime and filters non-EEs', async () => {
            setupDefaultMocks();
            const svc = ExecutionEnvService.getInstance();
            const list = await svc.loadExecutionEnvironments();

            expect(containerMocks.detectEngine).toHaveBeenCalled();
            expect(containerMocks.listImages).toHaveBeenCalledWith('podman');
            expect(containerMocks.inspectImage).toHaveBeenCalledTimes(3);

            expect(list).toHaveLength(2);
            expect(list.map((e) => e.full_name).sort()).toEqual([
                'quay.io/ansible/ee-minimal:latest',
                'quay.io/ansible/ee-supported:latest',
            ]);
            expect(svc.isLoaded()).toBe(true);
        });

        it('handles empty image list', async () => {
            containerMocks.detectEngine.mockResolvedValue('podman');
            containerMocks.listImages.mockResolvedValue([]);

            const svc = ExecutionEnvService.getInstance();
            const list = await svc.loadExecutionEnvironments();
            expect(list).toEqual([]);
            expect(svc.isLoaded()).toBe(true);
        });

        it('throws when no container engine is found', async () => {
            containerMocks.detectEngine.mockResolvedValue(null);

            const svc = ExecutionEnvService.getInstance();
            await expect(svc.loadExecutionEnvironments()).rejects.toThrow(
                /No container engine found/,
            );
        });

        it('concurrent call protection', async () => {
            let release!: () => void;
            const gate = new Promise<void>((r) => {
                release = r;
            });

            containerMocks.detectEngine.mockResolvedValue('podman');
            containerMocks.listImages.mockImplementation(async () => {
                await gate;
                return [IMG_SUPPORTED];
            });
            containerMocks.inspectImage.mockResolvedValue(INSPECTED_SUPPORTED);

            const svc = ExecutionEnvService.getInstance();
            const p1 = svc.loadExecutionEnvironments();
            const p2 = svc.loadExecutionEnvironments();
            release();

            const [r1, r2] = await Promise.all([p1, p2]);
            expect(containerMocks.listImages).toHaveBeenCalledTimes(1);
            expect(r1).toHaveLength(1);
            // p2 shares the same in-flight promise
            expect(r2).toEqual(r1);
        });

        it('returns cached list when already loaded with data', async () => {
            setupDefaultMocks();
            const svc = ExecutionEnvService.getInstance();
            const first = await svc.loadExecutionEnvironments();

            vi.clearAllMocks();
            const second = await svc.loadExecutionEnvironments();
            expect(second).toEqual(first);
            expect(containerMocks.listImages).not.toHaveBeenCalled();
        });
    });

    describe('loadDetails', () => {
        it('runs introspection and caches result', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();

            const details = await svc.loadDetails('quay.io/ansible/ee-supported:latest');

            expect(details).toBeDefined();
            expect(details?.ansible_version?.details).toBe('ansible [core 2.19.0]');
            expect(details?.ansible_collections?.details['ansible.builtin']).toBe('2.19.0');
            expect(details?.os_release?.details[0]['pretty-name']).toBe('RHEL 9.4');
            expect(details?.python_packages?.details).toHaveLength(2);
            expect(details?.system_packages?.details).toMatchObject([
                { name: 'bash', version: '5.2.26', release: '1.el9' },
                { name: 'openssl', version: '3.2.1', release: '2.el9' },
            ]);
            expect(details?.redhat_release?.details).toBe('Red Hat Enterprise Linux release 9.4');
            expect(details?.image_name).toBe('quay.io/ansible/ee-supported:latest');
        });

        it('returns memory-cached details on second call', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            await svc.loadDetails('quay.io/ansible/ee-supported:latest');

            containerMocks.runInContainer.mockClear();
            const again = await svc.loadDetails('quay.io/ansible/ee-supported:latest');
            expect(again).toBeDefined();
            expect(containerMocks.runInContainer).not.toHaveBeenCalled();
        });

        it('returns null when introspection returns empty stdout', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue('');

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const details = await svc.loadDetails('quay.io/ansible/ee-supported:latest');
            expect(details).toBeNull();
        });
    });

    describe('getCollections', () => {
        it('extracts and sorts collections from details', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const cols = await svc.getCollections('quay.io/ansible/ee-supported:latest');
            expect(cols).toEqual([
                { name: 'ansible.builtin', version: '2.19.0' },
                { name: 'community.general', version: '10.2.0' },
            ]);
        });

        it('returns empty when details lack ansible_collections', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(
                JSON.stringify({ errors: [], image_name: 'x' }),
            );

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const cols = await svc.getCollections('quay.io/ansible/ee-supported:latest');
            expect(cols).toEqual([]);
        });
    });

    describe('getPythonPackages', () => {
        it('extracts and sorts packages from details', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const pkgs = await svc.getPythonPackages('quay.io/ansible/ee-supported:latest');
            expect(pkgs).toMatchObject([
                { name: 'ansible-core', version: '2.19.0', summary: 'Ansible' },
                { name: 'jinja2', version: '3.1.4' },
            ]);
        });
    });

    describe('getSystemPackages', () => {
        it('extracts and sorts packages with version-release', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const pkgs = await svc.getSystemPackages('quay.io/ansible/ee-supported:latest');
            expect(pkgs).toEqual([
                { name: 'bash', version: '5.2.26-1.el9' },
                { name: 'openssl', version: '3.2.1-2.el9' },
            ]);
        });

        it('returns version without release suffix when release is empty', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(
                JSON.stringify({
                    errors: [],
                    system_packages: {
                        details: [{ name: 'zlib', version: '1.2.13', release: '' }],
                    },
                }),
            );

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const pkgs = await svc.getSystemPackages('quay.io/ansible/ee-supported:latest');
            expect(pkgs).toEqual([{ name: 'zlib', version: '1.2.13' }]);
        });

        it('filters out entries with empty name', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(
                JSON.stringify({
                    errors: [],
                    system_packages: {
                        details: [
                            { name: 'bash', version: '5.0', release: '1' },
                            { name: '', version: '0.0', release: '' },
                        ],
                    },
                }),
            );

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const pkgs = await svc.getSystemPackages('quay.io/ansible/ee-supported:latest');
            expect(pkgs).toEqual([{ name: 'bash', version: '5.0-1' }]);
        });

        it('returns empty when details lack system_packages', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(
                JSON.stringify({ errors: [], image_name: 'x' }),
            );

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const pkgs = await svc.getSystemPackages('quay.io/ansible/ee-supported:latest');
            expect(pkgs).toEqual([]);
        });
    });

    describe('getInfo', () => {
        it('extracts ansible version, OS, and image name', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const info = await svc.getInfo('quay.io/ansible/ee-supported:latest');
            expect(info.ansible).toBe('ansible [core 2.19.0]');
            expect(info.os).toBe('RHEL 9.4');
            expect(info.image).toBe('quay.io/ansible/ee-supported:latest');
        });

        it('returns only image name when details have no sections', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(JSON.stringify({ errors: [] }));

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const info = await svc.getInfo('quay.io/ansible/ee-supported:latest');
            expect(info).toEqual({ image: 'quay.io/ansible/ee-supported:latest' });
        });
    });

    describe('getExecutionEnvironment', () => {
        it('finds by full_name', async () => {
            setupDefaultMocks();
            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const ee = svc.getExecutionEnvironment('quay.io/ansible/ee-supported:latest');
            expect(ee?.image_id).toBe('sha256:aaa111');
        });
    });

    describe('getPythonPackageDetail', () => {
        it('returns full metadata for a known package (case-insensitive)', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const detail = await svc.getPythonPackageDetail(
                'quay.io/ansible/ee-supported:latest',
                'Ansible-Core',
            );

            expect(detail).toMatchObject({
                name: 'ansible-core',
                version: '2.19.0',
                summary: 'Ansible',
                license: 'GPL-3.0',
                homepage: 'https://ansible.com',
                author: 'Ansible',
                requires: ['jinja2', 'PyYAML'],
                requiredBy: [],
                location: '/usr/lib/python3.11/site-packages',
            });
        });

        it('returns undefined for an unknown package', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const detail = await svc.getPythonPackageDetail(
                'quay.io/ansible/ee-supported:latest',
                'nonexistent-pkg',
            );
            expect(detail).toBeUndefined();
        });

        it('returns undefined when python_packages section is missing', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(
                JSON.stringify({ errors: [], image_name: 'x' }),
            );

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const detail = await svc.getPythonPackageDetail(
                'quay.io/ansible/ee-supported:latest',
                'ansible-core',
            );
            expect(detail).toBeUndefined();
        });

        it('defaults optional fields to empty strings/arrays', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const detail = await svc.getPythonPackageDetail(
                'quay.io/ansible/ee-supported:latest',
                'jinja2',
            );

            expect(detail).toMatchObject({
                name: 'jinja2',
                license: '',
                homepage: '',
                author: '',
                location: '',
            });
        });
    });

    describe('getSystemPackageDetail', () => {
        it('returns full metadata for a known package (case-insensitive)', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const detail = await svc.getSystemPackageDetail(
                'quay.io/ansible/ee-supported:latest',
                'BASH',
            );

            expect(detail).toMatchObject({
                name: 'bash',
                version: '5.2.26',
                release: '1.el9',
                arch: 'x86_64',
                description: 'GNU Bourne Again shell',
                size: '7.5M',
                license: 'GPLv3+',
                url: 'https://www.gnu.org/software/bash',
            });
        });

        it('returns undefined for an unknown package', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const detail = await svc.getSystemPackageDetail(
                'quay.io/ansible/ee-supported:latest',
                'nonexistent-pkg',
            );
            expect(detail).toBeUndefined();
        });

        it('returns undefined when system_packages section is missing', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(
                JSON.stringify({ errors: [], image_name: 'x' }),
            );

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const detail = await svc.getSystemPackageDetail(
                'quay.io/ansible/ee-supported:latest',
                'bash',
            );
            expect(detail).toBeUndefined();
        });

        it('defaults optional fields to empty strings', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            const detail = await svc.getSystemPackageDetail(
                'quay.io/ansible/ee-supported:latest',
                'openssl',
            );

            expect(detail).toMatchObject({
                name: 'openssl',
                description: '',
                size: '',
                license: '',
                url: '',
            });
        });
    });

    describe('refresh', () => {
        it('clears environments and caches', async () => {
            setupDefaultMocks();
            containerMocks.runInContainer.mockResolvedValue(INTROSPECTION_JSON);

            const svc = ExecutionEnvService.getInstance();
            await svc.loadExecutionEnvironments();
            await svc.loadDetails('quay.io/ansible/ee-supported:latest');

            expect(svc.getExecutionEnvironments().length).toBeGreaterThan(0);
            expect(svc.getCachedDetails('quay.io/ansible/ee-supported:latest')).toBeDefined();

            await svc.refresh();
            expect(svc.getExecutionEnvironments()).toEqual([]);
            expect(svc.getCachedDetails('quay.io/ansible/ee-supported:latest')).toBeUndefined();
            expect(svc.isLoaded()).toBe(false);
        });
    });
});
