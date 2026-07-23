/**
 * ToxAnsibleService
 *
 * Discovers and runs tox-ansible test environments via the tox CLI.
 * Uses CommandService for venv-aware execution (ADR-005 invariant 7).
 *
 * Discovery uses `tox list --ansible --gh-matrix` for structured JSON
 * output with pre-split factors, falling back to `--no-desc` text
 * parsing when --gh-matrix is unavailable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { log } from '@ansible/common';
import type {
    ToxEnvironment,
    ToxTestCategory,
    ToxRunResult,
    ToxAvailability,
    ToxGhMatrixEntry,
} from '@ansible/common';
import { CommandService } from './CommandService';

const KNOWN_CATEGORIES = new Set<string>(['integration', 'sanity', 'unit']);
const TOX_LIST_TIMEOUT_MS = 30_000;
const TOX_RUN_DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

const CONFIG_FILE_CANDIDATES = ['tox-ansible.ini', 'tox.ini'] as const;

/**
 * Match tox-ansible environment names in category-first format.
 * Example: "integration-py3.12-devel" or "integration-py3.12-2.17"
 * Captures only the ansible version factor (first segment after python),
 * not scenario suffixes like "-default".
 */
const CATEGORY_FIRST_PATTERN = /^(integration|sanity|unit)-py(\d+\.\d+)-(\d+\.\d+|devel)(?:-.+)?$/;

/**
 * Match tox-ansible environment names in python-first format.
 * Example: "py312-2.17-integration-default"
 */
const PYTHON_FIRST_PATTERN = /^py(\d)(\d+)-(\d+\.\d+|devel)-(integration|sanity|unit)(?:-(.+))?$/;

/**
 * Parse an environment name into category, python version, and ansible version.
 * Tries multiple patterns and falls back to 'unknown' category.
 * @param name - Full tox environment name to parse
 * @returns Parsed components: category, pythonVersion, ansibleVersion
 */
export function parseToxEnvironmentName(name: string): {
    category: ToxTestCategory;
    pythonVersion: string;
    ansibleVersion: string;
} {
    const catFirst = CATEGORY_FIRST_PATTERN.exec(name);
    if (catFirst) {
        return {
            category: catFirst[1] as ToxTestCategory,
            pythonVersion: catFirst[2],
            ansibleVersion: catFirst[3],
        };
    }

    const pyFirst = PYTHON_FIRST_PATTERN.exec(name);
    if (pyFirst) {
        return {
            category: pyFirst[4] as ToxTestCategory,
            pythonVersion: `${pyFirst[1]}.${pyFirst[2]}`,
            ansibleVersion: pyFirst[3],
        };
    }

    return { category: 'unknown', pythonVersion: '', ansibleVersion: '' };
}

/**
 * Parse --gh-matrix JSON into ToxEnvironment[].
 * Extracts category from the factors array.
 * @param json - Raw JSON string from tox --gh-matrix output
 * @returns Parsed tox environments, empty array on invalid input
 */
export function parseGhMatrixJson(json: string): ToxEnvironment[] {
    let entries: ToxGhMatrixEntry[];
    try {
        entries = JSON.parse(json) as ToxGhMatrixEntry[];
    } catch {
        log('ToxAnsibleService: failed to parse --gh-matrix JSON');
        return [];
    }

    if (!Array.isArray(entries)) {
        log('ToxAnsibleService: --gh-matrix output is not an array');
        return [];
    }

    return entries
        .filter((entry) => entry.name && Array.isArray(entry.factors))
        .map((entry) => {
            const categoryFactor = entry.factors.find((f) => KNOWN_CATEGORIES.has(f));
            const ansibleFactor = entry.factors.find(
                (f) => !KNOWN_CATEGORIES.has(f) && !f.startsWith('py'),
            );

            return {
                name: entry.name,
                category: (categoryFactor as ToxTestCategory | undefined) ?? 'unknown',
                pythonVersion: entry.python,
                ansibleVersion: ansibleFactor ?? '',
                description: entry.description,
            };
        });
}

/**
 * Parse `tox list --ansible --no-desc` plain-text output into ToxEnvironment[].
 * One environment name per line, blank lines and header lines skipped.
 * @param stdout - Raw stdout from tox list command
 * @returns Parsed tox environments
 */
export function parseNoDescOutput(stdout: string): ToxEnvironment[] {
    return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('default') && !line.includes(':'))
        .map((name) => {
            const parsed = parseToxEnvironmentName(name);
            return { name, ...parsed };
        });
}

/**
 * Discovers and runs tox-ansible test environments via the tox CLI.
 */
export class ToxAnsibleService {
    private readonly _cmd: CommandService;

    /**
     * @param cmd - CommandService instance for venv-aware execution
     */
    constructor(cmd?: CommandService) {
        this._cmd = cmd ?? CommandService.getInstance();
    }

    /**
     * Check whether tox and the tox-ansible plugin are available.
     * @returns Availability status with tox and plugin detection
     */
    async checkAvailability(): Promise<ToxAvailability> {
        const toxPath = await this._cmd.getToolPath('tox');
        if (!toxPath) {
            return { toxInstalled: false, toxAnsibleInstalled: false };
        }

        const result = await this._cmd.runCommandArgs(toxPath, ['--version'], {
            timeout: TOX_LIST_TIMEOUT_MS,
        });

        if (result.exitCode !== 0) {
            return { toxInstalled: false, toxAnsibleInstalled: false };
        }

        const versionOutput = result.stdout;
        const toxAnsibleInstalled = versionOutput.includes('tox-ansible');
        const versionMatch = /^(\S+)/.exec(versionOutput);

        return {
            toxInstalled: true,
            toxAnsibleInstalled,
            toxVersion: versionMatch?.[1],
        };
    }

    /**
     * Auto-detect the tox config file in the workspace directory.
     * Priority: tox-ansible.ini > tox.ini (pyproject.toml handled by tox natively).
     * @param workspaceDir - Absolute path to the workspace root
     * @returns Absolute path to the detected config file, or undefined
     */
    detectConfigFile(workspaceDir: string): string | undefined {
        for (const candidate of CONFIG_FILE_CANDIDATES) {
            const filePath = path.join(workspaceDir, candidate);
            if (fs.existsSync(filePath)) {
                log(`ToxAnsibleService: detected config ${candidate}`);
                return filePath;
            }
        }

        const pyproject = path.join(workspaceDir, 'pyproject.toml');
        if (fs.existsSync(pyproject)) {
            log('ToxAnsibleService: pyproject.toml found (tox handles natively)');
            return undefined;
        }

        log('ToxAnsibleService: no tox config file found');
        return undefined;
    }

    /**
     * Discover all tox-ansible environments in the workspace.
     *
     * Strategy (per D1 review decision):
     * 1. Try `--gh-matrix` for structured JSON with pre-split factors
     * 2. Fall back to `--no-desc` text parsing
     * @param workspaceDir - Absolute path to the workspace root
     * @returns Discovered tox environments, empty array on failure
     */
    async listEnvironments(workspaceDir: string): Promise<ToxEnvironment[]> {
        const toxPath = await this._cmd.getToolPath('tox');
        if (!toxPath) {
            log('ToxAnsibleService: tox not found');
            return [];
        }

        const baseArgs = ['list', '--ansible'];
        const configFile = this.detectConfigFile(workspaceDir);
        if (configFile && !configFile.endsWith('pyproject.toml')) {
            baseArgs.push('--conf', configFile);
        }

        // Try --gh-matrix first (structured JSON)
        const ghMatrixResult = await this._cmd.runCommandArgs(
            toxPath,
            [...baseArgs, '--gh-matrix'],
            { cwd: workspaceDir, timeout: TOX_LIST_TIMEOUT_MS },
        );

        if (ghMatrixResult.exitCode === 0 && ghMatrixResult.stdout.trim().startsWith('[')) {
            const envs = parseGhMatrixJson(ghMatrixResult.stdout);
            if (envs.length > 0) {
                log(`ToxAnsibleService: discovered ${String(envs.length)} envs via --gh-matrix`);
                return envs;
            }
        }

        // Fall back to --no-desc text parsing
        const noDescResult = await this._cmd.runCommandArgs(toxPath, [...baseArgs, '--no-desc'], {
            cwd: workspaceDir,
            timeout: TOX_LIST_TIMEOUT_MS,
        });

        if (noDescResult.exitCode !== 0) {
            log(
                `ToxAnsibleService: tox list failed (exit ${String(noDescResult.exitCode)}): ${noDescResult.stderr}`,
            );
            return [];
        }

        const envs = parseNoDescOutput(noDescResult.stdout);
        log(`ToxAnsibleService: discovered ${String(envs.length)} envs via --no-desc`);
        return envs;
    }

    /**
     * Run a single tox-ansible environment and capture the result.
     * The signal is forwarded to the child process so the tox run is
     * actually killed when the user clicks "Stop" in Test Explorer.
     * @param envName - Tox environment name to run
     * @param workspaceDir - Absolute path to the workspace root
     * @param timeoutMs - Maximum execution time in milliseconds
     * @param signal - AbortSignal to kill the tox child process on cancellation
     * @returns Run result with exit code, output, and duration
     */
    async runEnvironment(
        envName: string,
        workspaceDir: string,
        timeoutMs: number = TOX_RUN_DEFAULT_TIMEOUT_MS,
        signal?: AbortSignal,
    ): Promise<ToxRunResult> {
        const toxPath = await this._cmd.getToolPath('tox');
        if (!toxPath) {
            return {
                environment: envName,
                success: false,
                exitCode: 1,
                stdout: '',
                stderr: 'tox not found. Install ansible-dev-tools first.',
                durationMs: 0,
            };
        }

        const args = ['-e', envName, '--ansible'];
        const configFile = this.detectConfigFile(workspaceDir);
        if (configFile && !configFile.endsWith('pyproject.toml')) {
            args.push('--conf', configFile);
        }

        const start = Date.now();

        if (signal?.aborted) {
            return {
                environment: envName,
                success: false,
                exitCode: 1,
                stdout: '',
                stderr: 'Cancelled',
                durationMs: 0,
            };
        }

        const r = await this._cmd.runCommandArgs(
            toxPath,
            args,
            { cwd: workspaceDir, timeout: timeoutMs },
            signal,
        );

        const durationMs = Date.now() - start;
        const abortedDuringExec = signal?.aborted && r.exitCode !== 0;

        return {
            environment: envName,
            success: !abortedDuringExec && r.exitCode === 0,
            exitCode: r.exitCode,
            stdout: abortedDuringExec ? '' : r.stdout,
            stderr: abortedDuringExec ? 'Cancelled by user' : r.stderr,
            durationMs,
            timedOut: !abortedDuringExec && r.exitCode !== 0 && durationMs >= timeoutMs,
        };
    }

    /**
     * Run multiple tox-ansible environments sequentially, reporting progress.
     * Stops early if the signal is aborted between environments.
     * @param envNames - List of environment names to run
     * @param workspaceDir - Absolute path to the workspace root
     * @param onProgress - Optional callback for progress updates
     * @param timeoutMs - Maximum execution time per environment in milliseconds
     * @param signal - AbortSignal to cancel remaining runs
     * @returns Array of run results in execution order
     */
    async runEnvironments(
        envNames: string[],
        workspaceDir: string,
        onProgress?: (env: string, state: 'started' | 'passed' | 'failed') => void,
        timeoutMs?: number,
        signal?: AbortSignal,
    ): Promise<ToxRunResult[]> {
        const results: ToxRunResult[] = [];

        for (const envName of envNames) {
            if (signal?.aborted) break;
            onProgress?.(envName, 'started');
            const result = await this.runEnvironment(envName, workspaceDir, timeoutMs, signal);
            onProgress?.(envName, result.success ? 'passed' : 'failed');
            results.push(result);
        }

        return results;
    }
}
