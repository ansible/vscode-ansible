/**
 * MCP Tools Tree View Provider
 *
 * Displays available MCP tools and allows users to inject prompts
 * into Cursor/Copilot chat to invoke them.
 */

import * as vscode from 'vscode';
import { STATIC_TOOLS, type McpToolDefinition, CreatorToolGenerator } from '@ansible/mcp-server';
import { CreatorService, buildMcpToolExamplePrompt } from '@ansible/services';
import { log } from '@src/extension';
import { getMcpStatus, McpStatus } from '@src/mcp/cursorConfig';

type ToolCategory =
    | 'getting_started'
    | 'discovery'
    | 'generation'
    | 'execution'
    | 'devtools'
    | 'creator';

export interface ToolInfo {
    tool: McpToolDefinition;
    category: ToolCategory;
    examplePrompt: string;
}

/** Collapsible tree item representing a category of MCP tools. */
class ToolCategoryNode extends vscode.TreeItem {
    /**
     * Create a category node with a tool count description.
     * @param categoryLabel - Display label for the category
     * @param categoryId - Internal category identifier
     * @param toolCount - Number of tools contained in the category
     */
    constructor(
        public readonly categoryLabel: string,
        public readonly categoryId: ToolCategory,
        public readonly toolCount: number,
    ) {
        super(categoryLabel, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'toolCategory';
        this.description = `${String(toolCount)} tools`;

        // Set icons based on category
        const iconMap: Record<ToolCategory, string> = {
            getting_started: 'rocket',
            discovery: 'search',
            generation: 'code',
            execution: 'package',
            devtools: 'tools',
            creator: 'wand',
        };
        this.iconPath = new vscode.ThemeIcon(iconMap[categoryId]);
    }
}

/** Leaf tree item for a single MCP tool with chat injection command. */
class ToolNode extends vscode.TreeItem {
    public readonly sortKey: string;

    /**
     * Create a tool node from MCP tool metadata and an example prompt.
     * @param toolInfo - Tool definition, category, and example chat prompt
     */
    constructor(public readonly toolInfo: ToolInfo) {
        // Use the first line of description as the label
        const firstLine = toolInfo.tool.description.split('\n')[0].trim();
        const label = firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
        super(label, vscode.TreeItemCollapsibleState.None);

        // Store lowercase for sorting
        this.sortKey = firstLine.toLowerCase();

        this.tooltip = new vscode.MarkdownString(this._formatTooltip());
        this.contextValue = 'mcpTool';
        this.iconPath = new vscode.ThemeIcon('sparkle');

        // Command to inject prompt into chat
        this.command = {
            command: 'ansibleMcpTools.useInChat',
            title: 'Use in Chat',
            arguments: [toolInfo],
        };
    }

    /**
     * Build markdown tooltip content describing the tool and its parameters.
     * @returns Markdown tooltip text for the tool node
     */
    private _formatTooltip(): string {
        const tool = this.toolInfo.tool;
        const lines: string[] = [`### ${tool.name}`, '', tool.description, ''];

        // Show parameters
        const props = tool.inputSchema.properties;
        const required = new Set(tool.inputSchema.required ?? []);

        if (Object.keys(props).length > 0) {
            lines.push('**Parameters:**');
            for (const [name, schema] of Object.entries(props)) {
                const s = schema as { description?: string; type?: string };
                const reqMark = required.has(name) ? ' *(required)*' : '';
                lines.push(`- \`${name}\`${reqMark}: ${s.description ?? s.type ?? 'any'}`);
            }
            lines.push('');
        }

        lines.push('**Example prompt:**');
        lines.push(`\`${this.toolInfo.examplePrompt}\``);

        return lines.join('\n');
    }
}

/** Warning node shown when MCP is not configured for the current IDE. */
class McpWarningNode extends vscode.TreeItem {
    /**
     * Create a warning node that links to MCP configuration.
     * @param status - Current MCP status for the active IDE
     */
    constructor(status: McpStatus) {
        const ideName = status.ide === 'cursor' ? 'Cursor' : 'VS Code Copilot';
        super(`MCP not configured for ${ideName}`, vscode.TreeItemCollapsibleState.None);

        this.description = 'click to configure';
        this.iconPath = new vscode.ThemeIcon(
            'warning',
            new vscode.ThemeColor('problemsWarningIcon.foreground'),
        );
        this.tooltip = `AI tools require MCP to be configured.\n\nClick to configure for ${ideName}.`;
        this.contextValue = 'mcpWarning';
        this.command = {
            command: 'ansibleMcpTools.configure',
            title: 'Configure MCP',
        };
    }
}

type ToolTreeItem = ToolCategoryNode | ToolNode | McpWarningNode;

/** Tree view provider for Ansible MCP tools and example chat prompts. */
export class McpToolsProvider implements vscode.TreeDataProvider<ToolTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ToolTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _tools: ToolInfo[] = [];
    private _creatorToolGenerator: CreatorToolGenerator;
    private _isLoading = false;
    private _creatorServiceListener: vscode.Disposable | undefined;
    private _extensionContext: vscode.ExtensionContext;

    /**
     * Create the provider and load static and creator MCP tools.
     * @param context - Extension context used to evaluate MCP configuration status
     */
    constructor(context: vscode.ExtensionContext) {
        this._extensionContext = context;
        this._creatorToolGenerator = new CreatorToolGenerator();

        // Listen for CreatorService changes to auto-refresh when schema loads
        const creatorService = CreatorService.getInstance();
        this._creatorServiceListener = (creatorService.onDidChange as vscode.Event<void>)(() => {
            if (creatorService.isLoaded()) {
                log('McpToolsProvider: CreatorService loaded, refreshing tools...');
                void this._loadTools();
            }
        });

        void this._loadTools();
    }

    /** Release creator service listeners. */
    dispose(): void {
        this._creatorServiceListener?.dispose();
    }

    /** Reload MCP tool definitions and refresh the tree. */
    refresh(): void {
        void this._loadTools();
    }

    /** Load static and creator-generated MCP tools into the tree model. */
    private async _loadTools(): Promise<void> {
        if (this._isLoading) {
            return;
        }

        this._isLoading = true;
        this._tools = [];

        try {
            // Load static tools with categories
            for (const tool of STATIC_TOOLS) {
                const category = this._categorizeStaticTool(tool.name);
                const examplePrompt = this._generateExamplePrompt(tool);
                this._tools.push({ tool, category, examplePrompt });
            }

            // Load dynamic creator tools
            try {
                log('McpToolsProvider: Loading creator tools...');
                await this._creatorToolGenerator.refresh();
                const creatorTools = this._creatorToolGenerator.getTools();
                log(
                    `McpToolsProvider: CreatorToolGenerator returned ${String(creatorTools.length)} tools`,
                );

                for (const tool of creatorTools) {
                    const examplePrompt = this._generateExamplePrompt(tool);
                    this._tools.push({ tool, category: 'creator', examplePrompt });
                }

                log(
                    `McpToolsProvider: Loaded ${String(STATIC_TOOLS.length)} static + ${String(creatorTools.length)} creator tools`,
                );
            } catch (error) {
                log(
                    `McpToolsProvider: Failed to load creator tools: ${error instanceof Error ? error.message : String(error)}`,
                );
                // Continue with static tools only
            }
        } finally {
            this._isLoading = false;
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    /**
     * Assign a display category to a static MCP tool by name.
     * @param name - MCP tool identifier
     * @returns Category used to group the tool in the tree
     */
    private _categorizeStaticTool(name: string): ToolCategory {
        if (name === 'get_agent_onboarding' || name === 'get_extension_walkthrough') {
            return 'getting_started';
        }
        if (
            name.includes('search') ||
            name.includes('list') ||
            name.includes('get_plugin_documentation')
        ) {
            return 'discovery';
        }
        if (name.includes('generate') || name.includes('build_ansible_task')) {
            return 'generation';
        }
        if (name.includes('execution_environment') || name.includes('ee_')) {
            return 'execution';
        }
        if (name.includes('dev_tools')) {
            return 'devtools';
        }
        return 'discovery'; // default
    }

    /**
     * Build an example chat prompt that instructs an agent to use the tool.
     * @param tool - MCP tool definition to describe in the prompt
     * @returns Example prompt suitable for injection into chat
     */
    private _generateExamplePrompt(tool: McpToolDefinition): string {
        return buildMcpToolExamplePrompt(tool.name, tool.description);
    }

    /**
     * Return the tree item for an MCP tool tree node.
     * @param element - Node whose tree item should be displayed
     * @returns The node itself because MCP tool nodes extend TreeItem
     */
    getTreeItem(element: ToolTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Return MCP warning, categories, or tools within a selected category.
     * @param element - Parent node whose children should be listed
     * @returns Root categories, category tools, or an empty list
     */
    getChildren(element?: ToolTreeItem): ToolTreeItem[] | Promise<ToolTreeItem[]> {
        if (!element) {
            const items: ToolTreeItem[] = [];

            // Check MCP status and show warning if not configured
            const status = getMcpStatus(this._extensionContext);
            if (!status.isConfigured) {
                items.push(new McpWarningNode(status));
            }

            // Show tool categories
            const categories: { id: ToolCategory; label: string }[] = [
                { id: 'getting_started', label: 'Getting Started' },
                { id: 'discovery', label: 'Discovery' },
                { id: 'generation', label: 'Task Generation' },
                { id: 'execution', label: 'Execution Environments' },
                { id: 'devtools', label: 'Dev Tools' },
                { id: 'creator', label: 'Creator' },
            ];

            const categoryNodes = categories
                .map((cat) => {
                    const count = this._tools.filter((t) => t.category === cat.id).length;
                    return new ToolCategoryNode(cat.label, cat.id, count);
                })
                .filter((node) => node.toolCount > 0);

            items.push(...categoryNodes);
            return items;
        }

        if (element instanceof ToolCategoryNode) {
            // Return tools in this category, sorted by description
            const nodes = this._tools
                .filter((t) => t.category === element.categoryId)
                .map((t) => new ToolNode(t));
            // Sort alphabetically by description
            nodes.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
            return nodes;
        }

        return [];
    }

    /**
     * Get the CreatorToolGenerator instance for MCP handlers
     * @returns Shared generator used to build dynamic creator MCP tools
     */
    getCreatorToolGenerator(): CreatorToolGenerator {
        return this._creatorToolGenerator;
    }

    /**
     * Get all loaded tools
     * @returns Copy of the currently loaded MCP tool metadata
     */
    getAllTools(): ToolInfo[] {
        return [...this._tools];
    }
}

/**
 * Inject a tool prompt into the chat
 * @param toolInfo - Tool metadata containing the example prompt to send
 */
export async function injectToolPromptIntoChat(toolInfo: ToolInfo): Promise<void> {
    const prompt = toolInfo.examplePrompt;

    // Try to open chat with the prompt directly (VS Code 1.93+ with Copilot)
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
        vscode.window.showInformationMessage('Prompt sent to chat.');
        log(`McpToolsProvider: Opened chat with prompt`);
    } catch {
        // Fallback: copy to clipboard and notify user
        await vscode.env.clipboard.writeText(prompt);
        vscode.window
            .showInformationMessage(
                'AI prompt copied to clipboard. Paste it into an agent chat session.',
                'Open Chat',
            )
            .then((selection) => {
                if (selection === 'Open Chat') {
                    vscode.commands.executeCommand('workbench.action.chat.open');
                }
            });
    }
}
