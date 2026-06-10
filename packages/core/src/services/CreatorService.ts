// Command execution is handled by CommandService

// Conditional vscode import - only used when available
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running standalone (not in VS Code)
}

import { SimpleEventEmitter } from '../utils/SimpleEventEmitter';

/**
 * Schema for a command parameter
 */
export interface ParameterSchema {
    type: string;
    description: string;
    default?: unknown;
    enum?: string[];
    aliases?: string[];
}

/**
 * Schema node representing a command or subcommand
 */
export interface SchemaNode {
    name: string;
    description?: string;
    parameters?: {
        type: string;
        properties: Record<string, ParameterSchema>;
        required: string[];
    };
    subcommands?: Record<string, SchemaNode>;
}

/**
 * Service for managing Ansible Creator functionality.
 * This service works both in VS Code and standalone (for MCP server).
 */
export type CreatorStatus = 'unknown' | 'not-installed' | 'outdated' | 'ready';

/**
 * Loads ansible-creator schema and runs scaffolding commands in VS Code or standalone mode.
 */
export class CreatorService {
    private static _instance: CreatorService | undefined;
    private _schema: SchemaNode | null = null;
    private _loading = false;
    private _loaded = false;
    private _status: CreatorStatus = 'unknown';
    private _installedVersion: string | undefined;
    private _onDidChange: SimpleEventEmitter<void> | { fire: () => void; event: unknown };
    public readonly onDidChange: unknown;
    private _logFn: (message: string) => void = console.error;

    /**
     * Initializes change notifications using VS Code or a standalone event emitter.
     */
    private constructor() {
        // Use VS Code EventEmitter if available, otherwise use simple implementation
        if (vscode) {
            const emitter = new vscode.EventEmitter<void>();
            this._onDidChange = emitter;
            this.onDidChange = emitter.event;
        } else {
            const emitter = new SimpleEventEmitter<void>();
            this._onDidChange = emitter;
            this.onDidChange = emitter.event;
        }
    }

    /**
     * Returns the shared CreatorService instance.
     *
     * @returns Singleton service for ansible-creator schema and commands.
     */
    public static getInstance(): CreatorService {
        CreatorService._instance ??= new CreatorService();
        return CreatorService._instance;
    }

    /**
     * Check if running in VS Code.
     *
     * @returns True when the vscode module is available.
     */
    public isInVSCode(): boolean {
        return vscode !== undefined;
    }

    /**
     * Set a custom logging function.
     *
     * @param fn - Callback invoked for CreatorService diagnostic messages.
     */
    public setLogFunction(fn: (message: string) => void): void {
        this._logFn = fn;
    }

    /**
     * Writes a prefixed diagnostic message through the configured log function.
     *
     * @param message - Log text without the CreatorService prefix.
     */
    private _log(message: string): void {
        this._logFn(`CreatorService: ${message}`);
    }

    /**
     * Check if the service is currently loading data.
     *
     * @returns True while schema discovery is in progress.
     */
    public isLoading(): boolean {
        return this._loading;
    }

    /**
     * Check if the service has loaded data.
     *
     * @returns True after schema loading completes successfully.
     */
    public isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * Get the loaded schema.
     *
     * @returns Parsed ansible-creator schema tree, or null when not yet loaded.
     */
    public getSchema(): SchemaNode | null {
        return this._schema;
    }

    /**
     * Returns the ansible-creator readiness status derived from schema loading.
     *
     * @returns Installation state: unknown, not-installed, outdated, or ready.
     */
    public getStatus(): CreatorStatus {
        return this._status;
    }

    /**
     * Returns the detected ansible-creator version when installed but outdated.
     *
     * @returns Version string from --version output, or undefined when unknown.
     */
    public getInstalledVersion(): string | undefined {
        return this._installedVersion;
    }

    /**
     * Refresh the schema
     */
    public async refresh(): Promise<void> {
        this._schema = null;
        this._loaded = false;
        this._status = 'unknown';
        (this._onDidChange as { fire: () => void }).fire();
        await this.loadSchema();
    }

    /**
     * Load the ansible-creator schema.
     *
     * @returns Parsed schema node, or null when ansible-creator is unavailable.
     */
    public async loadSchema(): Promise<SchemaNode | null> {
        if (this._loading) {
            return this._schema;
        }

        if (this._loaded && this._schema) {
            return this._schema;
        }

        this._loading = true;
        (this._onDidChange as { fire: () => void }).fire();

        try {
            const { getCommandService } = await import('./CommandService');
            const commandService = getCommandService();

            const result = await commandService.runTool('ansible-creator', ['schema']);

            if (result.exitCode !== 0) {
                this._log(`ansible-creator schema failed: ${result.stderr}`);
                // Distinguish "not installed" from "installed but too old"
                const isInvalidChoice = result.stderr.includes('invalid choice');
                if (isInvalidChoice) {
                    this._status = 'outdated';
                    // Try to get the installed version for the UI
                    try {
                        const vResult = await commandService.runTool('ansible-creator', [
                            '--version',
                        ]);
                        if (vResult.exitCode === 0 && vResult.stdout) {
                            this._installedVersion = vResult.stdout.trim().split(/\s+/).pop();
                        }
                    } catch {
                        // version check is best-effort
                    }
                    this._log(
                        `ansible-creator is installed (${this._installedVersion ?? 'unknown version'}) but too old — 'schema' subcommand not available`,
                    );
                } else {
                    this._status = 'not-installed';
                }
                return null;
            }

            if (result.stdout) {
                this._schema = JSON.parse(result.stdout) as SchemaNode;
                this._loaded = true;
                this._status = 'ready';
                this._log('Schema loaded successfully');
            }

            return this._schema;
        } catch (error) {
            this._log(
                `Error loading schema: ${error instanceof Error ? error.message : String(error)}`,
            );
            this._status = 'not-installed';
            return null;
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Get available commands at a given path.
     *
     * @param path - Command path segments (e.g. ['init', 'playbook']).
     * @returns Subcommands at the path with descriptions and subcommand flags.
     */
    public getCommands(
        path: string[] = [],
    ): { name: string; description?: string; hasSubcommands: boolean }[] {
        if (!this._schema) {
            return [];
        }

        let node: SchemaNode | undefined = this._schema;

        // Navigate to the path
        for (const segment of path) {
            if (!node.subcommands?.[segment]) {
                return [];
            }
            node = node.subcommands[segment];
        }

        if (!node.subcommands) {
            return [];
        }

        return Object.entries(node.subcommands).map(([name, schema]) => ({
            name,
            description: schema.description,
            hasSubcommands: !!(schema.subcommands && Object.keys(schema.subcommands).length > 0),
        }));
    }

    /**
     * Get command parameters for a given command path.
     *
     * @param path - Command path segments identifying the target subcommand.
     * @returns Required, optional, and property schemas, or null when not found.
     */
    public getCommandParameters(path: string[]): {
        required: string[];
        optional: string[];
        properties: Record<string, ParameterSchema>;
    } | null {
        if (!this._schema || path.length === 0) {
            return null;
        }

        let node: SchemaNode | undefined = this._schema;

        // Navigate to the command
        for (const segment of path) {
            if (!node.subcommands?.[segment]) {
                return null;
            }
            node = node.subcommands[segment];
        }

        if (!node.parameters) {
            return null;
        }

        const required = node.parameters.required;
        const properties = node.parameters.properties;
        const optional = Object.keys(properties).filter((key) => !required.includes(key));

        return { required, optional, properties };
    }

    /**
     * Get command description for a given path.
     *
     * @param path - Command path segments identifying the target subcommand.
     * @returns Human-readable description from the schema, or undefined when missing.
     */
    public getCommandDescription(path: string[]): string | undefined {
        if (!this._schema || path.length === 0) {
            return undefined;
        }

        let node: SchemaNode | undefined = this._schema;

        for (const segment of path) {
            if (!node.subcommands?.[segment]) {
                return undefined;
            }
            node = node.subcommands[segment];
        }

        return node.description;
    }

    /**
     * Run an ansible-creator command via CommandService and return captured output.
     *
     * @param path - Command path like ['init', 'playbook'].
     * @param args - Flag and positional argument values keyed by schema parameter name.
     * @param positionalArgs - Ordered positional parameter keys to emit before flags.
     * @returns Command stdout, or a success message when stdout is empty.
     */
    public async runCommand(
        path: string[],
        args: Record<string, string | boolean>,
        positionalArgs?: string[],
    ): Promise<string> {
        // Build the command arguments (not including 'ansible-creator' itself)
        const cmdArgs: string[] = [...path];

        // If we have positional args defined, extract them in order
        const usedKeys = new Set<string>();
        if (positionalArgs) {
            for (const key of positionalArgs) {
                const value = args[key];
                if (typeof value === 'string' && value !== '') {
                    cmdArgs.push(value);
                    usedKeys.add(key);
                } else if (value === true) {
                    cmdArgs.push(String(value));
                    usedKeys.add(key);
                }
            }
        }

        // Add remaining args as flags
        for (const [key, value] of Object.entries(args)) {
            if (usedKeys.has(key)) {
                continue;
            }

            if (value === true) {
                cmdArgs.push(`--${key}`);
            } else if (typeof value === 'string' && value !== '') {
                cmdArgs.push(`--${key}`, value);
            }
        }

        const fullCommand = `ansible-creator ${cmdArgs.join(' ')}`;
        console.log(`CreatorService.runCommand: ${fullCommand}`);

        // Use CommandService for blocking execution with proper venv PATH
        // This waits for completion and captures output
        const { getCommandService } = await import('./CommandService');
        const commandService = getCommandService();

        console.log('CreatorService.runCommand: Using CommandService (blocking execution)');
        const result = await commandService.runAnsibleCreator(cmdArgs);

        if (result.exitCode !== 0) {
            const errorOutput = result.stderr || result.stdout || 'Unknown error';
            throw new Error(`Command failed: ${fullCommand}\n${errorOutput}`);
        }

        return result.stdout || 'Command completed successfully';
    }

    /**
     * Build the command string for a creator command (useful for MCP).
     *
     * @param path - Command path segments appended after ansible-creator.
     * @param args - Flag and positional argument values keyed by schema parameter name.
     * @param positionalArgs - Ordered positional parameter keys to emit before flags.
     * @returns Shell-ready ansible-creator command string.
     */
    public buildCommandString(
        path: string[],
        args: Record<string, string | boolean>,
        positionalArgs?: string[],
    ): string {
        const commandParts = ['ansible-creator', ...path];

        // If we have positional args defined, extract them in order
        const usedKeys = new Set<string>();
        if (positionalArgs) {
            for (const key of positionalArgs) {
                const value = args[key];
                if (typeof value === 'string' && value !== '') {
                    commandParts.push(value);
                    usedKeys.add(key);
                } else if (value === true) {
                    commandParts.push(String(value));
                    usedKeys.add(key);
                }
            }
        }

        // Add remaining args as flags
        for (const [key, value] of Object.entries(args)) {
            if (usedKeys.has(key)) {
                continue;
            }

            if (value === true) {
                commandParts.push(`--${key}`);
            } else if (typeof value === 'string' && value !== '') {
                commandParts.push(`--${key}`, value);
            }
        }

        return commandParts.join(' ');
    }

    /**
     * Get positional argument names for a command from the schema.
     * Positional args are those without aliases in the schema.
     *
     * @param path - Command path segments identifying the target subcommand.
     * @returns Parameter names that should be passed positionally.
     */
    public getPositionalArgs(path: string[]): string[] {
        if (!this._schema) {
            return [];
        }

        // Navigate to the command in the schema
        let node: SchemaNode | undefined = this._schema;
        for (const segment of path) {
            node = node.subcommands?.[segment];
            if (!node) {
                return [];
            }
        }

        // Find parameters without aliases (these are positional)
        const positionalArgs: string[] = [];
        if (node.parameters?.properties) {
            for (const [name, param] of Object.entries(node.parameters.properties)) {
                if (!param.aliases || param.aliases.length === 0) {
                    positionalArgs.push(name);
                }
            }
        }

        return positionalArgs;
    }

    /**
     * Executes a raw shell command and returns stdout on success.
     *
     * @param command - Full shell command to run via CommandService.
     * @returns Captured stdout, or null when the command fails.
     */
    private async _runCommand(command: string): Promise<string | null> {
        try {
            const { getCommandService } = await import('./CommandService');
            const commandService = getCommandService();

            const result = await commandService.runCommand(command);

            if (result.exitCode !== 0) {
                this._log(`Command error: ${result.stderr}`);
                return null;
            }

            return result.stdout;
        } catch (error) {
            this._log(`Command error: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}
