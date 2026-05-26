import * as vscode from 'vscode';
import { DevToolsService } from '@ansible/core';
import type { DevToolPackage, PythonEnvironmentApi } from '@ansible/core';

export class AnsibleDevToolsProvider implements vscode.TreeDataProvider<DevToolPackage> {
    private _onDidChangeTreeData: vscode.EventEmitter<DevToolPackage | undefined | null | void> = new vscode.EventEmitter<DevToolPackage | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DevToolPackage | undefined | null | void> = this._onDidChangeTreeData.event;

    private _service: DevToolsService;
    private _pythonEnvApi: PythonEnvironmentApi | undefined;
    private _envListener: vscode.Disposable | undefined;
    private _serviceListener: vscode.Disposable | undefined;

    constructor() {
        this._service = DevToolsService.getInstance();
        
        // Listen for service changes
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire();
        });
        
        this._initPythonEnvApi();
    }

    private async _initPythonEnvApi() {
        try {
            const pythonEnvExtension = vscode.extensions.getExtension<PythonEnvironmentApi>('ms-python.vscode-python-envs');
            if (pythonEnvExtension) {
                if (!pythonEnvExtension.isActive) {
                    await pythonEnvExtension.activate();
                }
                this._pythonEnvApi = pythonEnvExtension.exports;
                
                // Listen for environment changes
                if (this._pythonEnvApi.onDidChangeEnvironment) {
                    this._envListener = this._pythonEnvApi.onDidChangeEnvironment(() => {
                        this.refresh();
                    });
                }
                
                // Initial load
                await this.refresh();
            }
        } catch (error) {
            console.error('Failed to get Python Environments API:', error);
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
        this._envListener?.dispose();
        this._serviceListener?.dispose();
        this._onDidChangeTreeData.dispose();
    }
}

// Re-export the DevToolPackage type for backwards compatibility
export type { DevToolPackage };
