import * as vscode from 'vscode';
import type { PythonEnvironment } from '@ansible/developer-services';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';

type TreeNode = ManagerNode | EnvironmentNode;

interface ManagerNode {
    type: 'manager';
    id: string;
    name: string;
    environments: PythonEnvironment[];
}

interface EnvironmentNode {
    type: 'environment';
    environment: PythonEnvironment;
    managerId: string;
}

/** Tree view provider for Python environment managers and their environments. */
export class EnvironmentManagersProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null> =
        new vscode.EventEmitter<TreeNode | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null> =
        this._onDidChangeTreeData.event;

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
            console.error('Failed to initialize EnvironmentManagersProvider:', error);
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
            this._onDidChangeTreeData.fire(undefined);
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
     * Render a manager group or individual Python environment node.
     * @param element - Tree node to display
     * @returns Tree item with warnings for discouraged global environments
     */
    getTreeItem(element: TreeNode): vscode.TreeItem {
        if (element.type === 'manager') {
            const isVenv = this._isVenvManager(element.id);
            const isGlobal = this._isGlobalManager(element.id);
            const isGlobalEnvSelected =
                this._currentManagerId && this._isGlobalManager(this._currentManagerId);

            const item = new vscode.TreeItem(
                element.name,
                isVenv
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed,
            );

            if (isGlobal && isGlobalEnvSelected) {
                item.iconPath = new vscode.ThemeIcon(
                    'globe',
                    new vscode.ThemeColor('problemsWarningIcon.foreground'),
                );
                const tooltip = new vscode.MarkdownString(
                    '$(warning) **Global Python Environment Selected**\n\n' +
                        'Use of global Python environments for Ansible development is strongly discouraged.\n\n' +
                        'Please create and select a virtual environment instead.',
                );
                tooltip.supportThemeIcons = true;
                item.tooltip = tooltip;
                item.description = '⚠️ not recommended';
            } else if (isGlobal) {
                item.iconPath = new vscode.ThemeIcon('globe');
            } else {
                item.iconPath = new vscode.ThemeIcon('folder');
            }
            item.contextValue = 'envManager';
            return item;
        } else {
            const env = element.environment;
            const isCurrent = this._isCurrent(env);
            const isGlobalEnv = this._isGlobalManager(element.managerId);

            const item = new vscode.TreeItem(
                env.displayName || env.name,
                vscode.TreeItemCollapsibleState.None,
            );
            if (isCurrent) {
                item.iconPath = new vscode.ThemeIcon(
                    'check',
                    new vscode.ThemeColor('charts.green'),
                );
            } else if (isGlobalEnv) {
                item.iconPath = new vscode.ThemeIcon(
                    'symbol-misc',
                    new vscode.ThemeColor('problemsWarningIcon.foreground'),
                );
            } else {
                item.iconPath = new vscode.ThemeIcon('symbol-misc');
            }
            item.contextValue = isCurrent ? 'pythonEnvironmentCurrent' : 'pythonEnvironment';

            const tooltip = new vscode.MarkdownString();
            tooltip.supportThemeIcons = true;
            if (isGlobalEnv) {
                tooltip.appendMarkdown(
                    '$(warning) **Not recommended for Ansible development**\n\n',
                );
            }
            tooltip.appendMarkdown(`**${env.displayName}**\n\n`);
            tooltip.appendMarkdown(`Version: ${env.version}\n\n`);
            tooltip.appendMarkdown(`Path: ${env.sysPrefix || env.displayPath}`);
            item.tooltip = tooltip;

            item.command = {
                command: 'ansibleDevTools.selectEnvironment',
                title: 'Select Environment',
                arguments: [env],
            };

            return item;
        }
    }

    /**
     * Return manager groups at the root or environments within a manager.
     * @param element - Parent node whose children should be listed
     * @returns Manager nodes or environment nodes for the requested level
     */
    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            const managers: ManagerNode[] = [];
            for (const [managerId, environments] of this._managers) {
                managers.push({
                    type: 'manager',
                    id: managerId,
                    name: this._getManagerDisplayName(managerId),
                    environments,
                });
            }
            // Sort: venv first, then alphabetical, Global last
            managers.sort((a, b) => {
                const aIsVenv = this._isVenvManager(a.id);
                const bIsVenv = this._isVenvManager(b.id);
                const aIsGlobal = this._isGlobalManager(a.id);
                const bIsGlobal = this._isGlobalManager(b.id);
                if (aIsVenv !== bIsVenv) {
                    return aIsVenv ? -1 : 1;
                }
                if (aIsGlobal !== bIsGlobal) {
                    return aIsGlobal ? 1 : -1;
                }
                return a.name.localeCompare(b.name);
            });
            return Promise.resolve(managers);
        } else if (element.type === 'manager') {
            const envNodes: EnvironmentNode[] = element.environments.map((env) => ({
                type: 'environment',
                environment: env,
                managerId: element.id,
            }));
            envNodes.sort((a, b) =>
                (a.environment.displayName || a.environment.name).localeCompare(
                    b.environment.displayName || b.environment.name,
                ),
            );
            return Promise.resolve(envNodes);
        }

        return Promise.resolve([]);
    }

    /** Release listeners and pending refresh timers. */
    dispose() {
        if (this._refreshDebounce) {
            clearTimeout(this._refreshDebounce);
        }
        this._envListener?.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
