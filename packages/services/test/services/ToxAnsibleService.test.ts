import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    parseToxEnvironmentName,
    parseGhMatrixJson,
    parseNoDescOutput,
    ToxAnsibleService,
} from '../../src/ToxAnsibleService';
import type { ExecResult } from '@ansible/common';

// ---------------------------------------------------------------------------
// Mock CommandService at module level (ESM-safe pattern used throughout repo)
// ---------------------------------------------------------------------------

const getToolPathMock = vi.hoisted(() => vi.fn());
const runCommandArgsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/CommandService', () => ({
    CommandService: {
        getInstance: () => ({
            getToolPath: getToolPathMock,
            runCommandArgs: runCommandArgsMock,
        }),
    },
}));

// ---------------------------------------------------------------------------
// Pure parser tests — no mocking needed
// ---------------------------------------------------------------------------

describe('parseToxEnvironmentName', () => {
    it('parses category-first format', () => {
        expect(parseToxEnvironmentName('integration-py3.12-devel')).toEqual({
            category: 'integration',
            pythonVersion: '3.12',
            ansibleVersion: 'devel',
        });
    });

    it('parses sanity env', () => {
        expect(parseToxEnvironmentName('sanity-py3.11-2.17')).toEqual({
            category: 'sanity',
            pythonVersion: '3.11',
            ansibleVersion: '2.17',
        });
    });

    it('parses unit env', () => {
        expect(parseToxEnvironmentName('unit-py3.13-2.19')).toEqual({
            category: 'unit',
            pythonVersion: '3.13',
            ansibleVersion: '2.19',
        });
    });

    it('parses python-first format', () => {
        expect(parseToxEnvironmentName('py312-2.17-integration-default')).toEqual({
            category: 'integration',
            pythonVersion: '3.12',
            ansibleVersion: '2.17',
        });
    });

    it('parses python-first format without scenario', () => {
        expect(parseToxEnvironmentName('py311-devel-unit')).toEqual({
            category: 'unit',
            pythonVersion: '3.11',
            ansibleVersion: 'devel',
        });
    });

    it('returns unknown for unrecognized format', () => {
        expect(parseToxEnvironmentName('custom-env-name')).toEqual({
            category: 'unknown',
            pythonVersion: '',
            ansibleVersion: '',
        });
    });

    it('returns unknown for empty string', () => {
        expect(parseToxEnvironmentName('')).toEqual({
            category: 'unknown',
            pythonVersion: '',
            ansibleVersion: '',
        });
    });
});

describe('parseGhMatrixJson', () => {
    it('parses valid --gh-matrix output', () => {
        const json = JSON.stringify([
            {
                name: 'integration-py3.12-devel',
                description: 'Integration tests using devel',
                factors: ['integration', 'py3.12', 'devel'],
                python: '3.12',
            },
            {
                name: 'unit-py3.11-2.17',
                description: 'Unit tests using 2.17',
                factors: ['unit', 'py3.11', '2.17'],
                python: '3.11',
            },
        ]);

        const result = parseGhMatrixJson(json);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: 'integration-py3.12-devel',
            category: 'integration',
            pythonVersion: '3.12',
            ansibleVersion: 'devel',
            description: 'Integration tests using devel',
        });
        expect(result[1]).toEqual({
            name: 'unit-py3.11-2.17',
            category: 'unit',
            pythonVersion: '3.11',
            ansibleVersion: '2.17',
            description: 'Unit tests using 2.17',
        });
    });

    it('returns empty array for invalid JSON', () => {
        expect(parseGhMatrixJson('not json')).toEqual([]);
    });

    it('returns empty array for non-array JSON', () => {
        expect(parseGhMatrixJson('{"key": "value"}')).toEqual([]);
    });

    it('handles entries with no known category factor', () => {
        const json = JSON.stringify([
            {
                name: 'custom-env',
                description: 'Custom',
                factors: ['custom', 'py3.12'],
                python: '3.12',
            },
        ]);

        const result = parseGhMatrixJson(json);
        expect(result[0].category).toBe('unknown');
    });
});

describe('parseNoDescOutput', () => {
    it('parses multi-line output', () => {
        const stdout = [
            'integration-py3.11-2.17',
            'integration-py3.12-devel',
            'sanity-py3.12-devel',
            'unit-py3.11-2.17',
        ].join('\n');

        const result = parseNoDescOutput(stdout);
        expect(result).toHaveLength(4);
        expect(result[0].name).toBe('integration-py3.11-2.17');
        expect(result[0].category).toBe('integration');
        expect(result[3].name).toBe('unit-py3.11-2.17');
        expect(result[3].category).toBe('unit');
    });

    it('skips blank lines', () => {
        const stdout = '\nintegration-py3.12-devel\n\nunit-py3.11-2.17\n';
        const result = parseNoDescOutput(stdout);
        expect(result).toHaveLength(2);
    });

    it('skips header lines', () => {
        const stdout = 'default environments:\nintegration-py3.12-devel\n';
        const result = parseNoDescOutput(stdout);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('integration-py3.12-devel');
    });

    it('returns empty array for empty output', () => {
        expect(parseNoDescOutput('')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// ToxAnsibleService tests — use module-level CommandService mock + real tmpdir
// ---------------------------------------------------------------------------

/**
 * Create a mock ExecResult with optional overrides.
 * @param overrides - Fields to override on the default result
 * @returns ExecResult with defaults merged
 */
function makeResult(overrides: Partial<ExecResult> = {}): ExecResult {
    return { stdout: '', stderr: '', exitCode: 0, ...overrides };
}

describe('ToxAnsibleService', () => {
    let service: ToxAnsibleService;
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tox-test-'));
        getToolPathMock.mockReset();
        runCommandArgsMock.mockReset();
        getToolPathMock.mockResolvedValue('/usr/bin/tox');
        runCommandArgsMock.mockResolvedValue(makeResult());
        service = new ToxAnsibleService();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('checkAvailability', () => {
        it('returns toxInstalled=false when tox not in PATH', async () => {
            getToolPathMock.mockResolvedValue(null);

            const result = await service.checkAvailability();
            expect(result.toxInstalled).toBe(false);
            expect(result.toxAnsibleInstalled).toBe(false);
        });

        it('detects tox without tox-ansible plugin', async () => {
            runCommandArgsMock.mockResolvedValue(
                makeResult({ stdout: '4.21.0 from /usr/lib/python' }),
            );

            const result = await service.checkAvailability();
            expect(result.toxInstalled).toBe(true);
            expect(result.toxAnsibleInstalled).toBe(false);
            expect(result.toxVersion).toBe('4.21.0');
        });

        it('detects tox with tox-ansible plugin', async () => {
            runCommandArgsMock.mockResolvedValue(
                makeResult({
                    stdout: '4.21.0 from /usr/lib/python\ntox-ansible-26.3.0',
                }),
            );

            const result = await service.checkAvailability();
            expect(result.toxInstalled).toBe(true);
            expect(result.toxAnsibleInstalled).toBe(true);
        });

        it('returns toxInstalled=false when --version fails', async () => {
            runCommandArgsMock.mockResolvedValue(makeResult({ exitCode: 1, stderr: 'error' }));

            const result = await service.checkAvailability();
            expect(result.toxInstalled).toBe(false);
        });
    });

    describe('detectConfigFile', () => {
        it('returns tox-ansible.ini when it exists', () => {
            fs.writeFileSync(path.join(tmpDir, 'tox-ansible.ini'), '');

            const result = service.detectConfigFile(tmpDir);
            expect(result).toBe(path.join(tmpDir, 'tox-ansible.ini'));
        });

        it('prefers tox-ansible.ini over tox.ini', () => {
            fs.writeFileSync(path.join(tmpDir, 'tox-ansible.ini'), '');
            fs.writeFileSync(path.join(tmpDir, 'tox.ini'), '');

            const result = service.detectConfigFile(tmpDir);
            expect(result).toBe(path.join(tmpDir, 'tox-ansible.ini'));
        });

        it('returns tox.ini when tox-ansible.ini absent', () => {
            fs.writeFileSync(path.join(tmpDir, 'tox.ini'), '');

            const result = service.detectConfigFile(tmpDir);
            expect(result).toBe(path.join(tmpDir, 'tox.ini'));
        });

        it('returns undefined when no config files exist', () => {
            const result = service.detectConfigFile(tmpDir);
            expect(result).toBeUndefined();
        });

        it('returns undefined for pyproject.toml (tox handles natively)', () => {
            fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '');

            const result = service.detectConfigFile(tmpDir);
            expect(result).toBeUndefined();
        });
    });

    describe('listEnvironments', () => {
        it('uses --gh-matrix when available', async () => {
            const ghMatrixOutput = JSON.stringify([
                {
                    name: 'unit-py3.12-devel',
                    description: 'Unit tests',
                    factors: ['unit', 'py3.12', 'devel'],
                    python: '3.12',
                },
            ]);

            runCommandArgsMock.mockResolvedValue(makeResult({ stdout: ghMatrixOutput }));

            const envs = await service.listEnvironments(tmpDir);
            expect(envs).toHaveLength(1);
            expect(envs[0].name).toBe('unit-py3.12-devel');
            expect(envs[0].category).toBe('unit');
            expect(envs[0].description).toBe('Unit tests');
        });

        it('falls back to --no-desc when --gh-matrix fails', async () => {
            runCommandArgsMock
                .mockResolvedValueOnce(makeResult({ exitCode: 1, stderr: 'unknown flag' }))
                .mockResolvedValueOnce(
                    makeResult({ stdout: 'integration-py3.11-2.17\nunit-py3.12-devel' }),
                );

            const envs = await service.listEnvironments(tmpDir);
            expect(envs).toHaveLength(2);
            expect(envs[0].name).toBe('integration-py3.11-2.17');
        });

        it('returns empty when tox not found', async () => {
            getToolPathMock.mockResolvedValue(null);

            const envs = await service.listEnvironments(tmpDir);
            expect(envs).toEqual([]);
        });

        it('passes --conf when tox-ansible.ini exists', async () => {
            fs.writeFileSync(path.join(tmpDir, 'tox-ansible.ini'), '');
            runCommandArgsMock.mockResolvedValue(makeResult({ stdout: '[]' }));

            await service.listEnvironments(tmpDir);

            const firstCallArgs = runCommandArgsMock.mock.calls[0] as [string, string[]];
            expect(firstCallArgs[1]).toContain('--conf');
        });

        it('does not pass --conf for pyproject.toml', async () => {
            fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '');
            runCommandArgsMock.mockResolvedValue(makeResult({ stdout: '[]' }));

            await service.listEnvironments(tmpDir);

            const firstCallArgs = runCommandArgsMock.mock.calls[0] as [string, string[]];
            expect(firstCallArgs[1]).not.toContain('--conf');
        });
    });

    describe('runEnvironment', () => {
        it('returns success result on exit code 0', async () => {
            runCommandArgsMock.mockResolvedValue(makeResult({ stdout: 'PASSED', stderr: '' }));

            const result = await service.runEnvironment('unit-py3.12-devel', tmpDir);
            expect(result.success).toBe(true);
            expect(result.exitCode).toBe(0);
            expect(result.environment).toBe('unit-py3.12-devel');
            expect(result.stdout).toBe('PASSED');
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
        });

        it('returns failure result on non-zero exit code', async () => {
            runCommandArgsMock.mockResolvedValue(
                makeResult({ exitCode: 1, stdout: '', stderr: 'FAILED' }),
            );

            const result = await service.runEnvironment('unit-py3.12-devel', tmpDir);
            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe('FAILED');
        });

        it('returns failure when tox not found', async () => {
            getToolPathMock.mockResolvedValue(null);

            const result = await service.runEnvironment('unit-py3.12-devel', tmpDir);
            expect(result.success).toBe(false);
            expect(result.stderr).toContain('tox not found');
        });

        it('passes --ansible and -e flags', async () => {
            await service.runEnvironment('unit-py3.12-devel', tmpDir);

            const callArgs = runCommandArgsMock.mock.calls[0] as [string, string[]];
            expect(callArgs[1]).toContain('--ansible');
            expect(callArgs[1]).toContain('-e');
            expect(callArgs[1]).toContain('unit-py3.12-devel');
        });
    });

    describe('runEnvironments', () => {
        it('runs multiple environments sequentially', async () => {
            runCommandArgsMock
                .mockResolvedValueOnce(makeResult({ stdout: 'PASS1' }))
                .mockResolvedValueOnce(makeResult({ exitCode: 1, stderr: 'FAIL2' }));

            const results = await service.runEnvironments(
                ['unit-py3.12-devel', 'sanity-py3.12-devel'],
                tmpDir,
            );

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(false);
        });

        it('calls progress callback', async () => {
            runCommandArgsMock.mockResolvedValue(makeResult());

            const progress = vi.fn();
            await service.runEnvironments(['unit-py3.12-devel'], tmpDir, progress);

            expect(progress).toHaveBeenCalledWith('unit-py3.12-devel', 'started');
            expect(progress).toHaveBeenCalledWith('unit-py3.12-devel', 'passed');
        });
    });
});
