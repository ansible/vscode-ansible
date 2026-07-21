/**
 * Command Service
 *
 * Centralized service for running commands with the correct Python environment.
 * Ensures all commands use the workspace's venv when available.
 *
 * In VS Code, the extension injects a bin dir resolver via setBinDirResolver()
 * that delegates to PythonEnvironmentService. In standalone mode (MCP server),
 * the service falls back to the environment cache and PATH.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

// Conditional vscode import — only used for workspace folder resolution
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running standalone (MCP server)
}

import { getCachedBinDir, getCachedToolPath, findExecutableWithCache } from './EnvironmentCache';
import { log } from '@ansible/common';
import type { BinDirResolver, CommandOptions, ExecResult } from '@ansible/common';

const execAsync = promisify(cp.exec);
const execFileAsync = promisify(cp.execFile);

/**
 * CommandService - singleton for running commands with venv awareness
 */
export class CommandService {
    private static _instance: CommandService | undefined;
    private _binDirResolver: BinDirResolver | undefined;

    /**
     * Private constructor for singleton access via getInstance().
     */
    private constructor() {
        // singleton
    }

    /**
     * Returns the shared CommandService instance.
     *
     * @returns Singleton service for venv-aware command execution.
     */
    public static getInstance(): CommandService {
        CommandService._instance ??= new CommandService();
        return CommandService._instance;
    }

    /**
     * Inject a bin dir resolver. Called by the extension at startup to wire
     * PythonEnvironmentService into the core package without a hard vscode dep.
     *
     * @param resolver - Async callback that returns the active environment bin dir.
     */
    public setBinDirResolver(resolver: BinDirResolver): void {
        this._binDirResolver = resolver;
    }

    /**
     * Get the bin directory for the current Python environment.
     *
     * @param workspaceUri - Optional VS Code workspace URI passed to the injected resolver.
     * @returns Absolute bin directory path, or null when none can be resolved.
     */
    public async getBinDir(workspaceUri?: unknown): Promise<string | null> {
        if (this._binDirResolver) {
            try {
                const binDir = await this._binDirResolver(workspaceUri);
                if (binDir) {
                    return binDir;
                }
                log('CommandService: binDirResolver returned null');
            } catch (error) {
                log(
                    `CommandService: binDirResolver failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        const cached = getCachedBinDir();
        if (cached) return cached;
        log('CommandService: no binDir available');
        return null;
    }

    /**
     * Get the full path to a tool (e.g., 'ade', 'ansible-doc').
     * Prefers the active environment bin dir (ADR-004). When a bin dir is
     * known, missing tools return null — do not leak ~/.local/bin or a
     * stale cache from a previously selected environment.
     *
     * @param toolName - Executable name to resolve.
     * @param workspaceUri - Optional workspace URI for bin dir resolution.
     * @returns Absolute tool path, or null when the executable is not found.
     */
    public async getToolPath(toolName: string, workspaceUri?: unknown): Promise<string | null> {
        // Active / cached bin dir from the selected environment
        const binDir = await this.getBinDir(workspaceUri);
        if (binDir) {
            const toolPath = path.join(binDir, toolName);
            if (fs.existsSync(toolPath)) {
                log(`CommandService: ${toolName} found in binDir -> ${toolPath}`);
                return toolPath;
            }
            // Env is selected but tool is not installed there — do not fall
            // through to PATH (e.g. ~/.local/bin) or another env's cache.
            log(`CommandService: ${toolName} not in active binDir ${binDir}`);
            return null;
        }

        // No active bin dir — last resort for standalone / pre-init
        const cachedPath = getCachedToolPath(toolName);
        if (cachedPath) {
            log(`CommandService: ${toolName} found in cache -> ${cachedPath}`);
            return cachedPath;
        }

        const pathResult = await findExecutableWithCache(toolName);
        log(`CommandService: ${toolName} PATH fallback -> ${pathResult ?? 'not found'}`);
        return pathResult;
    }

    /**
     * Get the workspace root directory.
     *
     * @returns Absolute workspace path from VS Code, ANSIBLE_ENV_WORKSPACE, or cwd.
     */
    public getWorkspaceRoot(): string | null {
        if (vscode?.workspace.workspaceFolders?.[0]) {
            return vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        if (process.env.ANSIBLE_ENV_WORKSPACE) {
            return process.env.ANSIBLE_ENV_WORKSPACE;
        }
        return process.cwd();
    }

    /**
     * Run a tool from the venv (e.g., 'ade install collection-name').
     * Automatically resolves the tool path from the environment.
     *
     * @param toolName - Executable name to run.
     * @param args - Command-line arguments passed to the tool.
     * @param options - Execution options such as cwd, env, and timeout.
     * @returns Captured stdout, stderr, and exit code from the subprocess.
     */
    public async runTool(
        toolName: string,
        args: string[],
        options: CommandOptions = {},
    ): Promise<ExecResult> {
        const toolPath = await this.getToolPath(toolName);
        if (!toolPath) {
            return {
                stdout: '',
                stderr: `Tool '${toolName}' not found. Install ansible-dev-tools first.`,
                exitCode: 1,
            };
        }

        return this.runCommandArgs(toolPath, args, options);
    }

    /**
     * Run a raw command string with venv-aware PATH and workspace cwd defaults.
     *
     * @param command - Full shell command to execute.
     * @param options - Execution options such as cwd, env, and timeout.
     * @returns Captured stdout, stderr, and exit code from the subprocess.
     */
    public async runCommand(command: string, options: CommandOptions = {}): Promise<ExecResult> {
        const cwd = options.cwd ?? this.getWorkspaceRoot() ?? process.cwd();
        const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024; // 10MB default

        // Merge environment with venv's bin in PATH
        const binDir = await this.getBinDir();
        const processPath = process.env.PATH ?? '';
        const envPath = binDir ? `${binDir}${path.delimiter}${processPath}` : processPath;

        const env: Record<string, string | undefined> = {
            ...process.env,
            PATH: envPath,
            ...options.env,
        };

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                maxBuffer,
                timeout: options.timeout,
                env: env,
            });
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
            };
        } catch (error) {
            const execError = error as cp.ExecException & { stdout?: string; stderr?: string };
            return {
                stdout: execError.stdout?.trim() ?? '',
                stderr: execError.stderr?.trim() ?? execError.message,
                exitCode: execError.code ?? 1,
            };
        }
    }

    /**
     * Run a command with an explicit args array, bypassing the shell.
     * Prevents shell injection when arguments come from user input.
     *
     * @param file - Executable path or name.
     * @param args - Arguments passed directly to the process (no shell interpolation).
     * @param options - Execution options such as cwd, env, and timeout.
     * @returns Captured stdout, stderr, and exit code from the subprocess.
     */
    public async runCommandArgs(
        file: string,
        args: string[],
        options: CommandOptions = {},
    ): Promise<ExecResult> {
        const cwd = options.cwd ?? this.getWorkspaceRoot() ?? process.cwd();
        const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;

        const binDir = await this.getBinDir();
        const processPath = process.env.PATH ?? '';
        const envPath = binDir ? `${binDir}${path.delimiter}${processPath}` : processPath;

        const env: Record<string, string | undefined> = {
            ...process.env,
            PATH: envPath,
            ...options.env,
        };

        try {
            const { stdout, stderr } = await execFileAsync(file, args, {
                cwd,
                maxBuffer,
                timeout: options.timeout,
                env,
            });
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
            };
        } catch (error) {
            const execError = error as cp.ExecException & { stdout?: string; stderr?: string };
            return {
                stdout: execError.stdout?.trim() ?? '',
                stderr: execError.stderr?.trim() ?? execError.message,
                exitCode: execError.code ?? 1,
            };
        }
    }

    /**
     * Run ade install for a collection.
     *
     * @param collectionName - Fully qualified collection name to install.
     * @returns Captured stdout, stderr, and exit code from ade install.
     */
    public async installCollection(collectionName: string): Promise<ExecResult> {
        return this.runTool('ade', ['install', collectionName]);
    }

    /**
     * Run ansible-doc command.
     *
     * @param args - Arguments passed to ansible-doc.
     * @returns Captured stdout, stderr, and exit code from ansible-doc.
     */
    public async runAnsibleDoc(args: string[]): Promise<ExecResult> {
        return this.runTool('ansible-doc', args);
    }

    /**
     * Run ansible-creator command.
     *
     * @param args - Arguments passed to ansible-creator.
     * @returns Captured stdout, stderr, and exit code from ansible-creator.
     */
    public async runAnsibleCreator(args: string[]): Promise<ExecResult> {
        return this.runTool('ansible-creator', args);
    }

    /**
     * Run ansible-navigator command.
     *
     * @param args - Arguments passed to ansible-navigator.
     * @param options - Execution options such as cwd, env, and timeout.
     * @returns Captured stdout, stderr, and exit code from ansible-navigator.
     */
    public async runAnsibleNavigator(
        args: string[],
        options: CommandOptions = {},
    ): Promise<ExecResult> {
        return this.runTool('ansible-navigator', args, options);
    }

    /**
     * Run ansible-builder command.
     *
     * @param args - Arguments passed to ansible-builder.
     * @param options - Optional cwd/timeout overrides for long builds.
     * @returns Captured stdout, stderr, and exit code from ansible-builder.
     */
    public async runAnsibleBuilder(
        args: string[],
        options: CommandOptions = {},
    ): Promise<ExecResult> {
        return this.runTool('ansible-builder', args, options);
    }

    /**
     * Check if a tool is available in the active environment or PATH.
     *
     * @param toolName - Executable name to check.
     * @returns True when getToolPath resolves a valid executable.
     */
    public async isToolAvailable(toolName: string): Promise<boolean> {
        const toolPath = await this.getToolPath(toolName);
        return toolPath !== null;
    }
}

/**
 * Returns the shared CommandService singleton.
 *
 * @returns CommandService instance for venv-aware command execution.
 */
export function getCommandService(): CommandService {
    return CommandService.getInstance();
}
