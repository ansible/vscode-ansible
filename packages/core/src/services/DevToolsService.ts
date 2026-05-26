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
 * Information about an installed dev tools package
 */
export interface DevToolPackage {
    name: string;
    version: string;
}

interface TerminalServiceLike {
    getInstance(): {
        createActivatedTerminal(opts: { name: string; show: boolean }): Promise<{
            sendCommand(cmd: string, opts: { waitForCompletion: boolean }): void;
        }>;
    };
}

export class DevToolsService {
    private static terminalServiceFactory: (() => TerminalServiceLike) | undefined;

    private static _instance: DevToolsService | undefined;
    private _pythonEnvApi: PythonEnvironmentApi | undefined;
    private _packages: DevToolPackage[] = [];
    private _loading: boolean = false;
    private _loaded: boolean = false;
    private _onDidChange: SimpleEventEmitter<void> | { fire: () => void; event: unknown };
    public readonly onDidChange: unknown;

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

    public static getInstance(): DevToolsService {
        if (!DevToolsService._instance) {
            DevToolsService._instance = new DevToolsService();
        }
        return DevToolsService._instance;
    }

    /**
     * Register how to obtain TerminalService from the extension host (VS Code only).
     */
    public static setTerminalServiceFactory(factory: () => TerminalServiceLike): void {
        DevToolsService.terminalServiceFactory = factory;
    }

    /**
     * Check if running in VS Code
     */
    public isInVSCode(): boolean {
        return vscode !== undefined;
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
            console.error('DevToolsService: Failed to get Python Environments API:', error);
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
     * Get all loaded packages
     */
    public getPackages(): DevToolPackage[] {
        return this._packages;
    }

    /**
     * Check if ansible-dev-tools packages are installed
     */
    public hasPackages(): boolean {
        return this._packages.length > 0;
    }

    /**
     * Get a specific package by name
     */
    public getPackage(name: string): DevToolPackage | undefined {
        return this._packages.find(p => p.name === name);
    }

    /**
     * Refresh the packages list
     */
    public async refresh(): Promise<void> {
        if (this._loading) {
            return;
        }

        this._loading = true;
        this._packages = [];
        (this._onDidChange as { fire: () => void }).fire();

        try {
            if (vscode && this._pythonEnvApi) {
                await this._loadPackagesVSCode();
            } else {
                await this._loadPackagesStandalone();
            }
            this._loaded = true;
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Install ansible-dev-tools package (VS Code only)
     */
    public async install(): Promise<void> {
        if (!vscode) {
            throw new Error('install is only available in VS Code');
        }

        await this.initialize();

        if (!this._pythonEnvApi) {
            throw new Error('Python Environments API not available');
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
        const environment = await this._pythonEnvApi.getEnvironment(workspaceFolder);

        if (!environment) {
            throw new Error('No Python environment selected');
        }

        await this._pythonEnvApi.managePackages(environment, {
            install: ['ansible-dev-tools'],
            upgrade: false
        });
    }

    /**
     * Upgrade ansible-dev-tools package with eager strategy (VS Code only)
     */
    public async upgrade(): Promise<void> {
        if (!vscode) {
            throw new Error('upgrade is only available in VS Code');
        }

        await this.initialize();

        if (!DevToolsService.terminalServiceFactory) {
            void vscode.window.showInformationMessage('Upgrade is only available in VS Code.');
            return;
        }

        const TerminalService = DevToolsService.terminalServiceFactory();
        const terminalService = TerminalService.getInstance();
        const managed = await terminalService.createActivatedTerminal({
            name: 'Upgrade ansible-dev-tools',
            show: true,
        });
        managed.sendCommand('pip install --upgrade --upgrade-strategy eager ansible-dev-tools', { waitForCompletion: false });
    }

    /**
     * Load packages in VS Code mode (uses Python Envs API)
     */
    private async _loadPackagesVSCode(): Promise<void> {
        await this._loadPackagesWithCommandService();
    }

    /**
     * Load packages in standalone mode (finds tools in PATH)
     */
    private async _loadPackagesStandalone(): Promise<void> {
        await this._loadPackagesWithCommandService();
    }

    /**
     * Common package loading logic using CommandService
     */
    private async _loadPackagesWithCommandService(): Promise<void> {
        try {
            const { getCommandService } = await import('./CommandService');
            const commandService = getCommandService();
            
            const result = await commandService.runTool('adt', ['--version']);
            
            if (result.exitCode !== 0) {
                console.error('DevToolsService: adt not found or failed');
                this._packages = [];
                return;
            }

            // Parse the adt --version output
            const packages: DevToolPackage[] = [];
            const lines = result.stdout.trim().split('\n');
            for (const line of lines) {
                const match = line.match(/^(\S+)\s+(\S+)$/);
                if (match) {
                    packages.push({ name: match[1], version: match[2] });
                }
            }

            this._packages = packages;
        } catch (error) {
            console.error('DevToolsService: Failed to load packages:', error);
            this._packages = [];
        }
    }
}
