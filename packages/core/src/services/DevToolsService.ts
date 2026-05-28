// Conditional vscode import - only used when available
let vscode: typeof import('vscode') | undefined;
try {
    vscode = require('vscode');
} catch {
    // Running standalone (not in VS Code)
}

import * as path from 'path';
import { SimpleEventEmitter } from '../utils/SimpleEventEmitter';
import { log } from '../utils/logging';

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
    private _packageInstaller: PackageInstaller | undefined;
    private _packages: DevToolPackage[] = [];
    private _loading: boolean = false;
    private _loaded: boolean = false;
    private _onDidChange: SimpleEventEmitter<void> | { fire: () => void; event: unknown };
    public readonly onDidChange: unknown;

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
     * Inject a package installer callback. The extension sets this when the
     * full PythonEnvironmentApi (managePackages) is available.
     */
    public setPackageInstaller(installer: PackageInstaller): void {
        this._packageInstaller = installer;
    }

    public isInVSCode(): boolean {
        return vscode !== undefined;
    }

    public isLoading(): boolean {
        return this._loading;
    }

    public isLoaded(): boolean {
        return this._loaded;
    }

    public getPackages(): DevToolPackage[] {
        return this._packages;
    }

    public hasPackages(): boolean {
        return this._packages.length > 0;
    }

    public getPackage(name: string): DevToolPackage | undefined {
        return this._packages.find(p => p.name === name);
    }

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
     * Install ansible-dev-tools package (VS Code only, requires full API)
     */
    public async install(): Promise<void> {
        if (!this._packageInstaller) {
            throw new Error(
                'Package installation requires the Python Environments extension (ms-python.vscode-python-envs).',
            );
        }
        await this._packageInstaller();
        await this.refresh();
    }

    /**
     * Upgrade ansible-dev-tools package with eager strategy (VS Code only)
     */
    public async upgrade(): Promise<void> {
        if (!vscode) {
            throw new Error('upgrade is only available in VS Code');
        }

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
        await managed.sendCommand('pip install --upgrade --upgrade-strategy eager ansible-dev-tools', { waitForCompletion: true });
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
                const match = line.match(/^(\S+)\s+(\S+)$/);
                if (match) {
                    const toolPath = binDir ? path.join(binDir, match[1] + exeSuffix) : undefined;
                    packages.push({ name: match[1], version: match[2], location: toolPath });
                }
            }

            this._packages = packages;
            log(`DevToolsService: loaded ${packages.length} packages from ${binDir ?? 'PATH'}`);
        } catch (error) {
            console.error('DevToolsService: Failed to load packages:', error);
            this._packages = [];
        }
    }
}
