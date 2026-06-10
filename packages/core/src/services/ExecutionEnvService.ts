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
        details: {
            name: string;
            version: string;
            summary?: string;
        }[];
    };
    os_release?: {
        details: {
            'pretty-name'?: string;
            name?: string;
            version?: string;
        }[];
    };
    image_name?: string;
}

/**
 * Service for managing Ansible Execution Environments.
 * This service works both in VS Code and standalone (for MCP server).
 */
export class ExecutionEnvService {
    private static _instance: ExecutionEnvService | undefined;
    private _executionEnvironments: ExecutionEnvironment[] = [];
    private _detailsCache = new Map<string, EEDetails>();
    private _loading = false;
    private _loaded = false;
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
     * Returns the shared ExecutionEnvService instance.
     *
     * @returns Singleton service for execution environment discovery.
     */
    public static getInstance(): ExecutionEnvService {
        ExecutionEnvService._instance ??= new ExecutionEnvService();
        return ExecutionEnvService._instance;
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
     * @param fn - Callback invoked for ExecutionEnvService diagnostic messages.
     */
    public setLogFunction(fn: (message: string) => void): void {
        this._logFn = fn;
    }

    /**
     * Writes a prefixed diagnostic message through the configured log function.
     *
     * @param message - Log text without the ExecutionEnvService prefix.
     */
    private _log(message: string): void {
        this._logFn(`ExecutionEnvService: ${message}`);
    }

    /**
     * Check if the service is currently loading data.
     *
     * @returns True while ansible-navigator discovery is in progress.
     */
    public isLoading(): boolean {
        return this._loading;
    }

    /**
     * Check if the service has loaded data.
     *
     * @returns True after execution environments are loaded at least once.
     */
    public isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * Get all loaded execution environments.
     *
     * @returns Container images flagged as execution environments.
     */
    public getExecutionEnvironments(): ExecutionEnvironment[] {
        return this._executionEnvironments;
    }

    /**
     * Get a specific execution environment by name.
     *
     * @param fullName - Full image name reported by ansible-navigator.
     * @returns Matching environment metadata, or undefined when not loaded.
     */
    public getExecutionEnvironment(fullName: string): ExecutionEnvironment | undefined {
        return this._executionEnvironments.find((ee) => ee.full_name === fullName);
    }

    /**
     * Get cached details for an execution environment.
     *
     * @param fullName - Full image name to look up in the details cache.
     * @returns Cached inspection details, or undefined when not yet loaded.
     */
    public getCachedDetails(fullName: string): EEDetails | undefined {
        return this._detailsCache.get(fullName);
    }

    /**
     * Clears in-memory execution environment data and signals consumers to reload.
     *
     * @returns Promise that resolves after caches are cleared and listeners notified.
     */
    public refresh(): Promise<void> {
        this._executionEnvironments = [];
        this._detailsCache.clear();
        this._loaded = false;
        (this._onDidChange as { fire: () => void }).fire();
        return Promise.resolve();
    }

    /**
     * Load execution environments from ansible-navigator.
     *
     * @returns Filtered list of images marked as execution environments.
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
            const result = await commandService.runTool('ansible-navigator', [
                'images',
                '--mode',
                'stdout',
                '--pull-policy',
                'never',
                '--format',
                'json',
            ]);

            const output = result.stdout || null;

            if (!output) {
                this._executionEnvironments = [];
                this._loaded = true;
                return [];
            }

            const ees = JSON.parse(output) as ExecutionEnvironment[];
            // Filter to only execution environments
            this._executionEnvironments = ees.filter((ee) => ee.execution_environment);
            this._loaded = true;
            this._log(
                `Loaded ${String(this._executionEnvironments.length)} execution environments`,
            );

            return this._executionEnvironments;
        } catch (error) {
            this._log(
                `Error loading execution environments: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Load detailed information for a specific execution environment.
     *
     * @param fullName - Full image name to inspect with ansible-navigator.
     * @returns Parsed inspection details, or null when the command yields no output.
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
            const result = await commandService.runTool('ansible-navigator', [
                'images',
                fullName,
                '--mode',
                'stdout',
                '--pull-policy',
                'never',
                '--details',
                '--format',
                'json',
            ]);

            if (!result.stdout) {
                return null;
            }

            const details = JSON.parse(result.stdout) as EEDetails;
            this._detailsCache.set(fullName, details);
            return details;
        } catch (error) {
            this._log(
                `Failed to load EE details for ${fullName}: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        }
    }

    /**
     * Get Ansible collections installed in an execution environment.
     *
     * @param fullName - Full image name to inspect.
     * @returns Sorted collection name and version pairs from EE details.
     */
    public async getCollections(fullName: string): Promise<{ name: string; version: string }[]> {
        const details = await this.loadDetails(fullName);
        if (!details?.ansible_collections?.details) {
            return [];
        }

        return Object.entries(details.ansible_collections.details)
            .map(([name, version]) => ({ name, version }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get Python packages installed in an execution environment.
     *
     * @param fullName - Full image name to inspect.
     * @returns Sorted Python package entries from EE details.
     */
    public async getPythonPackages(
        fullName: string,
    ): Promise<{ name: string; version: string; summary?: string }[]> {
        const details = await this.loadDetails(fullName);
        if (!details?.python_packages?.details) {
            return [];
        }

        return [...details.python_packages.details].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get OS and Ansible version info for an execution environment.
     *
     * @param fullName - Full image name to inspect.
     * @returns Summary of Ansible version, OS name, and image name when available.
     */
    public async getInfo(
        fullName: string,
    ): Promise<{ ansible?: string; os?: string; image?: string }> {
        const details = await this.loadDetails(fullName);
        if (!details) {
            return {};
        }

        const info: { ansible?: string; os?: string; image?: string } = {};

        if (details.ansible_version?.details) {
            info.ansible = details.ansible_version.details;
        }

        if (details.os_release?.details[0]) {
            const os = details.os_release.details[0];
            info.os = os['pretty-name'] ?? os.name ?? 'Unknown';
        }

        if (details.image_name) {
            info.image = details.image_name;
        }

        return info;
    }

    /**
     * Executes a raw shell command and returns stdout when available.
     *
     * @param command - Full shell command to run via CommandService.
     * @returns Captured stdout, or null when the command fails.
     */
    private async _runCommand(command: string): Promise<string | null> {
        try {
            const { getCommandService } = await import('./CommandService');
            const commandService = getCommandService();

            this._log(`Running command: ${command}`);

            const result = await commandService.runCommand(command);

            // Exit code 1 is normal for ansible-navigator when returning JSON
            if (result.exitCode !== 0 && result.exitCode !== 1) {
                this._log(`Command error (exit ${String(result.exitCode)}): ${result.stderr}`);
            }

            return result.stdout || null;
        } catch (error) {
            this._log(`Command error: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}
