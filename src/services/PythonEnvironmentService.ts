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
} from '@ansible/developer-services';
import { log } from '@src/extension';

const PYTHON_ENVS_EXTENSION_ID = 'ms-python.vscode-python-envs';
const PYTHON_EXT_ID = 'ms-python.python';
const READY_TIMEOUT_MS = 5000;

/**
 * Tiered capability levels describing how much Python environment
 * functionality is available in this editor session.
 *
 * - `full`        — python-envs extension + PET binary (best UX)
 * - `envs-no-pet` — python-envs extension active but PET binary missing
 * - `python-only` — only ms-python.python; terminal fallbacks for writes
 * - `unavailable` — no Python extension at all
 */
export type PythonEnvCapability = 'full' | 'envs-no-pet' | 'python-only' | 'unavailable';

/**
 * Convert an unknown thrown value into a log-safe error message.
 * @param error - Error object or value to stringify
 * @returns Human-readable error message text
 */
function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Centralized wrapper around Python environment extension APIs with fallbacks. */
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

    /** Private constructor for the singleton Python environment service. */
    private constructor() {
        /* singleton */
    }

    /**
     * Return the shared Python environment service instance.
     * @returns Singleton PythonEnvironmentService instance
     */
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
     * @returns True when at least one Python environment API is available
     */
    public async initialize(): Promise<boolean> {
        if (this._initPromise) {
            return this._initPromise;
        }
        this._initPromise = this._doInitialize();
        return this._initPromise;
    }

    /**
     * Resolve and initialize the best available Python environment API.
     * @returns True when at least one backend was successfully initialized
     */
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

    /**
     * Check whether the Python Environment Tools binary is installed.
     * @param extensionPath - Installed Python Environments extension path
     * @returns True when the PET binary exists for the current platform
     */
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

    /**
     * Initialize from the primary ms-python.vscode-python-envs extension.
     * @param ext - The VS Code extension instance for Python Environments
     */
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

    /** Initialize from the fallback ms-python.python extension. */
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

    /**
     * Map a ms-python.python ResolvedEnvironment to the PythonEnvironment interface.
     * @param resolved - Resolved environment from the Python extension
     * @returns Normalized PythonEnvironment with display metadata
     */
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
     * @param fullPath - Absolute path to the Python executable
     * @returns Shortened display path
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

    /** Coalesce rapid environment change events into a single notification. */
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

    /**
     * Whether any Python environment API backend is available.
     * @returns True if at least one backend was initialized
     */
    public isAvailable(): boolean {
        return this._pythonEnvApi !== undefined || this._pythonExtApi !== undefined;
    }

    /**
     * Whether the full Environments extension API is active with PET
     * working. When true, environment discovery is fast and complete.
     * @returns True when PET-backed discovery is active
     */
    public hasFullApi(): boolean {
        return this._pythonEnvApi !== undefined && this._petAvailable;
    }

    /**
     * Whether environment creation and package management are available
     * (envs extension active, PET not required for these operations).
     * @returns True when the Environments extension API is available
     */
    public hasEnvsExtension(): boolean {
        return this._pythonEnvApi !== undefined;
    }

    // -------------------------------------------------------------------------
    // Capability model
    // -------------------------------------------------------------------------

    /**
     * Return the current capability tier for this session.
     * @returns The highest capability level available
     */
    public getCapability(): PythonEnvCapability {
        if (this._pythonEnvApi && this._petAvailable) return 'full';
        if (this._pythonEnvApi) return 'envs-no-pet';
        if (this._pythonExtApi) return 'python-only';
        return 'unavailable';
    }

    /**
     * Whether the Environments extension API should be used for write
     * operations (create environment, manage packages).
     * @returns True when Layer 2 (python-envs) is available
     */
    public prefersEnvsExtension(): boolean {
        const cap = this.getCapability();
        return cap === 'full' || cap === 'envs-no-pet';
    }

    /**
     * Whether a venv can be created, either via API or terminal fallback.
     * @returns True when at least Layer 3 is available
     */
    public canCreateEnvironment(): boolean {
        return this.getCapability() !== 'unavailable';
    }

    /**
     * Whether packages can be installed, either via API or terminal fallback.
     * @returns True when at least Layer 3 is available
     */
    public canInstallPackages(): boolean {
        return this.getCapability() !== 'unavailable';
    }

    /**
     * Return the active write path for UI labels and logging.
     * @returns 'api' when python-envs handles writes, 'terminal' for fallback, 'none' otherwise
     */
    public getActiveWritePath(): 'api' | 'terminal' | 'none' {
        if (this.prefersEnvsExtension()) return 'api';
        if (this.isAvailable()) return 'terminal';
        return 'none';
    }

    /**
     * Return a user-facing hint when a recommended extension is missing.
     * @returns Install recommendation string, or undefined when fully capable
     */
    public getMissingExtensionHint(): string | undefined {
        const cap = this.getCapability();
        if (cap === 'python-only') {
            return 'Install the Python Environments extension (ms-python.vscode-python-envs) for the best experience.';
        }
        if (cap === 'unavailable') {
            return 'Install the Python extension (ms-python.python) to enable environment management.';
        }
        return undefined;
    }

    /**
     * Get the raw PythonEnvironmentApi. Returns undefined when only the
     * fallback is active or no Python extension is available.
     * @returns The raw API, or undefined when unavailable
     */
    public getApi(): PythonEnvironmentApi | undefined {
        return this._pythonEnvApi;
    }

    /**
     * Resolve the active Python environment for a workspace scope.
     * @param scope - Workspace URI to query, defaults to first workspace folder
     * @returns The active environment, or undefined if none is configured
     */
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

    /**
     * List all discovered Python environments, deduplicated by executable path.
     * @param scope - Filter scope: a workspace URI, 'all', or 'global'
     * @returns Array of discovered Python environments
     */
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
     * @param p - File system path to resolve
     * @returns Canonical path with symlinks resolved
     */
    private _realPath(p: string): string {
        try {
            return fs.realpathSync(p);
        } catch {
            return p;
        }
    }

    /**
     * Get the Python executable path for a workspace scope.
     * @param scope - Workspace URI to query
     * @returns Absolute path to the Python binary, or undefined
     */
    public async getExecutablePath(scope?: GetEnvironmentScope): Promise<string | undefined> {
        const env = await this.getEnvironment(scope);
        return env?.execInfo.run.executable;
    }

    /**
     * Switch the active Python environment for a workspace scope.
     * @param scope - Workspace URI or scope to update
     * @param environment - Environment to activate, or undefined to open the picker
     */
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

    /**
     * Create a new Python virtual environment.
     *
     * When python-envs is available (Layer 2), delegates to its
     * `createEnvironment` wizard. Otherwise falls back to terminal
     * `python -m venv` and selects the new environment automatically.
     *
     * @param scope - Workspace URI(s) or 'global' for the environment location
     * @param options - Creation options (manager, packages, etc.)
     * @returns The newly created environment, or undefined if creation was cancelled
     */
    public async createEnvironment(
        scope: vscode.Uri | vscode.Uri[] | 'global',
        options?: CreateEnvironmentOptions,
    ): Promise<PythonEnvironment | undefined> {
        if (this._pythonEnvApi) {
            return this._pythonEnvApi.createEnvironment(scope, options);
        }

        if (!this._pythonExtApi) {
            vscode.window.showWarningMessage(
                'Environment creation requires at least the Python extension (ms-python.python).',
            );
            return undefined;
        }

        return this._createEnvironmentViaTerminal(scope, options);
    }

    /**
     * Terminal fallback for venv creation when python-envs is not installed.
     * Resolves the active interpreter from ms-python.python and uses its
     * exact path (avoids `python` vs `python3` portability issues on macOS).
     * When {@link CreateEnvironmentOptions.additionalPackages} is set, installs
     * those packages into the new venv with `python -m pip` after creation.
     * @param scope - workspace URI(s) or 'global' indicating where to create the venv
     * @param options - Optional create options (additional packages)
     * @returns the newly created Python environment, or undefined if cancelled/failed
     */
    private async _createEnvironmentViaTerminal(
        scope: vscode.Uri | vscode.Uri[] | 'global',
        options?: CreateEnvironmentOptions,
    ): Promise<PythonEnvironment | undefined> {
        const workspaceUri = Array.isArray(scope)
            ? scope[0]
            : scope === 'global'
              ? vscode.workspace.workspaceFolders?.[0]?.uri
              : scope;

        if (!workspaceUri) {
            vscode.window.showErrorMessage(
                'No workspace folder available for environment creation.',
            );
            return undefined;
        }

        const pyApi = this._pythonExtApi;
        let pythonExe = 'python3';
        if (pyApi) {
            const activeEnvPath = pyApi.environments.getActiveEnvironmentPath(workspaceUri);
            const activeResolved = await pyApi.environments.resolveEnvironment(activeEnvPath);
            pythonExe = activeResolved?.executable.uri?.fsPath ?? 'python3';
        }

        const venvName = await vscode.window.showInputBox({
            title: 'Create Python Virtual Environment',
            prompt: 'Enter the virtual environment directory name',
            value: '.venv',
            validateInput: (value) => {
                if (!value.trim()) return 'Name cannot be empty';
                if (/[/\\]/.test(value)) return 'Name cannot contain path separators';
                return undefined;
            },
        });

        if (!venvName) return undefined;

        const venvDir = path.join(workspaceUri.fsPath, venvName);
        if (fs.existsSync(venvDir)) {
            const overwrite = await vscode.window.showWarningMessage(
                `Directory "${venvName}" already exists. Overwrite?`,
                'Overwrite',
                'Cancel',
            );
            if (overwrite !== 'Overwrite') return undefined;
        }

        const cmd =
            process.platform === 'win32'
                ? `"${pythonExe}" -m venv "${venvName}"`
                : `'${pythonExe.replace(/'/g, "'\\''")}' -m venv '${venvName.replace(/'/g, "'\\''")}'`;
        log(`Creating venv via terminal: ${cmd} in ${workspaceUri.fsPath}`);

        const terminal = vscode.window.createTerminal({
            name: `Create venv: ${venvName}`,
            cwd: workspaceUri,
        });
        terminal.show();

        const pythonBin =
            process.platform === 'win32'
                ? path.join(venvDir, 'Scripts', 'python.exe')
                : path.join(venvDir, 'bin', 'python');

        await new Promise<void>((resolve) => {
            const shellIntegration = (
                terminal as {
                    shellIntegration?: {
                        onDidEndCommandExecution?: (
                            cb: (e: { exitCode: number | undefined }) => void,
                        ) => { dispose(): void };
                    };
                }
            ).shellIntegration;

            const onEnd = shellIntegration?.onDidEndCommandExecution;
            if (onEnd) {
                const listener = onEnd((e) => {
                    listener.dispose();
                    if (e.exitCode !== 0) {
                        vscode.window.showErrorMessage(
                            `Failed to create virtual environment (exit code ${String(e.exitCode ?? 'unknown')}).`,
                        );
                    }
                    resolve();
                });
                terminal.sendText(cmd);
            } else {
                terminal.sendText(cmd);
                setTimeout(resolve, 5000);
            }
        });

        if (!fs.existsSync(pythonBin)) {
            vscode.window.showErrorMessage(
                `Virtual environment creation failed — ${pythonBin} not found.`,
            );
            return undefined;
        }

        const extraPackages = options?.additionalPackages?.filter(Boolean) ?? [];
        if (extraPackages.length > 0) {
            const pkgList = extraPackages.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(' ');
            const pipCmd =
                process.platform === 'win32'
                    ? `"${pythonBin}" -m pip install ${extraPackages.join(' ')}`
                    : `'${pythonBin.replace(/'/g, "'\\''")}' -m pip install ${pkgList}`;
            log(`Installing packages into new venv: ${pipCmd}`);
            await new Promise<void>((resolve) => {
                const shellIntegration = (
                    terminal as {
                        shellIntegration?: {
                            onDidEndCommandExecution?: (
                                cb: (e: { exitCode: number | undefined }) => void,
                            ) => { dispose(): void };
                        };
                    }
                ).shellIntegration;
                const onEnd = shellIntegration?.onDidEndCommandExecution;
                if (onEnd) {
                    const listener = onEnd((e) => {
                        listener.dispose();
                        if (e.exitCode !== 0) {
                            vscode.window.showWarningMessage(
                                `Virtual environment created, but package install exited with code ${String(e.exitCode ?? 'unknown')}. Use Install ansible-dev-tools to retry.`,
                            );
                        }
                        resolve();
                    });
                    terminal.sendText(pipCmd);
                } else {
                    terminal.sendText(pipCmd);
                    // Best-effort wait when shell integration is unavailable
                    setTimeout(resolve, 60_000);
                }
            });
        }

        log(`Venv created, selecting: ${pythonBin}`);
        if (pyApi) {
            try {
                await pyApi.environments.updateActiveEnvironmentPath(pythonBin, workspaceUri);
            } catch (error) {
                log(`Failed to select new venv: ${formatError(error)}`);
            }
        }

        this._fireChangeDebounced();

        if (!pyApi) return undefined;
        const resolved = await pyApi.environments.resolveEnvironment(pythonBin);
        return resolved ? this._adaptResolvedEnvironment(resolved) : undefined;
    }

    /**
     * Install or uninstall packages in a Python environment.
     * @param environment - Target environment for package operations
     * @param options - Package management options (install, uninstall, etc.)
     * @returns Resolves when the package operation completes
     */
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

    /**
     * Create a terminal activated with the given Python environment.
     * @param environment - Python environment to activate in the terminal
     * @param options - VS Code terminal creation options
     * @returns The created terminal instance
     */
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
     * @returns The event, or undefined when the Environments API is not active
     */
    public get onDidChangeTerminalActivationState() {
        return this._pythonEnvApi?.onDidChangeTerminalActivationState;
    }

    /** Release all subscriptions and timers held by this service. */
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
