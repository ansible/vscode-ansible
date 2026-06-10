/**
 * Python Environment Service
 *
 * Centralized wrapper around Python environment extension APIs with automatic
 * fallback when the primary extension is unavailable or degraded.
 *
 * Resolution chain:
 *   1. ms-python.vscode-python-envs (primary — requires PET binary)
 *   2. ms-python.python environments API (fallback)
 *   3. PATH / environment cache (last resort, handled by CommandService)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PythonExtension, ResolvedEnvironment, Environment } from '@vscode/python-extension';
import type {
    PythonEnvironmentApi,
    PythonEnvironment,
    DidChangeEnvironmentEventArgs,
    GetEnvironmentScope,
    CreateEnvironmentOptions,
    PackageManagementOptions,
    SetEnvironmentScope,
} from '@ansible/core';
import { log } from '@src/extension';

const PYTHON_ENVS_EXTENSION_ID = 'ms-python.vscode-python-envs';
const PYTHON_EXT_ID = 'ms-python.python';
const READY_TIMEOUT_MS = 5000;

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export class PythonEnvironmentService implements vscode.Disposable {
    private static _instance: PythonEnvironmentService | undefined;
    private _pythonEnvApi: PythonEnvironmentApi | undefined;
    private _pythonExtApi: PythonExtension | undefined;
    private _petAvailable = false;
    private _initPromise: Promise<boolean> | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _changeDebounce: ReturnType<typeof setTimeout> | undefined;

    private _onDidChangeEnvironment = new vscode.EventEmitter<DidChangeEnvironmentEventArgs>();
    public readonly onDidChangeEnvironment = this._onDidChangeEnvironment.event;

    private constructor() {
        /* singleton */
    }

    public static getInstance(): PythonEnvironmentService {
        PythonEnvironmentService._instance ??= new PythonEnvironmentService();
        return PythonEnvironmentService._instance;
    }

    /**
     * Initialize the service.
     *
     * When the Environments extension is present it is always activated so
     * createEnvironment / managePackages work regardless of PET. If PET is
     * missing, ms-python.python is also initialized for environment discovery
     * (hybrid mode).
     */
    public async initialize(): Promise<boolean> {
        if (this._initPromise) {
            return this._initPromise;
        }
        this._initPromise = this._doInitialize();
        return this._initPromise;
    }

    private async _doInitialize(): Promise<boolean> {
        log(`Looking for Python Environments extension: ${PYTHON_ENVS_EXTENSION_ID}`);

        const envsExt =
            vscode.extensions.getExtension<PythonEnvironmentApi>(PYTHON_ENVS_EXTENSION_ID);

        if (envsExt) {
            this._petAvailable = this._isPetAvailable(envsExt.extensionPath);
            await this._initFromEnvsExtension(envsExt);

            if (!this._petAvailable) {
                log('PET binary not found — using ms-python.python for environment discovery');
                await this._initFromPythonExtension();
            }
        } else {
            log(
                `Python Environments extension (${PYTHON_ENVS_EXTENSION_ID}) not installed, trying ${PYTHON_EXT_ID}`,
            );
            await this._initFromPythonExtension();
        }

        return this._pythonEnvApi !== undefined || this._pythonExtApi !== undefined;
    }

    // -------------------------------------------------------------------------
    // PET detection
    // -------------------------------------------------------------------------

    private _isPetAvailable(extensionPath: string): boolean {
        const binary = process.platform === 'win32' ? 'pet.exe' : 'pet';
        const petPath = path.join(extensionPath, 'python-env-tools', 'bin', binary);
        const exists = fs.existsSync(petPath);
        log(`PET binary check: ${petPath} — ${exists ? 'found' : 'missing'}`);
        return exists;
    }

    // -------------------------------------------------------------------------
    // Primary: ms-python.vscode-python-envs
    // -------------------------------------------------------------------------

    private async _initFromEnvsExtension(
        ext: vscode.Extension<PythonEnvironmentApi>,
    ): Promise<void> {
        try {
            if (!ext.isActive) {
                log('Activating Python Environments extension...');
                await ext.activate();
            }

            const exports = ext.exports;
            if (typeof exports.getEnvironment === 'function') {
                this._pythonEnvApi = exports;

                if (this._pythonEnvApi.onDidChangeEnvironment) {
                    const listener = this._pythonEnvApi.onDidChangeEnvironment(() => {
                        this._fireChangeDebounced();
                    });
                    this._disposables.push(listener);
                }

                log('Python Environment Service initialized via Environments extension');
            } else {
                log('Python Environments extension found but API not available');
                await this._initFromPythonExtension();
            }
        } catch (error) {
            log(`Failed to activate Python Environments extension: ${formatError(error)}`);
            await this._initFromPythonExtension();
        }
    }

    // -------------------------------------------------------------------------
    // Fallback: ms-python.python
    // -------------------------------------------------------------------------

    private async _initFromPythonExtension(): Promise<void> {
        try {
            const pythonExt = vscode.extensions.getExtension(PYTHON_EXT_ID);
            if (!pythonExt) {
                log(`Python extension (${PYTHON_EXT_ID}) not installed`);
                return;
            }

            const api = await PythonExtension.api();

            await Promise.race([
                api.ready,
                new Promise<void>((resolve) => {
                    setTimeout(() => {
                        log(
                            `Python extension api.ready timed out after ${String(READY_TIMEOUT_MS)}ms — proceeding with partial discovery`,
                        );
                        resolve();
                    }, READY_TIMEOUT_MS);
                }),
            ]);

            this._pythonExtApi = api;

            this._disposables.push(
                api.environments.onDidChangeActiveEnvironmentPath(() => {
                    this._fireChangeDebounced();
                }),
                api.environments.onDidChangeEnvironments(() => {
                    this._fireChangeDebounced();
                }),
            );

            log('Python Environment Service initialized via Python extension (fallback)');
        } catch (error) {
            log(`Failed to initialize Python extension fallback: ${formatError(error)}`);
        }
    }

    // -------------------------------------------------------------------------
    // Adapter: map ms-python.python's ResolvedEnvironment → PythonEnvironment
    // -------------------------------------------------------------------------

    private _adaptResolvedEnvironment(resolved: ResolvedEnvironment): PythonEnvironment {
        const rawPath = resolved.executable.uri?.fsPath ?? '';
        const isVirtualEnv = !!resolved.environment?.folderUri;
        // Only resolve symlinks for system interpreters (collapses /bin → /usr/bin).
        // Venv pythons symlink to the system binary but are distinct environments.
        const executablePath = !isVirtualEnv && rawPath ? this._realPath(rawPath) : rawPath;
        const versionStr = resolved.version
            ? `${String(resolved.version.major)}.${String(resolved.version.minor)}.${String(resolved.version.micro)}`
            : '';

        const tools = (resolved as Environment).tools;
        const primaryTool = tools.length > 0 ? tools[0] : 'Unknown';
        const managerId = `${PYTHON_EXT_ID}:${primaryTool}`;

        let displayName: string;
        if (isVirtualEnv) {
            const envFolder = resolved.environment.folderUri.fsPath;
            const parentDir = path.basename(path.dirname(envFolder));
            const envDir = path.basename(envFolder);
            displayName = `Python ${versionStr} (${parentDir}/${envDir})`;
        } else {
            const shortPath = this._shortenPath(executablePath);
            displayName = `Python ${versionStr} (${shortPath})`;
        }

        return {
            envId: {
                id: resolved.id,
                managerId,
            },
            name: displayName,
            displayName,
            displayPath: executablePath,
            version: versionStr,
            environmentPath:
                resolved.environment?.folderUri ?? vscode.Uri.file(path.dirname(executablePath)),
            execInfo: {
                run: { executable: executablePath },
            },
            sysPrefix: resolved.executable.sysPrefix,
        };
    }

    /**
     * Shorten an executable path for display. Keeps the last three
     * segments (e.g. "/home/user/.pyenv/versions/3.9.7/bin/python"
     * → "3.9.7/bin/python"). Returns the full path when already short.
     */
    private _shortenPath(fullPath: string): string {
        const segments = fullPath.split(path.sep).filter(Boolean);
        if (segments.length <= 3) {
            return fullPath;
        }
        return segments.slice(-3).join(path.sep);
    }

    // -------------------------------------------------------------------------
    // Debounced change notification
    // -------------------------------------------------------------------------

    private static readonly _CHANGE_DEBOUNCE_MS = 1500;

    private _fireChangeDebounced(): void {
        if (this._changeDebounce) {
            clearTimeout(this._changeDebounce);
        }
        this._changeDebounce = setTimeout(() => {
            this._changeDebounce = undefined;
            this._onDidChangeEnvironment.fire({});
        }, PythonEnvironmentService._CHANGE_DEBOUNCE_MS);
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    public isAvailable(): boolean {
        return this._pythonEnvApi !== undefined || this._pythonExtApi !== undefined;
    }

    /**
     * Whether the full Environments extension API is active with PET
     * working. When true, environment discovery is fast and complete.
     */
    public hasFullApi(): boolean {
        return this._pythonEnvApi !== undefined && this._petAvailable;
    }

    /**
     * Whether environment creation and package management are available
     * (envs extension active, PET not required for these operations).
     */
    public hasEnvsExtension(): boolean {
        return this._pythonEnvApi !== undefined;
    }

    /**
     * Get the raw PythonEnvironmentApi. Returns undefined when only the
     * fallback is active or no Python extension is available.
     */
    public getApi(): PythonEnvironmentApi | undefined {
        return this._pythonEnvApi;
    }

    public async getEnvironment(
        scope?: GetEnvironmentScope,
    ): Promise<PythonEnvironment | undefined> {
        await this.initialize();

        let resolvedScope = scope;
        if (scope && !vscode.workspace.getWorkspaceFolder(scope)) {
            resolvedScope = vscode.workspace.workspaceFolders?.[0]?.uri;
        } else if (!scope) {
            resolvedScope = vscode.workspace.workspaceFolders?.[0]?.uri;
        }

        // When PET is available, the envs extension owns all state.
        if (this._pythonEnvApi && this._petAvailable) {
            try {
                return await this._pythonEnvApi.getEnvironment(resolvedScope);
            } catch (error) {
                log(`Error getting environment (envs API): ${formatError(error)}`);
            }
        }

        // Hybrid mode or python-ext-only: ms-python.python owns the
        // active environment, so query it directly.
        if (this._pythonExtApi) {
            try {
                const envPath =
                    this._pythonExtApi.environments.getActiveEnvironmentPath(resolvedScope);
                const resolved = await this._pythonExtApi.environments.resolveEnvironment(envPath);
                if (resolved) {
                    return this._adaptResolvedEnvironment(resolved);
                }
            } catch (error) {
                log(`Error getting environment (python ext): ${formatError(error)}`);
            }
        }

        return undefined;
    }

    public async getEnvironments(
        scope: vscode.Uri | 'all' | 'global' = 'all',
    ): Promise<PythonEnvironment[]> {
        await this.initialize();

        if (this._pythonEnvApi && this._petAvailable) {
            try {
                return await this._pythonEnvApi.getEnvironments(scope);
            } catch (error) {
                log(`Error getting environments (envs API): ${formatError(error)}`);
            }
        }

        if (this._pythonExtApi) {
            try {
                const results: PythonEnvironment[] = [];
                const seenPaths = new Set<string>();
                log(
                    `Fallback: environments.known has ${String(this._pythonExtApi.environments.known.length)} entries`,
                );
                for (const env of this._pythonExtApi.environments.known) {
                    const resolved = await this._pythonExtApi.environments.resolveEnvironment(env);
                    if (!resolved) {
                        continue;
                    }
                    const rawPath = resolved.executable.uri?.fsPath;
                    const isVirtualEnv = !!resolved.environment?.folderUri;
                    // Venv paths stay raw (they symlink to system python but are
                    // distinct envs). System paths get realpath to collapse aliases.
                    const dedupeKey = rawPath
                        ? isVirtualEnv
                            ? rawPath
                            : this._realPath(rawPath)
                        : undefined;
                    if (dedupeKey && seenPaths.has(dedupeKey)) {
                        continue;
                    }
                    if (dedupeKey) {
                        seenPaths.add(dedupeKey);
                    }
                    results.push(this._adaptResolvedEnvironment(resolved));
                }
                log(`Fallback: deduplicated to ${String(results.length)} environments`);
                return results;
            } catch (error) {
                log(`Error getting environments (python ext): ${formatError(error)}`);
            }
        }

        return [];
    }

    /**
     * Resolve symlinks to a canonical path. Returns the original path on error.
     */
    private _realPath(p: string): string {
        try {
            return fs.realpathSync(p);
        } catch {
            return p;
        }
    }

    public async getExecutablePath(scope?: GetEnvironmentScope): Promise<string | undefined> {
        const env = await this.getEnvironment(scope);
        return env?.execInfo.run.executable;
    }

    public async setEnvironment(
        scope: SetEnvironmentScope,
        environment?: PythonEnvironment,
    ): Promise<void> {
        await this.initialize();

        log(
            `setEnvironment: env=${environment?.displayName ?? ''}, executable=${environment?.execInfo.run.executable ?? ''}, petAvailable=${String(this._petAvailable)}`,
        );

        // When PET is available, the envs extension owns discovery AND selection.
        if (this._pythonEnvApi && this._petAvailable) {
            log('setEnvironment: using envs extension API (PET available)');
            await this._pythonEnvApi.setEnvironment(scope, environment);
            return;
        }

        // Hybrid mode or python-ext-only: environments were discovered by
        // ms-python.python, so we must use its API to switch.
        if (this._pythonExtApi) {
            try {
                if (environment?.execInfo.run.executable) {
                    const resource = scope instanceof vscode.Uri ? scope : undefined;
                    log(
                        `setEnvironment: calling updateActiveEnvironmentPath(${environment.execInfo.run.executable})`,
                    );
                    await this._pythonExtApi.environments.updateActiveEnvironmentPath(
                        environment.execInfo.run.executable,
                        resource,
                    );
                    log('setEnvironment: updateActiveEnvironmentPath succeeded');
                } else {
                    log('setEnvironment: no executable, opening interpreter picker');
                    await vscode.commands.executeCommand('python.setInterpreter');
                }
                return;
            } catch (error) {
                log(`setEnvironment: updateActiveEnvironmentPath failed: ${formatError(error)}`);
                vscode.window.showErrorMessage(
                    "Unable to set Python environment. Please use the Python extension's interpreter picker.",
                );
            }
        }

        log('setEnvironment: no API available to set environment');
    }

    public async createEnvironment(
        scope: vscode.Uri | vscode.Uri[] | 'global',
        options?: CreateEnvironmentOptions,
    ): Promise<PythonEnvironment | undefined> {
        if (!this._pythonEnvApi) {
            vscode.window.showWarningMessage(
                'Environment creation requires the Python Environments extension (ms-python.vscode-python-envs).',
            );
            return undefined;
        }
        return this._pythonEnvApi.createEnvironment(scope, options);
    }

    public async managePackages(
        environment: PythonEnvironment,
        options: PackageManagementOptions,
    ): Promise<void> {
        if (!this._pythonEnvApi) {
            throw new Error(
                'Package management requires the Python Environments extension (ms-python.vscode-python-envs).',
            );
        }
        return this._pythonEnvApi.managePackages(environment, options);
    }

    public async createTerminal(
        environment: PythonEnvironment,
        options: vscode.TerminalOptions,
    ): Promise<vscode.Terminal> {
        if (!this._pythonEnvApi) {
            return vscode.window.createTerminal(options);
        }
        return this._pythonEnvApi.createTerminal(environment, options);
    }

    /**
     * Event for terminal activation state changes. Only available with the
     * full Environments extension API.
     */
    public get onDidChangeTerminalActivationState() {
        return this._pythonEnvApi?.onDidChangeTerminalActivationState;
    }

    public dispose(): void {
        if (this._changeDebounce) {
            clearTimeout(this._changeDebounce);
        }
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
        this._onDidChangeEnvironment.dispose();
    }
}
