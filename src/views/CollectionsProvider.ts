import * as vscode from 'vscode';
import { CollectionsService, CollectionInfo, PluginInfo } from '@ansible/core';
import type { PythonEnvironmentService } from '../services/PythonEnvironmentService';
import { log } from '../extension';

type TreeNode = CollectionNode | PluginTypeNode | PluginNode | LoadingNode;

interface LoadingNode {
    type: 'loading';
}

interface CollectionNode {
    type: 'collection';
    name: string;
    info: CollectionInfo;
    pluginTypes: Map<string, PluginInfo[]>;
}

interface PluginTypeNode {
    type: 'pluginType';
    name: string;
    collectionName: string;
    plugins: PluginInfo[];
}

interface PluginNode {
    type: 'plugin';
    name: string;
    fullName: string;
    shortDescription: string;
    pluginType: string;
}

export class CollectionsProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private _service: CollectionsService;
    private _envListener: vscode.Disposable | undefined;
    private _serviceListener: vscode.Disposable | undefined;
    private _refreshDebounce: ReturnType<typeof setTimeout> | undefined;

    constructor(pythonEnvService: PythonEnvironmentService) {
        this._service = CollectionsService.getInstance();
        
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire();
        });
        
        log('CollectionsProvider: Triggering initial refresh');
        this.refresh().catch(err => {
            log(`CollectionsProvider: Initial refresh failed: ${err}`);
        });
        
        this._initEnvListener(pythonEnvService);
    }

    private async _initEnvListener(pythonEnvService: PythonEnvironmentService) {
        try {
            await pythonEnvService.initialize();

            this._envListener = pythonEnvService.onDidChangeEnvironment(() => {
                if (this._refreshDebounce) {
                    clearTimeout(this._refreshDebounce);
                }
                this._refreshDebounce = setTimeout(() => {
                    this._refreshDebounce = undefined;
                    this.refresh();
                }, 1000);
            });
        } catch (error) {
            log(`CollectionsProvider: Failed to set up env change listener: ${error}`);
        }
    }

    async refresh(): Promise<void> {
        await this._service.refresh();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        if (element.type === 'loading') {
            const item = new vscode.TreeItem(
                'Indexing collections...',
                vscode.TreeItemCollapsibleState.None
            );
            item.iconPath = new vscode.ThemeIcon('sync~spin');
            item.tooltip = 'Scanning installed collections and plugins. This may take a moment.';
            return item;
        }
        
        if (element.type === 'collection') {
            const item = new vscode.TreeItem(
                element.name,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            item.description = element.info.version ? `v${element.info.version}` : undefined;
            item.iconPath = new vscode.ThemeIcon('library');
            item.contextValue = 'collection';
            
            const tooltipParts: string[] = [`**${element.name}**`];
            if (element.info.version) {
                tooltipParts.push(`\n\nVersion: ${element.info.version}`);
            }
            if (element.info.authors && element.info.authors.length > 0) {
                tooltipParts.push(`\n\nAuthors: ${element.info.authors.join(', ')}`);
            }
            if (element.info.description) {
                tooltipParts.push(`\n\n${element.info.description}`);
            }
            if (element.info.path) {
                tooltipParts.push(`\n\n---\n\nPath: \`${element.info.path}\``);
            }
            item.tooltip = new vscode.MarkdownString(tooltipParts.join(''));
            
            return item;
        } else if (element.type === 'pluginType') {
            const item = new vscode.TreeItem(
                element.name,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            item.description = `(${element.plugins.length})`;
            item.iconPath = new vscode.ThemeIcon('symbol-folder');
            item.contextValue = 'pluginType';
            return item;
        } else if (element.type === 'plugin') {
            const item = new vscode.TreeItem(
                element.name,
                vscode.TreeItemCollapsibleState.None
            );
            item.description = element.shortDescription;
            item.iconPath = new vscode.ThemeIcon('symbol-method');
            item.contextValue = 'plugin';
            item.tooltip = new vscode.MarkdownString(
                `**${element.fullName}**\n\n${element.shortDescription}\n\n*Click to view documentation*`
            );
            item.command = {
                command: 'ansibleDevTools.showPluginDoc',
                title: 'Show Plugin Documentation',
                arguments: [element.fullName, element.pluginType]
            };
            return item;
        } else {
            return new vscode.TreeItem('');
        }
    }

    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            if (this._service.isLoading() || !this._service.isLoaded()) {
                log(`CollectionsProvider: getChildren - loading=${this._service.isLoading()}, loaded=${this._service.isLoaded()}`);
                return Promise.resolve([{ type: 'loading' } as LoadingNode]);
            }
            
            const collections: CollectionNode[] = [];
            const serviceCollections = this._service.getCollections();
            log(`CollectionsProvider: getChildren - service has ${serviceCollections.size} collections`);
            
            for (const [name, data] of serviceCollections) {
                collections.push({
                    type: 'collection',
                    name,
                    info: data.info,
                    pluginTypes: data.pluginTypes
                });
            }
            collections.sort((a, b) => a.name.localeCompare(b.name));
            return Promise.resolve(collections);
        } else if (element.type === 'collection') {
            const pluginTypes: PluginTypeNode[] = [];
            for (const [typeName, plugins] of element.pluginTypes) {
                pluginTypes.push({
                    type: 'pluginType',
                    name: typeName,
                    collectionName: element.name,
                    plugins
                });
            }
            pluginTypes.sort((a, b) => a.name.localeCompare(b.name));
            return Promise.resolve(pluginTypes);
        } else if (element.type === 'pluginType') {
            const plugins: PluginNode[] = element.plugins.map(p => ({
                type: 'plugin',
                name: p.name,
                fullName: p.fullName,
                shortDescription: p.shortDescription,
                pluginType: element.name
            }));
            return Promise.resolve(plugins);
        }
        
        return Promise.resolve([]);
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
