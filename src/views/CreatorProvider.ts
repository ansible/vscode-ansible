import * as vscode from 'vscode';
import { CreatorService } from '@ansible/core';
import type { SchemaNode } from '@ansible/core';
import { log } from '../extension';

type TreeNode = CategoryNode | CommandNode | MessageNode;

class MessageNode extends vscode.TreeItem {
    constructor(
        label: string,
        options?: {
            description?: string;
            tooltip?: string;
            icon?: string;
            command?: vscode.Command;
        }
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'creatorMessage';
        if (options?.description) {
            this.description = options.description;
        }
        if (options?.tooltip) {
            this.tooltip = options.tooltip;
        }
        this.iconPath = new vscode.ThemeIcon(options?.icon || 'info');
        if (options?.command) {
            this.command = options.command;
        }
    }
}

class CategoryNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly children: TreeNode[],
        public readonly commandPath: string[],
        description?: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'creatorCategory';
        this.iconPath = new vscode.ThemeIcon('folder');
        
        // Use description for tooltip
        if (description) {
            this.tooltip = description;
        }
    }
}

class CommandNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly schema: SchemaNode,
        public readonly commandPath: string[],
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'creatorCommand';
        this.iconPath = new vscode.ThemeIcon('new-file');
        
        // Use description for tooltip (full text on hover)
        const desc = schema.description || '';
        this.tooltip = desc || label;
        
        // Show truncated description inline if available
        if (desc && desc.length > 0) {
            // Truncate long descriptions for inline display
            this.description = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
        }
        
        // Click to open form
        this.command = {
            command: 'ansibleCreator.openForm',
            title: 'Open Creator Form',
            arguments: [commandPath, schema],
        };
    }
}

export class CreatorProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _service: CreatorService;
    private _serviceListener: vscode.Disposable | undefined;

    constructor() {
        this._service = CreatorService.getInstance();
        this._service.setLogFunction(log);
        
        // Listen for service changes
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire();
        });
        
        // Initial load
        this._service.loadSchema();
    }

    refresh(): void {
        this._service.refresh();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            // Root level - show Init and Add categories
            if (this._service.isLoading()) {
                return [new MessageNode('Loading...', { icon: 'sync~spin' })];
            }

            const schema = this._service.getSchema();
            if (!schema) {
                // Check if ansible-creator is not installed
                return [
                    new MessageNode('ansible-creator not found', {
                        description: 'Click to install',
                        tooltip: 'Install ansible-dev-tools to enable Creator features',
                        icon: 'warning',
                        command: {
                            command: 'ansibleDevToolsPackages.install',
                            title: 'Install ansible-dev-tools'
                        }
                    })
                ];
            }

            const children: TreeNode[] = [];

            // Add "Init" category
            if (schema.subcommands?.init) {
                const initNode = this._buildCategoryNode('Init', schema.subcommands.init, ['init']);
                children.push(initNode);
            }

            // Add "Add" category
            if (schema.subcommands?.add) {
                const addNode = this._buildCategoryNode('Add', schema.subcommands.add, ['add']);
                children.push(addNode);
            }

            return children;
        }

        if (element instanceof CategoryNode) {
            return element.children;
        }

        return [];
    }

    private _buildCategoryNode(label: string, schema: SchemaNode, path: string[]): CategoryNode {
        const children: TreeNode[] = [];

        if (schema.subcommands) {
            for (const [name, subSchema] of Object.entries(schema.subcommands)) {
                const subPath = [...path, name];
                
                // Check if this has further subcommands
                if (subSchema.subcommands && Object.keys(subSchema.subcommands).length > 0) {
                    // It's a category with more children
                    const categoryNode = this._buildCategoryNode(
                        this._formatLabel(name),
                        subSchema,
                        subPath,
                    );
                    children.push(categoryNode);
                } else {
                    // It's a leaf command
                    children.push(new CommandNode(
                        this._formatLabel(name),
                        subSchema,
                        subPath,
                    ));
                }
            }
        }

        return new CategoryNode(label, children, path, schema.description);
    }

    private _formatLabel(name: string): string {
        // Convert snake_case to Title Case
        return name
            .split(/[_-]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    public getSchema(): SchemaNode | null {
        return this._service.getSchema();
    }
    
    dispose() {
        this._serviceListener?.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
