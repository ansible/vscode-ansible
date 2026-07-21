/**
 * Types for tox-ansible integration.
 *
 * Browser-safe — no Node.js dependencies.
 */

/** Test category derived from tox-ansible environment name factors. */
export type ToxTestCategory = 'integration' | 'sanity' | 'unit' | 'unknown';

/** A single tox-ansible test environment. */
export interface ToxEnvironment {
    /** Full environment name, e.g. "integration-py3.12-devel" */
    name: string;
    /** Test category extracted from name factors */
    category: ToxTestCategory;
    /** Python version factor, e.g. "3.12" */
    pythonVersion: string;
    /** Ansible version factor, e.g. "2.17", "devel" */
    ansibleVersion: string;
    /** Human-readable description from tox list output */
    description?: string;
}

/** Result of running a single tox environment. */
export interface ToxRunResult {
    /** Environment that was run */
    environment: string;
    /** Whether the run succeeded (exit code 0) */
    success: boolean;
    /** Exit code from the tox process */
    exitCode: number;
    /** Captured stdout */
    stdout: string;
    /** Captured stderr */
    stderr: string;
    /** Duration in milliseconds */
    durationMs: number;
}

/** Availability check result for tox and tox-ansible. */
export interface ToxAvailability {
    /** Whether tox is installed in the environment */
    toxInstalled: boolean;
    /** Whether the tox-ansible plugin is loaded */
    toxAnsibleInstalled: boolean;
    /** tox version string when available */
    toxVersion?: string;
}

/** --gh-matrix JSON entry from tox-ansible. */
export interface ToxGhMatrixEntry {
    /** Environment name, e.g. "integration-py3.12-devel" */
    name: string;
    /** Human-readable description */
    description: string;
    /** Factor list, e.g. ["integration", "py3.12", "devel"] */
    factors: string[];
    /** Python version, e.g. "3.12" */
    python: string;
}
