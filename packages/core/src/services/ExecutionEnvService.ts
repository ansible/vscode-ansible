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
 * Information about an execution environment container image
 */
export interface ExecutionEnvironment {
    created: string;
    execution_environment: boolean;
    full_name: string;
    image_id: string;
}

/**
 * Detailed information about an execution environment
 */
export interface EEDetails {
    ansible_collections?: {
        details: Record<string, string>;
    };
    ansible_version?: {
        details: string;
    };
    redhat_release?: {
        details: string;
    };
    system_packages?: {
        details: Record<string, string>;
    };
    python_packages?: {
        details: Array<{
            name: string;
            version: string;
            summary?: string;
        }>;
    };
    os_release?: {
        details: Array<{
            'pretty-name'?: string;
            name?: string;
            version?: string;
        }>;
    };
    image_name?: string;
}

/**
 * Service for managing Ansible Execution Environments.
 * This service works both in VS Code and standalone (for MCP server).
 */
export class ExecutionEnvService {
    private static _instance: ExecutionEnvService | undefined;
    private _pythonEnvApi: PythonEnvironmentApi | undefined;
    private _executionEnvironments: ExecutionEnvironment[] = [];
    private _detailsCache: Map<string, EEDetails> = new Map();
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

    public static getInstance(): ExecutionEnvService {
        if (!ExecutionEnvService._instance) {
            ExecutionEnvService._instance = new ExecutionEnvService();
        }
        return ExecutionEnvService._instance;
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
        this._logFn(`ExecutionEnvService: ${message}`);
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
     * Get all loaded execution environments
     */
    public getExecutionEnvironments(): ExecutionEnvironment[] {
        return this._executionEnvironments;
    }

    /**
     * Get a specific execution environment by name
     */
    public getExecutionEnvironment(fullName: string): ExecutionEnvironment | undefined {
        return this._executionEnvironments.find(ee => ee.full_name === fullName);
    }

    /**
     * Get cached details for an execution environment
     */
    public getCachedDetails(fullName: string): EEDetails | undefined {
        return this._detailsCache.get(fullName);
    }

    /**
     * Refresh the execution environments list
     */
    public async refresh(): Promise<void> {
        this._executionEnvironments = [];
        this._detailsCache.clear();
        this._loaded = false;
        (this._onDidChange as { fire: () => void }).fire();
    }

    /**
     * Load execution environments from ansible-navigator
     */
    public async loadExecutionEnvironments(): Promise<ExecutionEnvironment[]> {
        if (this._loading) {
            return this._executionEnvironments;
        }

        if (this._loaded && this._executionEnvironments.length > 0) {
            return this._executionEnvironments;
        }

        this._loading = true;
        (this._onDidChange as { fire: () => void }).fire();

        try {
            const { getCommandService } = await import('./CommandService');
            const commandService = getCommandService();
            
            // Run ansible-navigator images command using CommandService
            const result = await commandService.runTool(
                'ansible-navigator',
                ['images', '--mode', 'stdout', '--pull-policy', 'never', '--format', 'json']
            );
            
            const output = result.stdout || null;

            if (!output) {
                this._executionEnvironments = [];
                this._loaded = true;
                return [];
            }

            const ees: ExecutionEnvironment[] = JSON.parse(output);
            // Filter to only execution environments
            this._executionEnvironments = ees.filter(ee => ee.execution_environment);
            this._loaded = true;
            this._log(`Loaded ${this._executionEnvironments.length} execution environments`);

            return this._executionEnvironments;
        } catch (error) {
            this._log(`Error loading execution environments: ${error}`);
            throw error;
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Load detailed information for a specific execution environment
     */
    public async loadDetails(fullName: string): Promise<EEDetails | null> {
        // Check cache first
        const cached = this._detailsCache.get(fullName);
        if (cached) {
            return cached;
        }

        try {
            const { getCommandService } = await import('./CommandService');
            const commandService = getCommandService();
            
            // Run ansible-navigator images with --details using CommandService
            const result = await commandService.runTool(
                'ansible-navigator',
                ['images', fullName, '--mode', 'stdout', '--pull-policy', 'never', '--details', '--format', 'json']
            );

            if (!result.stdout) {
                return null;
            }

            const details = JSON.parse(result.stdout) as EEDetails;
            this._detailsCache.set(fullName, details);
            return details;
        } catch (error) {
            this._log(`Failed to load EE details for ${fullName}: ${error}`);
            throw error;
        }
    }

    /**
     * Get Ansible collections installed in an execution environment
     */
    public async getCollections(fullName: string): Promise<Array<{ name: string; version: string }>> {
        const details = await this.loadDetails(fullName);
        if (!details?.ansible_collections?.details) {
            return [];
        }

        return Object.entries(details.ansible_collections.details)
            .map(([name, version]) => ({ name, version }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get Python packages installed in an execution environment
     */
    public async getPythonPackages(fullName: string): Promise<Array<{ name: string; version: string; summary?: string }>> {
        const details = await this.loadDetails(fullName);
        if (!details?.python_packages?.details) {
            return [];
        }

        return [...details.python_packages.details]
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get OS and Ansible version info for an execution environment
     */
    public async getInfo(fullName: string): Promise<{ ansible?: string; os?: string; image?: string }> {
        const details = await this.loadDetails(fullName);
        if (!details) {
            return {};
        }

        const info: { ansible?: string; os?: string; image?: string } = {};

        if (details.ansible_version?.details) {
            info.ansible = details.ansible_version.details;
        }

        if (details.os_release?.details?.[0]) {
            const os = details.os_release.details[0];
            info.os = os['pretty-name'] || os.name || 'Unknown';
        }

        if (details.image_name) {
            info.image = details.image_name;
        }

        return info;
    }

    private async _runCommand(command: string): Promise<string | null> {
        try {
            const { getCommandService } = await import('./CommandService');
            const commandService = getCommandService();
            
            this._log(`Running command: ${command}`);
            
            const result = await commandService.runCommand(command);
            
            // Exit code 1 is normal for ansible-navigator when returning JSON
            if (result.exitCode !== 0 && result.exitCode !== 1) {
                this._log(`Command error (exit ${result.exitCode}): ${result.stderr}`);
            }
            
            return result.stdout || null;
        } catch (error) {
            this._log(`Command error: ${error}`);
            return null;
        }
    }
}
