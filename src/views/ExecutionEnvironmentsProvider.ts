import * as vscode from 'vscode';
import { ExecutionEnvService } from '@ansible/core';
import type { ExecutionEnvironment } from '@ansible/core';
import { log } from '../extension';

type TreeNode = EENode | EEDetailCategoryNode | EEDetailItemNode | MessageNode;

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
        this.contextValue = 'eeMessage';
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

class EENode extends vscode.TreeItem {
    constructor(
        public readonly ee: ExecutionEnvironment
    ) {
        super(ee.full_name, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = ee.created;
        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**${ee.full_name}**\n\n`);
        this.tooltip.appendMarkdown(`- Image ID: \`${ee.image_id}\`\n`);
        this.tooltip.appendMarkdown(`- Created: ${ee.created}\n`);
        this.iconPath = new vscode.ThemeIcon('package');
        this.contextValue = 'executionEnvironment';
    }
}

class EEDetailCategoryNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly items: EEDetailItemNode[],
        public readonly eeName: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `(${items.length})`;
        this.contextValue = 'eeDetailCategory';
        
        // Set appropriate icon based on category
        switch (label) {
            case 'Ansible Collections':
                this.iconPath = new vscode.ThemeIcon('library');
                break;
            case 'Python Packages':
                this.iconPath = new vscode.ThemeIcon('symbol-package');
                break;
            case 'Info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('list-tree');
        }
    }
}

class EEDetailItemNode extends vscode.TreeItem {
    constructor(
        label: string,
        description?: string,
        tooltip?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        if (tooltip) {
            this.tooltip = tooltip;
        }
        this.contextValue = 'eeDetailItem';
    }
}

export class ExecutionEnvironmentsProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private _service: ExecutionEnvService;
    private _serviceListener: vscode.Disposable | undefined;

    constructor() {
        this._service = ExecutionEnvService.getInstance();
        this._service.setLogFunction(log);
        
        // Listen for service changes
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire();
        });
        
        // Initial load
        this.refresh();
    }

    refresh(): void {
        this._service.refresh();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            // Root level - load execution environments
            return this._getExecutionEnvironments();
        }

        if (element instanceof EENode) {
            // Load EE details categories
            return this._getEEDetailCategories(element.ee);
        }

        if (element instanceof EEDetailCategoryNode) {
            // Return the items in this category
            return element.items;
        }

        return [];
    }

    private async _getExecutionEnvironments(): Promise<TreeNode[]> {
        if (this._service.isLoading()) {
            return [new MessageNode('Loading...', { icon: 'sync~spin', tooltip: 'Loading execution environments' })];
        }

        try {
            const ees = await this._service.loadExecutionEnvironments();

            if (ees.length === 0) {
                return [new MessageNode('No execution environments found', {
                    description: 'Build or pull an EE image',
                    icon: 'info',
                    tooltip: 'Build or pull an execution environment image'
                })];
            }

            return ees.map(ee => new EENode(ee));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            
            // Check if ansible-navigator is not installed
            if (message.includes('not found in PATH') || message.includes('not found')) {
                return [
                    new MessageNode('ansible-navigator not found', {
                        description: 'Click to install',
                        tooltip: 'Install ansible-dev-tools to enable Execution Environments',
                        icon: 'warning',
                        command: {
                            command: 'ansibleDevToolsPackages.install',
                            title: 'Install ansible-dev-tools'
                        }
                    })
                ];
            }
            
            return [new MessageNode('Error loading execution environments', {
                description: message,
                icon: 'error',
                tooltip: message
            })];
        }
    }

    private async _getEEDetailCategories(ee: ExecutionEnvironment): Promise<TreeNode[]> {
        try {
            const details = await this._service.loadDetails(ee.full_name);
            
            if (!details) {
                return [new EEDetailItemNode('Failed to load details')];
            }

            const categories: TreeNode[] = [];

            // Info category
            const infoItems: EEDetailItemNode[] = [];
            if (details.ansible_version?.details) {
                infoItems.push(new EEDetailItemNode('Ansible', details.ansible_version.details));
            }
            if (details.os_release?.details?.[0]) {
                const os = details.os_release.details[0];
                const osName = os['pretty-name'] || os.name || 'Unknown';
                infoItems.push(new EEDetailItemNode('OS', osName));
            }
            if (details.image_name) {
                infoItems.push(new EEDetailItemNode('Image', details.image_name));
            }
            if (infoItems.length > 0) {
                categories.push(new EEDetailCategoryNode('Info', infoItems, ee.full_name));
            }

            // Ansible Collections category
            if (details.ansible_collections?.details) {
                const collectionItems: EEDetailItemNode[] = [];
                const collections = Object.entries(details.ansible_collections.details)
                    .sort(([a], [b]) => a.localeCompare(b));
                
                for (const [name, version] of collections) {
                    collectionItems.push(new EEDetailItemNode(name, version));
                }
                
                if (collectionItems.length > 0) {
                    categories.push(new EEDetailCategoryNode('Ansible Collections', collectionItems, ee.full_name));
                }
            }

            // Python Packages category
            if (details.python_packages?.details) {
                const packageItems: EEDetailItemNode[] = [];
                const packages = [...details.python_packages.details]
                    .sort((a, b) => a.name.localeCompare(b.name));
                
                for (const pkg of packages) {
                    packageItems.push(new EEDetailItemNode(
                        pkg.name, 
                        pkg.version,
                        pkg.summary || undefined
                    ));
                }
                
                if (packageItems.length > 0) {
                    categories.push(new EEDetailCategoryNode('Python Packages', packageItems, ee.full_name));
                }
            }

            return categories;
        } catch (error) {
            log(`ExecutionEnvironmentsProvider: Failed to load EE details: ${error}`);
            return [new EEDetailItemNode('Error loading details', '', String(error))];
        }
    }
}
