import * as vscode from 'vscode';
import { DevToolsService } from '@ansible/core';
import type { DevToolPackage } from '@ansible/core';
import type { PythonEnvironmentService } from '../services/PythonEnvironmentService';

export class AnsibleDevToolsProvider implements vscode.TreeDataProvider<DevToolPackage> {
    private _onDidChangeTreeData: vscode.EventEmitter<DevToolPackage | undefined | null | void> = new vscode.EventEmitter<DevToolPackage | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DevToolPackage | undefined | null | void> = this._onDidChangeTreeData.event;

    private _service: DevToolsService;
    private _envListener: vscode.Disposable | undefined;
    private _serviceListener: vscode.Disposable | undefined;

    constructor(pythonEnvService: PythonEnvironmentService) {
        this._service = DevToolsService.getInstance();
        
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire();
        });
        
        this._init(pythonEnvService);
    }

    private async _init(pythonEnvService: PythonEnvironmentService) {
        try {
            await pythonEnvService.initialize();

            this._envListener = pythonEnvService.onDidChangeEnvironment(() => {
                this.refresh();
            });

            await this.refresh();
        } catch (error) {
            console.error('Failed to initialize AnsibleDevToolsProvider:', error);
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

export type { DevToolPackage };
