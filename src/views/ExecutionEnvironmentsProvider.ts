import * as vscode from 'vscode';
import { ExecutionEnvService } from '@ansible/services';
import type { ExecutionEnvironment } from '@ansible/services';
import { log } from '@src/extension';

type TreeNode = EENode | EEDetailCategoryNode | EEDetailItemNode | MessageNode;

/** Tree item that displays informational or actionable execution environment messages. */
class MessageNode extends vscode.TreeItem {
    /**
     * Create a non-collapsible message node for the execution environments tree.
     * @param label - Primary message text shown in the tree
     * @param options - Optional presentation and command settings
     * @param options.description - Secondary text shown inline in the tree
     * @param options.tooltip - Hover text with additional detail
     * @param options.icon - Theme icon name for the node
     * @param options.command - VS Code command launched when the node is clicked
     */
    constructor(
        label: string,
        options?: {
            description?: string;
            tooltip?: string;
            icon?: string;
            command?: vscode.Command;
        },
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'eeMessage';
        if (options?.description) {
            this.description = options.description;
        }
        if (options?.tooltip) {
            this.tooltip = options.tooltip;
        }
        this.iconPath = new vscode.ThemeIcon(options?.icon ?? 'info');
        if (options?.command) {
            this.command = options.command;
        }
    }
}

/** Collapsible tree item representing a single execution environment image. */
class EENode extends vscode.TreeItem {
    /**
     * Create a tree node for an execution environment summary.
     * @param ee - Execution environment metadata from the container runtime
     */
    constructor(public readonly ee: ExecutionEnvironment) {
        super(ee.full_name, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = ee.created;
        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**${ee.full_name}**\n\n`);
        this.tooltip.appendMarkdown(`- Image ID: \`${ee.image_id}\`\n`);
        this.tooltip.appendMarkdown(`- Created: ${ee.created}\n`);
        this.iconPath = new vscode.ThemeIcon('package');
        this.contextValue = 'executionEnvironment';
        this.command = {
            command: 'ansibleExecutionEnvironments.showDetail',
            title: 'Show Details',
            arguments: [ee.full_name],
        };
    }
}

/** Collapsible category node for execution environment detail sections. */
class EEDetailCategoryNode extends vscode.TreeItem {
    /**
     * Create a detail category such as collections, packages, or info.
     * @param label - Category label shown in the tree
     * @param items - Detail items contained in this category
     * @param eeName - Execution environment name that owns these details
     */
    constructor(
        public readonly label: string,
        public readonly items: EEDetailItemNode[],
        public readonly eeName: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `(${String(items.length)})`;
        this.contextValue = 'eeDetailCategory';

        // Set appropriate icon based on category
        switch (label) {
            case 'Ansible Collections':
                this.iconPath = new vscode.ThemeIcon('library');
                break;
            case 'Python Packages':
                this.iconPath = new vscode.ThemeIcon('symbol-package');
                break;
            case 'System Packages':
                this.iconPath = new vscode.ThemeIcon('archive');
                break;
            case 'Info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('list-tree');
        }
    }
}

/** Leaf tree item for a single execution environment detail entry. */
class EEDetailItemNode extends vscode.TreeItem {
    /**
     * Create a detail item with optional description and tooltip text.
     * @param label - Primary label shown in the tree
     * @param options - Optional item configuration
     * @param options.description - Secondary text shown inline
     * @param options.tooltip - Hover text with additional detail
     * @param options.eeName - EE image name for opening package detail
     * @param options.packageType - Package category for opening detail views
     */
    constructor(
        label: string,
        options?: {
            description?: string;
            tooltip?: string;
            eeName?: string;
            packageType?: 'python' | 'system';
        },
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = options?.description;
        if (options?.tooltip) {
            this.tooltip = options.tooltip;
        }
        this.contextValue = 'eeDetailItem';

        if (options?.eeName && options.packageType) {
            this.command = {
                command: 'ansibleExecutionEnvironments.showPackageDetail',
                title: 'Show Package Details',
                arguments: [options.eeName, label, options.packageType],
            };
        }
    }
}

/** Tree view provider for local execution environment images and their details. */
export class ExecutionEnvironmentsProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null> =
        new vscode.EventEmitter<TreeNode | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null> =
        this._onDidChangeTreeData.event;

    private _service: ExecutionEnvService;
    private _serviceListener: vscode.Disposable | undefined;

    /** Create the provider and begin loading execution environments. */
    constructor() {
        this._service = ExecutionEnvService.getInstance();
        this._service.setLogFunction(log);

        // Listen for service changes
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire(undefined);
        });

        // Initial load
        this.refresh();
    }

    /** Reload execution environment images and refresh the tree. */
    refresh(): void {
        void this._service.refresh();
    }

    /**
     * Return the tree item for an execution environment node.
     * @param element - Node whose tree item should be displayed
     * @returns The node itself because EE nodes extend TreeItem
     */
    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    /**
     * Return root execution environments or the children of an EE node.
     * @param element - Parent node whose children should be listed
     * @returns Execution environments, detail categories, or detail items
     */
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

    /**
     * Load execution environment images for the tree root.
     * @returns EE nodes or status messages for loading, empty, and error states
     */
    private async _getExecutionEnvironments(): Promise<TreeNode[]> {
        if (this._service.isLoading()) {
            return [
                new MessageNode('Loading...', {
                    icon: 'sync~spin',
                    tooltip: 'Loading execution environments',
                }),
            ];
        }

        try {
            const ees = await this._service.loadExecutionEnvironments();

            if (ees.length === 0) {
                return [
                    new MessageNode('No execution environments found', {
                        description: 'Build or pull an EE image',
                        icon: 'info',
                        tooltip: 'Build or pull an execution environment image',
                    }),
                ];
            }

            return ees.map((ee) => new EENode(ee));
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
                            title: 'Install ansible-dev-tools',
                        },
                    }),
                ];
            }

            return [
                new MessageNode('Error loading execution environments', {
                    description: message,
                    icon: 'error',
                    tooltip: message,
                }),
            ];
        }
    }

    /**
     * Load detail categories for a selected execution environment.
     * @param ee - Execution environment whose details should be shown
     * @returns Detail categories or an error item when loading fails
     */
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
                infoItems.push(
                    new EEDetailItemNode('Ansible', {
                        description: details.ansible_version.details,
                    }),
                );
            }
            const osDetails = details.os_release?.details;
            if (osDetails?.[0]) {
                const os = osDetails[0];
                const osName = os['pretty-name'] ?? os.name ?? 'Unknown';
                infoItems.push(new EEDetailItemNode('OS', { description: osName }));
            }
            if (details.image_name) {
                infoItems.push(new EEDetailItemNode('Image', { description: details.image_name }));
            }
            if (infoItems.length > 0) {
                categories.push(new EEDetailCategoryNode('Info', infoItems, ee.full_name));
            }

            // Ansible Collections category
            if (details.ansible_collections?.details) {
                const collectionItems: EEDetailItemNode[] = [];
                const collections = Object.entries(details.ansible_collections.details).sort(
                    ([a], [b]) => a.localeCompare(b),
                );

                for (const [name, version] of collections) {
                    collectionItems.push(new EEDetailItemNode(name, { description: version }));
                }

                if (collectionItems.length > 0) {
                    categories.push(
                        new EEDetailCategoryNode(
                            'Ansible Collections',
                            collectionItems,
                            ee.full_name,
                        ),
                    );
                }
            }

            // Python Packages category
            if (details.python_packages?.details) {
                const packageItems: EEDetailItemNode[] = [];
                const packages = [...details.python_packages.details].sort((a, b) =>
                    a.name.localeCompare(b.name),
                );

                for (const pkg of packages) {
                    packageItems.push(
                        new EEDetailItemNode(pkg.name, {
                            description: pkg.version,
                            tooltip: pkg.summary ?? undefined,
                            eeName: ee.full_name,
                            packageType: 'python',
                        }),
                    );
                }

                if (packageItems.length > 0) {
                    categories.push(
                        new EEDetailCategoryNode('Python Packages', packageItems, ee.full_name),
                    );
                }
            }

            // System Packages category
            const systemPkgs = await this._service.getSystemPackages(ee.full_name);
            if (systemPkgs.length > 0) {
                const systemItems = systemPkgs.map(
                    (pkg) =>
                        new EEDetailItemNode(pkg.name, {
                            description: pkg.version,
                            eeName: ee.full_name,
                            packageType: 'system',
                        }),
                );
                categories.push(
                    new EEDetailCategoryNode('System Packages', systemItems, ee.full_name),
                );
            }

            return categories;
        } catch (error) {
            log(
                `ExecutionEnvironmentsProvider: Failed to load EE details: ${error instanceof Error ? error.message : String(error)}`,
            );
            return [
                new EEDetailItemNode('Error loading details', {
                    tooltip: String(error),
                }),
            ];
        }
    }
}
