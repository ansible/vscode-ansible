import * as vscode from 'vscode';
import { DevToolsService } from '@ansible/core';
import type { DevToolPackage } from '@ansible/core';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import { log } from '@src/extension';

export class AnsibleDevToolsProvider implements vscode.TreeDataProvider<DevToolPackage> {
    private _onDidChangeTreeData: vscode.EventEmitter<DevToolPackage | undefined | null> =
        new vscode.EventEmitter<DevToolPackage | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<DevToolPackage | undefined | null> =
        this._onDidChangeTreeData.event;

    private _service: DevToolsService;
    private _envListener: vscode.Disposable | undefined;
    private _serviceListener: vscode.Disposable | undefined;
    private _refreshDebounce: ReturnType<typeof setTimeout> | undefined;

    constructor(pythonEnvService: PythonEnvironmentService) {
        this._service = DevToolsService.getInstance();

        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire(undefined);
        });

        void this._init(pythonEnvService);
    }

    private async _init(pythonEnvService: PythonEnvironmentService) {
        try {
            await pythonEnvService.initialize();

            this._envListener = pythonEnvService.onDidChangeEnvironment(() => {
                log('AnsibleDevToolsProvider: environment changed, scheduling refresh');
                if (this._refreshDebounce) {
                    clearTimeout(this._refreshDebounce);
                }
                this._refreshDebounce = setTimeout(() => {
                    this._refreshDebounce = undefined;
                    void this.refresh();
                }, 1000);
            });

            // Don't refresh eagerly — wait for the environment change event
            // which fires once the Python extension has discovered environments.
            // An eager refresh here would resolve tools from ~/.local/bin
            // because the venv hasn't been discovered yet.
            log('AnsibleDevToolsProvider: initialized, waiting for environment discovery');
        } catch (error) {
            log(
                `AnsibleDevToolsProvider: init failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    async refresh(): Promise<void> {
        await this._service.refresh();
    }

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

    getChildren(element?: DevToolPackage): Thenable<DevToolPackage[]> {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this._service.getPackages());
    }

    hasPackages(): boolean {
        return this._service.hasPackages();
    }

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
