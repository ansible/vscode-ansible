import type * as vscode from 'vscode';

/**
 * Shared environment data consumed by status bar items and future telemetry.
 * Ansible fields come from LS metadata; Python fields come from the
 * PythonEnvironmentService cache. Fields may be undefined until data
 * is available.
 */
export interface AnsibleEnvironmentInfo {
    /** Ansible core version string (e.g., "2.17.0"). */
    ansibleVersion?: string;
    /** Python interpreter version (e.g., "3.12.5"). */
    pythonVersion?: string;
    /** ansible-lint version, undefined when not installed. */
    ansibleLintVersion?: string;
    /** Whether an Execution Environment is active. */
    executionEnvironmentEnabled?: boolean;
    /** Human-readable Python environment name (e.g., "Python 3.12 (.venv)"). */
    pythonEnvDisplayName?: string;
    /** Filesystem path to the Python executable. */
    pythonEnvPath?: string;
}

/**
 * Check whether the active text editor contains an Ansible document.
 * @param editor - The text editor to inspect, or undefined if none is active.
 * @returns True when the editor's document language is 'ansible'.
 */
export function isAnsibleEditor(editor?: vscode.TextEditor): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety for edge cases
    return editor?.document?.languageId === 'ansible';
}
