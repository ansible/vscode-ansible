// Conditional vscode import - only used when available
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running standalone (not in VS Code)
}

import * as path from 'path';
import { SimpleEventEmitter, log } from '@ansible/common';

export interface DevToolPackage {
    name: string;
    version: string;
    location?: string;
}

/**
 * Installer callback injected by the extension when the full Python
 * Environments API is available (managePackages support).
 */
export type PackageInstaller = () => Promise<void>;

interface CommandResult {
    exitCode: number | undefined;
    success: boolean;
}

interface TerminalServiceLike {
    getInstance(): {
        createActivatedTerminal(opts: { name: string; show: boolean }): Promise<{
            sendCommand(cmd: string, opts: { waitForCompletion: boolean }): Promise<CommandResult>;
        }>;
    };
}

/**
 * Discovers and manages ansible-dev-tools packages in the active Python environment.
 */
export class DevToolsService {
    private static terminalServiceFactory: (() => TerminalServiceLike) | undefined;

    private static _instance: DevToolsService | undefined;
    private _packageInstaller: PackageInstaller | undefined;
    private _packages: DevToolPackage[] = [];
    private _loading = false;
    private _loaded = false;
    private _onDidChange: SimpleEventEmitter<void> | { fire: () => void; event: unknown };
    public readonly onDidChange: unknown;

    /**
     * Initializes change notifications using VS Code or a standalone event emitter.
     */
    private constructor() {
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
     * Returns the shared DevToolsService instance.
     *
     * @returns Singleton service for ansible-dev-tools discovery.
     */
    public static getInstance(): DevToolsService {
        DevToolsService._instance ??= new DevToolsService();
        return DevToolsService._instance;
    }

    /**
     * Register how to obtain TerminalService from the extension host (VS Code only).
     *
     * @param factory - Callback that returns a TerminalService-like instance.
     */
    public static setTerminalServiceFactory(factory: () => TerminalServiceLike): void {
        DevToolsService.terminalServiceFactory = factory;
    }

    /**
     * Inject a package installer callback. The extension sets this when the
     * full PythonEnvironmentApi (managePackages) is available.
     *
     * @param installer - Async callback that installs ansible-dev-tools.
     */
    public setPackageInstaller(installer: PackageInstaller): void {
        this._packageInstaller = installer;
    }

    /**
     * Indicates whether the service is running inside the VS Code extension host.
     *
     * @returns True when the vscode module is available.
     */
    public isInVSCode(): boolean {
        return vscode !== undefined;
    }

    /**
     * Indicates whether a package refresh is currently in progress.
     *
     * @returns True while adt package discovery is running.
     */
    public isLoading(): boolean {
        return this._loading;
    }

    /**
     * Indicates whether packages have been loaded at least once.
     *
     * @returns True after a successful refresh completes.
     */
    public isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * Returns the discovered ansible-dev-tools packages.
     *
     * @returns Installed tool packages with name, version, and optional path.
     */
    public getPackages(): DevToolPackage[] {
        return this._packages;
    }

    /**
     * Indicates whether any dev tool packages were discovered.
     *
     * @returns True when at least one package is loaded.
     */
    public hasPackages(): boolean {
        return this._packages.length > 0;
    }

    /**
     * Looks up a dev tool package by executable name.
     *
     * @param name - Package or tool name reported by adt --version.
     * @returns Matching package metadata, or undefined when not found.
     */
    public getPackage(name: string): DevToolPackage | undefined {
        return this._packages.find((p) => p.name === name);
    }

    /**
     * Reloads ansible-dev-tools packages from the active environment via adt --version.
     */
    public async refresh(): Promise<void> {
        if (this._loading) {
            return;
        }

        this._loading = true;
        this._packages = [];
        (this._onDidChange as { fire: () => void }).fire();

        try {
            await this._loadPackagesWithCommandService();
            this._loaded = true;
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Install ansible-dev-tools package.
     *
     * Uses the python-envs managePackages API when available (Layer 2).
     * Falls back to `pip install ansible-dev-tools` in an activated
     * terminal when only ms-python.python is present (Layer 3).
     */
    public async install(): Promise<void> {
        if (this._packageInstaller) {
            await this._packageInstaller();
            await this.refresh();
            return;
        }

        if (!this.isInVSCode()) {
            throw new Error('install is only available in VS Code');
        }

        if (!DevToolsService.terminalServiceFactory) {
            throw new Error(
                'Package installation is not available. Install the Python Environments extension (ms-python.vscode-python-envs) or ensure a Python environment is selected.',
            );
        }

        const TerminalService = DevToolsService.terminalServiceFactory();
        const terminalService = TerminalService.getInstance();
        const managed = await terminalService.createActivatedTerminal({
            name: 'Install ansible-dev-tools',
            show: true,
        });
        const result = await managed.sendCommand('pip install ansible-dev-tools', {
            waitForCompletion: true,
        });
        log('DevToolsService: terminal install complete, refreshing packages');
        await this.refresh();

        if (!this.hasPackages() && result.exitCode === undefined) {
            log('DevToolsService: shell integration unavailable, polling for packages');
            const maxAttempts = 12;
            const interval = 5000;
            for (let i = 0; i < maxAttempts; i++) {
                await new Promise((r) => setTimeout(r, interval));
                await this.refresh();
                if (this.hasPackages()) {
                    log(`DevToolsService: packages found after ${String(i + 1)} poll(s)`);
                    break;
                }
            }
        }
    }

    /**
     * Upgrade ansible-dev-tools package with eager strategy (VS Code only)
     */
    public async upgrade(): Promise<void> {
        if (!this.isInVSCode()) {
            throw new Error('upgrade is only available in VS Code');
        }

        if (!DevToolsService.terminalServiceFactory) {
            void vscode?.window.showInformationMessage('Upgrade is only available in VS Code.');
            return;
        }

        const TerminalService = DevToolsService.terminalServiceFactory();
        const terminalService = TerminalService.getInstance();
        const managed = await terminalService.createActivatedTerminal({
            name: 'Upgrade ansible-dev-tools',
            show: true,
        });
        await managed.sendCommand(
            'pip install --upgrade --upgrade-strategy eager ansible-dev-tools',
            {
                waitForCompletion: true,
            },
        );
        log('DevToolsService: upgrade complete, refreshing packages');
        await this.refresh();
    }

    /**
     * Common package loading logic using CommandService
     */
    private async _loadPackagesWithCommandService(): Promise<void> {
        try {
            const { getCommandService } = await import('./CommandService');
            const commandService = getCommandService();

            const adtPath = await commandService.getToolPath('adt');
            log(`DevToolsService: adt resolved to ${adtPath ?? 'not found'}`);
            const result = await commandService.runTool('adt', ['--version']);

            if (result.exitCode !== 0) {
                log('DevToolsService: adt not found or failed');
                this._packages = [];
                return;
            }

            const binDir = adtPath ? path.dirname(adtPath) : undefined;
            log(`DevToolsService: using binDir ${binDir ?? 'none'}`);

            // Parse the adt --version output
            const packages: DevToolPackage[] = [];
            const exeSuffix = process.platform === 'win32' ? '.exe' : '';
            const lines = result.stdout.trim().split('\n');
            for (const line of lines) {
                const match = /^(\S+)\s+(\S+)$/.exec(line);
                if (match) {
                    const toolPath = binDir ? path.join(binDir, match[1] + exeSuffix) : undefined;
                    packages.push({ name: match[1], version: match[2], location: toolPath });
                }
            }

            this._packages = packages;
            log(
                `DevToolsService: loaded ${String(packages.length)} packages from ${binDir ?? 'PATH'}`,
            );
        } catch (error) {
            console.error('DevToolsService: Failed to load packages:', error);
            this._packages = [];
        }
    }
}
