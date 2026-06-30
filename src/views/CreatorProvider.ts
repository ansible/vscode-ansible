import * as vscode from 'vscode';
import { CreatorService } from '@ansible/developer-services';
import type { SchemaNode } from '@ansible/developer-services';
import { log } from '@src/extension';

type TreeNode = CategoryNode | CommandNode | MessageNode;

/** Tree item that displays informational or actionable creator messages. */
class MessageNode extends vscode.TreeItem {
    /**
     * Create a non-collapsible message node for the creator tree.
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
        this.contextValue = 'creatorMessage';
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

/** Collapsible tree item representing a creator schema category. */
class CategoryNode extends vscode.TreeItem {
    /**
     * Create a category node that groups related creator commands.
     * @param label - Category label shown in the tree
     * @param children - Child nodes contained in this category
     * @param commandPath - Schema path prefix for commands in this category
     * @param description - Optional tooltip description from the schema
     */
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

/** Leaf tree item that opens a creator form for a schema command. */
class CommandNode extends vscode.TreeItem {
    /**
     * Create a command node that launches the creator form on click.
     * @param label - Command label shown in the tree
     * @param schema - Schema definition for the command form
     * @param commandPath - Schema path used to invoke ansible-creator
     */
    constructor(
        public readonly label: string,
        public readonly schema: SchemaNode,
        public readonly commandPath: string[],
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'creatorCommand';
        this.iconPath = new vscode.ThemeIcon('new-file');

        // Use description for tooltip (full text on hover)
        const desc = schema.description ?? '';
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

/** Tree view provider for ansible-creator init and add commands. */
export class CreatorProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _service: CreatorService;
    private _serviceListener: vscode.Disposable | undefined;

    /** Create the provider and load the ansible-creator schema. */
    constructor() {
        this._service = CreatorService.getInstance();
        this._service.setLogFunction(log);

        // Listen for service changes
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChangeTreeData.fire(undefined);
        });

        // Initial load
        void this._service.loadSchema();
    }

    /** Reload the ansible-creator schema and refresh the tree. */
    refresh(): void {
        void this._service.refresh();
    }

    /**
     * Return the tree item for a creator node.
     * @param element - Node whose tree item should be displayed
     * @returns The node itself because creator nodes extend TreeItem
     */
    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    /**
     * Return root categories or the children of a category node.
     * @param element - Parent node whose children should be listed
     * @returns Creator categories, commands, or status messages
     */
    getChildren(element?: TreeNode): TreeNode[] | Promise<TreeNode[]> {
        if (!element) {
            // Root level - show Init and Add categories
            if (this._service.isLoading()) {
                return [new MessageNode('Loading...', { icon: 'sync~spin' })];
            }

            const schema = this._service.getSchema();
            if (!schema) {
                const status = this._service.getStatus();
                if (status === 'outdated') {
                    const ver = this._service.getInstalledVersion();
                    return [
                        new MessageNode('ansible-creator outdated', {
                            description: ver ? `v${ver} — upgrade required` : 'Upgrade required',
                            tooltip:
                                'The installed ansible-creator does not support the "schema" subcommand.\nUpgrade ansible-dev-tools to get the latest version.',
                            icon: 'warning',
                            command: {
                                command: 'ansibleDevToolsPackages.upgrade',
                                title: 'Upgrade ansible-dev-tools',
                            },
                        }),
                    ];
                }
                return [
                    new MessageNode('ansible-creator not found', {
                        description: 'Click to install',
                        tooltip: 'Install ansible-dev-tools to enable Creator features',
                        icon: 'warning',
                        command: {
                            command: 'ansibleDevToolsPackages.install',
                            title: 'Install ansible-dev-tools',
                        },
                    }),
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

    /**
     * Build a category node and recursively attach child commands or subcategories.
     * @param label - Category label shown in the tree
     * @param schema - Schema subtree for this category
     * @param path - Command path prefix accumulated from parent categories
     * @returns A populated category node for the creator tree
     */
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
                    children.push(new CommandNode(this._formatLabel(name), subSchema, subPath));
                }
            }
        }

        return new CategoryNode(label, children, path, schema.description);
    }

    /**
     * Convert a schema key into a human-readable tree label.
     * @param name - Schema key in snake_case or kebab-case
     * @returns Title-cased label for display in the tree
     */
    private _formatLabel(name: string): string {
        // Convert snake_case to Title Case
        return name
            .split(/[_-]/)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Expose the loaded ansible-creator schema for other extension components.
     * @returns The current creator schema, or null when unavailable
     */
    public getSchema(): SchemaNode | null {
        return this._service.getSchema();
    }

    /** Release service listeners and tree event emitters. */
    dispose() {
        this._serviceListener?.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
