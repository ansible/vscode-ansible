/**
 * Command Service
 * 
 * Centralized service for running commands with the correct Python environment.
 * Ensures all commands use the workspace's venv when available.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

// Conditional vscode import
let vscode: typeof import('vscode') | undefined;
try {
    vscode = require('vscode');
} catch {
    // Running standalone (MCP server)
}

import { getCachedBinDir, getCachedToolPath, findExecutableWithCache } from './EnvironmentCache';

const execAsync = promisify(cp.exec);

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

export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * CommandService - singleton for running commands with venv awareness
 */
export class CommandService {
    private static _instance: CommandService;
    private _pythonEnvApi: unknown;
    private _initialized = false;

    private constructor() {}

    public static getInstance(): CommandService {
        if (!CommandService._instance) {
            CommandService._instance = new CommandService();
        }
        return CommandService._instance;
    }

    /**
     * Initialize the service - gets the Python environment API
     */
    public async initialize(): Promise<void> {
        if (this._initialized || !vscode) {
            return;
        }

        try {
            const pythonExtension = vscode.extensions.getExtension('ms-python.vscode-python-envs');
            if (pythonExtension) {
                if (!pythonExtension.isActive) {
                    await pythonExtension.activate();
                }
                this._pythonEnvApi = pythonExtension.exports;
            }
            this._initialized = true;
        } catch (error) {
            console.error('CommandService: Failed to initialize Python API:', error);
        }
    }

    /**
     * Get the bin directory for the current Python environment
     */
    public async getBinDir(workspaceUri?: unknown): Promise<string | null> {
        await this.initialize();

        // Try VS Code Python extension first
        if (vscode && this._pythonEnvApi) {
            try {
                const api = this._pythonEnvApi as {
                    getEnvironment: (uri: unknown) => Promise<{
                        execInfo?: { run?: { executable?: string } }
                    } | null>
                };
                const uri = workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
                const env = await api.getEnvironment(uri);
                if (env?.execInfo?.run?.executable) {
                    return path.dirname(env.execInfo.run.executable);
                }
            } catch (error) {
                console.error('CommandService: Failed to get environment:', error);
            }
        }

        // Fall back to cached environment
        return getCachedBinDir();
    }

    /**
     * Get the full path to a tool (e.g., 'ade', 'ansible-doc')
     * Checks venv first, then cached environment, then PATH
     */
    public async getToolPath(toolName: string, workspaceUri?: unknown): Promise<string | null> {
        // Try to get from current venv
        const binDir = await this.getBinDir(workspaceUri);
        if (binDir) {
            const toolPath = path.join(binDir, toolName);
            if (fs.existsSync(toolPath)) {
                return toolPath;
            }
        }

        // Try cached environment
        const cachedPath = getCachedToolPath(toolName);
        if (cachedPath) {
            return cachedPath;
        }

        // Fall back to PATH search
        return findExecutableWithCache(toolName);
    }

    /**
     * Get the workspace root directory
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
     * Run a tool from the venv (e.g., 'ade install collection-name')
     * Automatically resolves the tool path from the environment
     */
    public async runTool(
        toolName: string,
        args: string[],
        options: CommandOptions = {}
    ): Promise<ExecResult> {
        const toolPath = await this.getToolPath(toolName);
        if (!toolPath) {
            return {
                stdout: '',
                stderr: `Tool '${toolName}' not found. Install ansible-dev-tools first.`,
                exitCode: 1
            };
        }

        const command = `"${toolPath}" ${args.join(' ')}`;
        return this.runCommand(command, options);
    }

    /**
     * Run a raw command string
     */
    public async runCommand(
        command: string,
        options: CommandOptions = {}
    ): Promise<ExecResult> {
        const cwd = options.cwd || this.getWorkspaceRoot() || process.cwd();
        const maxBuffer = options.maxBuffer || 10 * 1024 * 1024; // 10MB default
        
        // Merge environment with venv's bin in PATH
        const binDir = await this.getBinDir();
        const processPath = process.env.PATH;
        const envPath = binDir 
            ? `${binDir}${path.delimiter}${processPath}`
            : processPath;

        const env: Record<string, string | undefined> = {
            ...process.env,
            PATH: envPath,
            ...options.env
        };

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                maxBuffer,
                timeout: options.timeout,
                env: env as NodeJS.ProcessEnv
            });
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0
            };
        } catch (error) {
            const execError = error as cp.ExecException & { stdout?: string; stderr?: string };
            return {
                stdout: execError.stdout?.trim() || '',
                stderr: execError.stderr?.trim() || execError.message,
                exitCode: execError.code || 1
            };
        }
    }

    /**
     * Run ade install for a collection
     */
    public async installCollection(collectionName: string): Promise<ExecResult> {
        return this.runTool('ade', ['install', collectionName]);
    }

    /**
     * Run ansible-doc command
     */
    public async runAnsibleDoc(args: string[]): Promise<ExecResult> {
        return this.runTool('ansible-doc', args);
    }

    /**
     * Run ansible-creator command
     */
    public async runAnsibleCreator(args: string[]): Promise<ExecResult> {
        return this.runTool('ansible-creator', args);
    }

    /**
     * Run ansible-navigator command
     */
    public async runAnsibleNavigator(args: string[]): Promise<ExecResult> {
        return this.runTool('ansible-navigator', args);
    }

    /**
     * Check if a tool is available
     */
    public async isToolAvailable(toolName: string): Promise<boolean> {
        const toolPath = await this.getToolPath(toolName);
        return toolPath !== null;
    }
}

// Export singleton getter for convenience
export function getCommandService(): CommandService {
    return CommandService.getInstance();
}
