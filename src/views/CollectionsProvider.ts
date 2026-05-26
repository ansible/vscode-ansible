import * as vscode from 'vscode';
import { CollectionsService, CollectionInfo, PluginInfo } from '@ansible/core';
import type { PythonEnvironmentApi } from '@ansible/core';
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
    private _pythonEnvApi: PythonEnvironmentApi | undefined;
    private _envListener: vscode.Disposable | undefined;
    private _serviceListener: vscode.Disposable | undefined;

    constructor() {
        this._service = CollectionsService.getInstance();
        
        // Listen for service changes
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire();
        });
        
        // Trigger immediate refresh (will load from cache if available)
        log('CollectionsProvider: Triggering initial refresh');
        this.refresh().catch(err => {
            log(`CollectionsProvider: Initial refresh failed: ${err}`);
        });
        
        // Also initialize Python env API for environment change listening
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
                
                // Note: Initial refresh is done in constructor (loads from cache)
                // The service will do background refresh to update data
            }
        } catch (error) {
            log(`CollectionsProvider: Failed to get Python Environments API: ${error}`);
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
            
            // Build tooltip with collection info
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
            // Loading node - handled above
            return new vscode.TreeItem('');
        }
    }

    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            // Show loading indicator when indexing or not yet loaded
            if (this._service.isLoading() || !this._service.isLoaded()) {
                log(`CollectionsProvider: getChildren - loading=${this._service.isLoading()}, loaded=${this._service.isLoaded()}`);
                return Promise.resolve([{ type: 'loading' } as LoadingNode]);
            }
            
            // Root level - return collections sorted alphabetically
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
            // Return plugin types for this collection
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
            // Return plugins for this type
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
        this._envListener?.dispose();
        this._serviceListener?.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
