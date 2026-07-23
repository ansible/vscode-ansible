/**
 * MCP Tools controller
 *
 * Loads available MCP tools and provides example prompts for chat injection.
 */

import * as vscode from 'vscode';
import { STATIC_TOOLS, type McpToolDefinition, CreatorToolGenerator } from '@ansible/mcp-server';
import { CreatorService, buildMcpToolExamplePrompt } from '@ansible/developer-services';
import { log } from '@src/extension';
import { openChatWithPrompt } from '@src/features/chatProvider';

type ToolCategory =
    'getting_started' | 'discovery' | 'generation' | 'execution' | 'devtools' | 'creator';

export interface ToolInfo {
    tool: McpToolDefinition;
    category: ToolCategory;
    examplePrompt: string;
}

/** NavTree data source for Ansible MCP tools and example chat prompts. */
export class McpToolsController {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    private _tools: ToolInfo[] = [];
    private _creatorToolGenerator: CreatorToolGenerator;
    private _isLoading = false;
    private _creatorServiceListener: vscode.Disposable | undefined;

    /**
     * Create the controller and load static and creator MCP tools.
     * @param _context - Extension context (reserved for future MCP host wiring)
     */
    constructor(_context: vscode.ExtensionContext) {
        void _context;
        this._creatorToolGenerator = new CreatorToolGenerator();

        // Listen for CreatorService changes to auto-refresh when schema loads
        const creatorService = CreatorService.getInstance();
        this._creatorServiceListener = (creatorService.onDidChange as vscode.Event<void>)(() => {
            if (creatorService.isLoaded()) {
                log('McpToolsController: CreatorService loaded, refreshing tools...');
                void this._loadTools();
            }
        });

        void this._loadTools();
    }

    /** Release creator service listeners and event emitters. */
    dispose(): void {
        this._creatorServiceListener?.dispose();
        this._onDidChange.dispose();
    }

    /** Reload MCP tool definitions and notify NavTree listeners. */
    refresh(): void {
        void this._loadTools();
    }

    /** Load static and creator-generated MCP tools into the model. */
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
                log('McpToolsController: Loading creator tools...');
                await this._creatorToolGenerator.refresh();
                const creatorTools = this._creatorToolGenerator.getTools();
                log(
                    `McpToolsController: CreatorToolGenerator returned ${String(creatorTools.length)} tools`,
                );

                for (const tool of creatorTools) {
                    const examplePrompt = this._generateExamplePrompt(tool);
                    this._tools.push({ tool, category: 'creator', examplePrompt });
                }

                log(
                    `McpToolsController: Loaded ${String(STATIC_TOOLS.length)} static + ${String(creatorTools.length)} creator tools`,
                );
            } catch (error) {
                log(
                    `McpToolsController: Failed to load creator tools: ${error instanceof Error ? error.message : String(error)}`,
                );
                // Continue with static tools only
            }
        } finally {
            this._isLoading = false;
            this._onDidChange.fire(undefined);
        }
    }

    /**
     * Assign a display category to a static MCP tool by name.
     * @param name - MCP tool identifier
     * @returns Category used to group the tool in the NavTree
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
    await openChatWithPrompt(toolInfo.examplePrompt);
    log(`McpToolsController: Opened chat with prompt`);
}
