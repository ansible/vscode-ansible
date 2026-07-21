import * as vscode from 'vscode';
import type { PythonEnvironment, SidebarEnvManagerInput } from '@ansible/developer-services';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';

/** NavTree data source for Python environment managers and their environments. */
export class EnvironmentManagersController {
    private _onDidChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

    private _pythonEnvService: PythonEnvironmentService;
    private _managers = new Map<string, PythonEnvironment[]>();
    private _envListener: vscode.Disposable | undefined;
    private _currentExecPath: string | undefined;
    private _currentManagerId: string | undefined;
    private _refreshDebounce: ReturnType<typeof setTimeout> | undefined;

    /**
     * Create the provider and load environments from the Python extension.
     * @param pythonEnvService - Service used to discover Python environments
     */
    constructor(pythonEnvService: PythonEnvironmentService) {
        this._pythonEnvService = pythonEnvService;
        void this._init();
    }

    /** Initialize environment discovery and subscribe to environment changes. */
    private async _init() {
        try {
            await this._pythonEnvService.initialize();

            this._envListener = this._pythonEnvService.onDidChangeEnvironment(() => {
                this._debouncedRefresh();
            });

            await this._doRefresh();
        } catch (error) {
            console.error('Failed to initialize EnvironmentManagersController:', error);
        }
    }

    /**
     * Reload Python environments and refresh the tree.
     * @returns Resolves when the refresh is complete
     */
    async refresh(): Promise<void> {
        return this._doRefresh();
    }

    /**
     * Debounce rapid-fire change events so we only refresh once after the
     * Python extension finishes its discovery burst.
     */
    private _debouncedRefresh(): void {
        if (this._refreshDebounce) {
            clearTimeout(this._refreshDebounce);
        }
        this._refreshDebounce = setTimeout(() => {
            this._refreshDebounce = undefined;
            void this._doRefresh();
        }, 500);
    }

    /** Reload environments and notify tree listeners of the update. */
    private async _doRefresh(): Promise<void> {
        try {
            await this._loadEnvironments();
        } finally {
            this._onDidChange.fire(undefined);
        }
    }

    /** Populate manager groups from the Python environment service. */
    private async _loadEnvironments(): Promise<void> {
        const managers = new Map<string, PythonEnvironment[]>();

        if (!this._pythonEnvService.isAvailable()) {
            this._managers = managers;
            return;
        }

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
            const currentEnv = await this._pythonEnvService.getEnvironment(workspaceFolder);
            this._currentExecPath = currentEnv?.execInfo.run.executable;
            this._currentManagerId = currentEnv?.envId.managerId;

            const environments = await this._pythonEnvService.getEnvironments('all');

            for (const env of environments) {
                const managerId = env.envId.managerId;
                if (!managers.has(managerId)) {
                    managers.set(managerId, []);
                }
                managers.get(managerId)?.push(env);
            }
        } catch (error) {
            console.error('Failed to load environments:', error);
        }

        this._managers = managers;
    }

    /**
     * Whether the environment matches the currently selected interpreter.
     * @param env - Python environment to compare against the active selection
     * @returns True when the environment executable matches the current one
     */
    private _isCurrent(env: PythonEnvironment): boolean {
        if (!this._currentExecPath) {
            return false;
        }
        return env.execInfo.run.executable === this._currentExecPath;
    }

    /**
     * Convert a manager identifier into a user-friendly tree label.
     * @param managerId - Raw manager ID from the Python extension
     * @returns Display name for the environment manager group
     */
    private _getManagerDisplayName(managerId: string): string {
        const parts = managerId.split(':');
        const name = parts[parts.length - 1] || managerId;
        const lower = name.toLowerCase();

        // Map known tool/type names to friendly labels
        if (lower === 'system' || lower === 'unknown') {
            return 'Global';
        }
        if (lower === 'venv' || lower === 'virtualenv') {
            return 'venv';
        }
        if (lower === 'conda') {
            return 'Conda';
        }
        if (lower === 'pyenv') {
            return 'Pyenv';
        }
        if (lower === 'poetry') {
            return 'Poetry';
        }
        if (lower === 'pipenv') {
            return 'Pipenv';
        }

        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    /**
     * Whether the manager ID represents a virtual environment manager.
     * @param managerId - Raw manager ID from the Python extension
     * @returns True for venv-style managers
     */
    private _isVenvManager(managerId: string): boolean {
        const name = managerId.split(':').pop()?.toLowerCase() ?? '';
        return name === 'venv' || name === 'virtualenv' || name === 'virtualenvwrapper';
    }

    /**
     * Whether the manager ID represents a global/system Python installation.
     * @param managerId - Raw manager ID from the Python extension
     * @returns True for global or unknown system managers
     */
    private _isGlobalManager(managerId: string): boolean {
        const name = managerId.split(':').pop()?.toLowerCase() ?? '';
        return name === 'system' || name === 'unknown';
    }

    /**
     * Export manager/env rows for the host-agnostic sidebar NavTree (ADR-025).
     * @returns Plain env-manager input without vscode types
     */
    getSidebarEnvManagers(): SidebarEnvManagerInput[] {
        const managers: SidebarEnvManagerInput[] = [];
        for (const [managerId, environments] of this._managers) {
            const isGlobal = this._isGlobalManager(managerId);
            managers.push({
                id: managerId,
                name: this._getManagerDisplayName(managerId),
                isGlobal,
                environments: environments.map((env) => ({
                    id: env.envId.id,
                    label: env.displayName || env.name,
                    version: env.version,
                    path: env.sysPrefix || env.displayPath,
                    selected: this._isCurrent(env),
                    warning: isGlobal,
                })),
            });
        }
        managers.sort((a, b) => {
            const aIsVenv = this._isVenvManager(a.id);
            const bIsVenv = this._isVenvManager(b.id);
            if (aIsVenv !== bIsVenv) {
                return aIsVenv ? -1 : 1;
            }
            if (a.isGlobal !== b.isGlobal) {
                return a.isGlobal ? 1 : -1;
            }
            return a.name.localeCompare(b.name);
        });
        return managers;
    }

    /** Release listeners and pending refresh timers. */
    dispose() {
        if (this._refreshDebounce) {
            clearTimeout(this._refreshDebounce);
        }
        this._envListener?.dispose();
        this._onDidChange.dispose();
    }
}
