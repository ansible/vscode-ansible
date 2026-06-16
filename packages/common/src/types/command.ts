/**
 * Types for command execution.
 */

/** Async function that resolves the active Python environment's bin directory. */
export type BinDirResolver = (workspaceUri?: unknown) => Promise<string | null>;

/** Options passed to CommandService execution methods. */
export interface CommandOptions {
    /** Working directory for the command */
    cwd?: string;
    /** Maximum buffer size for output */
    maxBuffer?: number;
    /** Additional environment variables */
    env?: Record<string, string>;
    /** Timeout in milliseconds */
    timeout?: number;
}

/** Result of running an external command. */
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
