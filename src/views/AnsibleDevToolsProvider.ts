import * as vscode from 'vscode';
import { DevToolsService } from '@ansible/developer-services';
import type { DevToolPackage } from '@ansible/developer-services';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import { log } from '@src/extension';

/** Tree view provider for installed Ansible developer tool packages. */
export class AnsibleDevToolsProvider implements vscode.TreeDataProvider<DevToolPackage> {
    private _onDidChangeTreeData: vscode.EventEmitter<DevToolPackage | undefined | null> =
        new vscode.EventEmitter<DevToolPackage | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<DevToolPackage | undefined | null> =
        this._onDidChangeTreeData.event;

    private _service: DevToolsService;
    private _envListener: vscode.Disposable | undefined;
    private _serviceListener: vscode.Disposable | undefined;
    private _refreshDebounce: ReturnType<typeof setTimeout> | undefined;

    /**
     * Create the provider and refresh when the active Python environment changes.
     * @param pythonEnvService - Service that reports Python environment changes
     */
    constructor(pythonEnvService: PythonEnvironmentService) {
        this._service = DevToolsService.getInstance();

        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            void vscode.commands.executeCommand(
                'setContext',
                'ansibleDevToolsPackages.hasPackages',
                this._service.hasPackages(),
            );
            this._onDidChangeTreeData.fire(undefined);
        });

        void this._init(pythonEnvService);
    }

    /**
     * Subscribe to environment changes and run an initial refresh once
     * the Python environment is settled.
     * @param pythonEnvService - Service used to observe environment changes
     */
    private async _init(pythonEnvService: PythonEnvironmentService) {
        try {
            await pythonEnvService.initialize();

            this._envListener = pythonEnvService.onDidChangeEnvironment(() => {
                log('AnsibleDevToolsProvider: environment changed, scheduling refresh');
                this._scheduleRefresh();
            });

            // initialize() has resolved, so the binDirResolver points at the
            // active venv. Refresh now to pick up already-installed tools.
            log('AnsibleDevToolsProvider: initialized, running initial refresh');
            this._scheduleRefresh();
        } catch (error) {
            log(
                `AnsibleDevToolsProvider: init failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Debounce rapid change events into a single refresh. */
    private _scheduleRefresh(): void {
        if (this._refreshDebounce) {
            clearTimeout(this._refreshDebounce);
        }
        this._refreshDebounce = setTimeout(() => {
            this._refreshDebounce = undefined;
            void this.refresh();
        }, 1000);
    }

    /** Reload developer tool packages from the active environment. */
    async refresh(): Promise<void> {
        await this._service.refresh();
    }

    /**
     * Render a developer tool package as a tree item.
     * @param element - Package entry to display
     * @returns Tree item showing package name, version, and install location
     */
    getTreeItem(element: DevToolPackage): vscode.TreeItem {
        const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
        item.description = element.version;
        item.iconPath = new vscode.ThemeIcon('package');
        item.contextValue = 'devToolPackage';
        if (element.location) {
            item.tooltip = element.location;
        }
        return item;
    }

    /**
     * Return installed developer tool packages at the tree root.
     * @param element - Parent node, which is unused because the tree is flat
     * @returns Installed packages, or an empty list for nested nodes
     */
    getChildren(element?: DevToolPackage): Thenable<DevToolPackage[]> {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this._service.getPackages());
    }

    /**
     * Whether any developer tool packages are currently available.
     * @returns True when at least one package is installed
     */
    hasPackages(): boolean {
        return this._service.hasPackages();
    }

    /** Release listeners and pending refresh timers. */
    dispose() {
        if (this._refreshDebounce) {
            clearTimeout(this._refreshDebounce);
        }
        this._envListener?.dispose();
        this._serviceListener?.dispose();
        this._onDidChangeTreeData.dispose();
    }
}

export type { DevToolPackage };
