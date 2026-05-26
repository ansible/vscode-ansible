/**
 * MCP Tools Tree View Provider
 * 
 * Displays available MCP tools and allows users to inject prompts
 * into Cursor/Copilot chat to invoke them.
 */

import * as vscode from 'vscode';
import { STATIC_TOOLS, type McpToolDefinition, CreatorToolGenerator } from '@ansible/mcp-server';
import { CreatorService } from '@ansible/core';
import { log } from '../extension';
import { getMcpStatus, McpStatus } from '../mcp/cursorConfig';

type ToolCategory = 'discovery' | 'generation' | 'execution' | 'devtools' | 'creator';

interface ToolInfo {
    tool: McpToolDefinition;
    category: ToolCategory;
    examplePrompt: string;
}

class ToolCategoryNode extends vscode.TreeItem {
    constructor(
        public readonly categoryLabel: string,
        public readonly categoryId: ToolCategory,
        public readonly toolCount: number
    ) {
        super(categoryLabel, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'toolCategory';
        this.description = `${toolCount} tools`;
        
        // Set icons based on category
        const iconMap: Record<ToolCategory, string> = {
            discovery: 'search',
            generation: 'code',
            execution: 'package',
            devtools: 'tools',
            creator: 'wand'
        };
        this.iconPath = new vscode.ThemeIcon(iconMap[categoryId] || 'symbol-method');
    }
}

class ToolNode extends vscode.TreeItem {
    public readonly sortKey: string;
    
    constructor(
        public readonly toolInfo: ToolInfo
    ) {
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
            arguments: [toolInfo]
        };
    }

    private _formatTooltip(): string {
        const tool = this.toolInfo.tool;
        const lines: string[] = [
            `### ${tool.name}`,
            '',
            tool.description,
            ''
        ];

        // Show parameters
        const props = tool.inputSchema.properties;
        const required = new Set(tool.inputSchema.required || []);
        
        if (Object.keys(props).length > 0) {
            lines.push('**Parameters:**');
            for (const [name, schema] of Object.entries(props)) {
                const s = schema as { description?: string; type?: string };
                const reqMark = required.has(name) ? ' *(required)*' : '';
                lines.push(`- \`${name}\`${reqMark}: ${s.description || s.type || 'any'}`);
            }
            lines.push('');
        }

        lines.push('**Example prompt:**');
        lines.push(`\`${this.toolInfo.examplePrompt}\``);

        return lines.join('\n');
    }
}

class McpWarningNode extends vscode.TreeItem {
    constructor(status: McpStatus) {
        const ideName = status.ide === 'cursor' ? 'Cursor' : 'VS Code Copilot';
        super(`MCP not configured for ${ideName}`, vscode.TreeItemCollapsibleState.None);
        
        this.description = 'click to configure';
        this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
        this.tooltip = `AI tools require MCP to be configured.\n\nClick to configure for ${ideName}.`;
        this.contextValue = 'mcpWarning';
        this.command = {
            command: 'ansibleMcpTools.configure',
            title: 'Configure MCP'
        };
    }
}

type ToolTreeItem = ToolCategoryNode | ToolNode | McpWarningNode;

export class McpToolsProvider implements vscode.TreeDataProvider<ToolTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ToolTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _tools: ToolInfo[] = [];
    private _creatorToolGenerator: CreatorToolGenerator;
    private _isLoading = false;
    private _creatorServiceListener: vscode.Disposable | undefined;
    private _extensionContext: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._extensionContext = context;
        this._creatorToolGenerator = new CreatorToolGenerator();
        
        // Listen for CreatorService changes to auto-refresh when schema loads
        const creatorService = CreatorService.getInstance();
        this._creatorServiceListener = (creatorService.onDidChange as vscode.Event<void>)(() => {
            if (creatorService.isLoaded()) {
                log('McpToolsProvider: CreatorService loaded, refreshing tools...');
                this._loadTools();
            }
        });
        
        this._loadTools();
    }

    dispose(): void {
        this._creatorServiceListener?.dispose();
    }

    refresh(): void {
        this._loadTools();
    }

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
                log(`McpToolsProvider: CreatorToolGenerator returned ${creatorTools.length} tools`);
                
                for (const tool of creatorTools) {
                    const examplePrompt = this._generateExamplePrompt(tool);
                    this._tools.push({ tool, category: 'creator', examplePrompt });
                }
                
                log(`McpToolsProvider: Loaded ${STATIC_TOOLS.length} static + ${creatorTools.length} creator tools`);
            } catch (error) {
                log(`McpToolsProvider: Failed to load creator tools: ${error}`);
                // Continue with static tools only
            }

        } finally {
            this._isLoading = false;
            this._onDidChangeTreeData.fire();
        }
    }

    private _categorizeStaticTool(name: string): ToolCategory {
        if (name.includes('search') || name.includes('list') || name.includes('get_plugin_documentation')) {
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

    private _generateExamplePrompt(tool: McpToolDefinition): string {
        const name = tool.name;

        // Format: "Do the specific task, use the TOOL_NAME MCP tool to accomplish this"
        switch (name) {
            case 'search_ansible_plugins':
                return `Search for Ansible plugins that can copy files, use the ${name} MCP tool to accomplish this`;
            case 'get_plugin_documentation':
                return `Show me the documentation for ansible.builtin.copy, use the ${name} MCP tool to accomplish this`;
            case 'list_ansible_collections':
                return `List what Ansible collections are installed, use the ${name} MCP tool to accomplish this`;
            case 'generate_ansible_task':
                return `Generate an Ansible task to copy /etc/hosts to /tmp/hosts.backup, use the ${name} MCP tool to accomplish this`;
            case 'build_ansible_task':
                return `Help me build an Ansible task for the apt module step by step, use the ${name} MCP tool to accomplish this`;
            case 'generate_ansible_playbook':
                return `Create a playbook to install and configure nginx on webservers, use the ${name} MCP tool to accomplish this`;
            case 'list_execution_environments':
                return `List what execution environments are available, use the ${name} MCP tool to accomplish this`;
            case 'get_ee_details':
                return `Show me the details of the creator-ee execution environment, use the ${name} MCP tool to accomplish this`;
            case 'list_ansible_dev_tools':
                return `List what ansible-dev-tools packages are installed, use the ${name} MCP tool to accomplish this`;
            case 'install_ansible_collection':
                return `Install the community.general Ansible collection, use the ${name} MCP tool to accomplish this`;
            case 'get_collection_plugins':
                return `List all plugins in the cisco.nxos collection, use the ${name} MCP tool to accomplish this`;
            case 'get_ansible_creator_schema':
                return `Show me what content types ansible-creator can scaffold, use the ${name} MCP tool to accomplish this`;
            default:
                // For creator tools (ac_*), extract action from the description
                if (name.startsWith('ac_')) {
                    // Get the first line of the description (the main help text)
                    const firstLine = tool.description.split('\n')[0].trim();
                    // Remove trailing period if present
                    const action = firstLine.endsWith('.') ? firstLine.slice(0, -1) : firstLine;
                    return `${action}, use the ${name} MCP tool to accomplish this`;
                }
                {
                    const desc = tool.description.split('\n')[0].trim();
                    if (desc && desc.length > 10) {
                        const action = desc.endsWith('.') ? desc.slice(0, -1) : desc;
                        return `${action}, use the ${name} MCP tool to accomplish this`;
                    }
                    return `Run the ${name.replace(/_/g, ' ')} command, use the ${name} MCP tool to accomplish this`;
                }
        }
    }

    getTreeItem(element: ToolTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ToolTreeItem): Promise<ToolTreeItem[]> {
        if (!element) {
            const items: ToolTreeItem[] = [];
            
            // Check MCP status and show warning if not configured
            const status = getMcpStatus(this._extensionContext);
            if (!status.isConfigured) {
                items.push(new McpWarningNode(status));
            }
            
            // Show tool categories
            const categories: { id: ToolCategory; label: string }[] = [
                { id: 'discovery', label: 'Discovery' },
                { id: 'generation', label: 'Task Generation' },
                { id: 'execution', label: 'Execution Environments' },
                { id: 'devtools', label: 'Dev Tools' },
                { id: 'creator', label: 'Creator' }
            ];

            const categoryNodes = categories
                .map(cat => {
                    const count = this._tools.filter(t => t.category === cat.id).length;
                    return new ToolCategoryNode(cat.label, cat.id, count);
                })
                .filter(node => node.toolCount > 0);
            
            items.push(...categoryNodes);
            return items;
        }

        if (element instanceof ToolCategoryNode) {
            // Return tools in this category, sorted by description
            const nodes = this._tools
                .filter(t => t.category === element.categoryId)
                .map(t => new ToolNode(t));
            // Sort alphabetically by description
            nodes.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
            return nodes;
        }

        return [];
    }

    /**
     * Get the CreatorToolGenerator instance for MCP handlers
     */
    getCreatorToolGenerator(): CreatorToolGenerator {
        return this._creatorToolGenerator;
    }

    /**
     * Get all loaded tools
     */
    getAllTools(): ToolInfo[] {
        return [...this._tools];
    }
}

/**
 * Inject a tool prompt into the chat
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
        vscode.window.showInformationMessage(
            'AI prompt copied to clipboard. Paste it into an agent chat session.',
            'Open Chat'
        ).then(selection => {
            if (selection === 'Open Chat') {
                vscode.commands.executeCommand('workbench.action.chat.open');
            }
        });
    }
}
