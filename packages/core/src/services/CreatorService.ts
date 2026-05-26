// Command execution is handled by CommandService

// Conditional vscode import - only used when available
let vscode: typeof import('vscode') | undefined;
try {
    vscode = require('vscode');
} catch {
    // Running standalone (not in VS Code)
}

import { PythonEnvironmentApi } from '../types/pythonEnvApi';
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
export class CreatorService {
    private static _instance: CreatorService | undefined;
    private _pythonEnvApi: PythonEnvironmentApi | undefined;
    private _schema: SchemaNode | null = null;
    private _loading: boolean = false;
    private _loaded: boolean = false;
    private _onDidChange: SimpleEventEmitter<void> | { fire: () => void; event: unknown };
    public readonly onDidChange: unknown;
    private _logFn: (message: string) => void = console.error;

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

    public static getInstance(): CreatorService {
        if (!CreatorService._instance) {
            CreatorService._instance = new CreatorService();
        }
        return CreatorService._instance;
    }

    /**
     * Check if running in VS Code
     */
    public isInVSCode(): boolean {
        return vscode !== undefined;
    }

    /**
     * Set a custom logging function
     */
    public setLogFunction(fn: (message: string) => void): void {
        this._logFn = fn;
    }

    private _log(message: string): void {
        this._logFn(`CreatorService: ${message}`);
    }

    /**
     * Initialize the service with the Python Environment API (VS Code only)
     */
    public async initialize(): Promise<void> {
        if (this._pythonEnvApi || !vscode) {
            return;
        }

        try {
            const pythonEnvExtension = vscode.extensions.getExtension<PythonEnvironmentApi>('ms-python.vscode-python-envs');
            if (pythonEnvExtension) {
                if (!pythonEnvExtension.isActive) {
                    await pythonEnvExtension.activate();
                }
                this._pythonEnvApi = pythonEnvExtension.exports;
            }
        } catch (error) {
            this._log(`Failed to get Python Environments API: ${error}`);
        }
    }

    /**
     * Check if the service is currently loading data
     */
    public isLoading(): boolean {
        return this._loading;
    }

    /**
     * Check if the service has loaded data
     */
    public isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * Get the loaded schema
     */
    public getSchema(): SchemaNode | null {
        return this._schema;
    }

    /**
     * Refresh the schema
     */
    public async refresh(): Promise<void> {
        this._schema = null;
        this._loaded = false;
        (this._onDidChange as { fire: () => void }).fire();
        await this.loadSchema();
    }

    /**
     * Load the ansible-creator schema
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
            
            // Use CommandService to run ansible-creator schema
            const result = await commandService.runTool('ansible-creator', ['schema']);
            
            if (result.exitCode !== 0) {
                this._log(`ansible-creator schema failed: ${result.stderr}`);
                return null;
            }

            if (result.stdout) {
                this._schema = JSON.parse(result.stdout);
                this._loaded = true;
                this._log('Schema loaded successfully');
            }

            return this._schema;
        } catch (error) {
            this._log(`Error loading schema: ${error}`);
            throw error;
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Get available commands at a given path
     */
    public getCommands(path: string[] = []): Array<{ name: string; description?: string; hasSubcommands: boolean }> {
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
            hasSubcommands: !!(schema.subcommands && Object.keys(schema.subcommands).length > 0)
        }));
    }

    /**
     * Get command parameters for a given command path
     */
    public getCommandParameters(path: string[]): { required: string[]; optional: string[]; properties: Record<string, ParameterSchema> } | null {
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

        const required = node.parameters.required || [];
        const properties = node.parameters.properties || {};
        const optional = Object.keys(properties).filter(key => !required.includes(key));

        return { required, optional, properties };
    }

    /**
     * Get command description for a given path
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
     * Run an ansible-creator command
     * In VS Code: opens a terminal
     * Standalone: executes via child_process and returns output
     * 
     * @param path - Command path like ['init', 'playbook']
     * @param args - Arguments (positional args first, then flags)
     * @param positionalArgs - Ordered list of positional argument keys to extract from args
     */
    public async runCommand(
        path: string[], 
        args: Record<string, string | boolean>,
        positionalArgs?: string[]
    ): Promise<string> {
        // Build the command arguments (not including 'ansible-creator' itself)
        const cmdArgs: string[] = [...path];

        // If we have positional args defined, extract them in order
        const usedKeys = new Set<string>();
        if (positionalArgs) {
            for (const key of positionalArgs) {
                const value = args[key];
                if (value !== undefined && value !== '' && value !== false) {
                    cmdArgs.push(String(value));
                    usedKeys.add(key);
                }
            }
        }

        // Add remaining args as flags
        for (const [key, value] of Object.entries(args)) {
            if (usedKeys.has(key)) { continue; }
            
            if (value === true) {
                cmdArgs.push(`--${key}`);
            } else if (value !== false && value !== '') {
                cmdArgs.push(`--${key}`, String(value));
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
     * Build the command string for a creator command (useful for MCP)
     */
    public buildCommandString(path: string[], args: Record<string, string | boolean>, positionalArgs?: string[]): string {
        const commandParts = ['ansible-creator', ...path];

        // If we have positional args defined, extract them in order
        const usedKeys = new Set<string>();
        if (positionalArgs) {
            for (const key of positionalArgs) {
                const value = args[key];
                if (value !== undefined && value !== '' && value !== false) {
                    commandParts.push(String(value));
                    usedKeys.add(key);
                }
            }
        }

        // Add remaining args as flags
        for (const [key, value] of Object.entries(args)) {
            if (usedKeys.has(key)) { continue; }
            
            if (value === true) {
                commandParts.push(`--${key}`);
            } else if (value !== false && value !== '') {
                commandParts.push(`--${key}`, String(value));
            }
        }

        return commandParts.join(' ');
    }

    /**
     * Get positional argument names for a command from the schema
     * Positional args are those without 'aliases' in the schema
     */
    public getPositionalArgs(path: string[]): string[] {
        if (!this._schema) {
            return [];
        }

        // Navigate to the command in the schema
        let node: SchemaNode | undefined = this._schema;
        for (const segment of path) {
            node = node?.subcommands?.[segment];
            if (!node) { return []; }
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
            this._log(`Command error: ${error}`);
            return null;
        }
    }
}
