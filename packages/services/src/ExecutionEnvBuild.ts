/**
 * Helpers for building Ansible execution environments with ansible-builder.
 */

import * as path from 'path';

/** Accepted basenames for execution environment definition files. */
export const EE_DEFINITION_BASENAMES = new Set([
    'execution-environment.yml',
    'execution-environment.yaml',
]);

/** Options for planning an ansible-builder build. */
export interface AnsibleBuilderBuildOptions {
    /** Absolute or relative path to the EE definition file. */
    filePath: string;
    /** Optional image tag passed to `--tag`. */
    tag?: string;
    /** Optional build context directory (defaults to `<definition-dir>/context`). */
    contextDir?: string;
}

/** Resolved ansible-builder invocation for a definition file. */
export interface AnsibleBuilderBuildPlan {
    /** Working directory (directory containing the definition file). */
    cwd: string;
    /** Absolute path to the definition file. */
    filePath: string;
    /** Absolute path to the build context directory. */
    contextDir: string;
    /** Arguments after the executable name (e.g. `build --file ...`). */
    args: string[];
}

/**
 * Returns true when the path basename is an execution-environment definition.
 *
 * @param filePath - Path to check
 * @returns Whether the file is a recognized EE definition
 */
export function isExecutionEnvironmentDefinition(filePath: string): boolean {
    return EE_DEFINITION_BASENAMES.has(path.basename(filePath));
}

/**
 * Quote a value for safe inclusion in a POSIX shell command.
 *
 * @param value - Raw argument value
 * @returns Shell-safe quoted string
 */
export function shellQuote(value: string): string {
    if (value === '') {
        return "''";
    }
    if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the ansible-builder argument list and paths for a definition file.
 *
 * Mirrors the legacy `main` branch command shape:
 * `ansible-builder build -f <file> -c <dir>/context`
 *
 * @param options - Definition path and optional tag/context overrides
 * @returns Resolved cwd, paths, and CLI args
 */
export function planAnsibleBuilderBuild(
    options: AnsibleBuilderBuildOptions,
): AnsibleBuilderBuildPlan {
    const filePath = path.resolve(options.filePath);
    const cwd = path.dirname(filePath);
    const contextDir = options.contextDir
        ? path.resolve(options.contextDir)
        : path.join(cwd, 'context');

    const args = ['build', '-f', filePath, '-c', contextDir];
    if (options.tag) {
        args.push('--tag', options.tag);
    }

    return { cwd, filePath, contextDir, args };
}

/**
 * Format a shell command string for the integrated terminal.
 *
 * @param plan - Build plan from {@link planAnsibleBuilderBuild}
 * @param toolExecutable - Executable name or absolute path (default: ansible-builder)
 * @returns Quoted shell command
 */
export function formatAnsibleBuilderShellCommand(
    plan: AnsibleBuilderBuildPlan,
    toolExecutable = 'ansible-builder',
): string {
    return [toolExecutable, ...plan.args.map(shellQuote)].join(' ');
}
