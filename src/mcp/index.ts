/**
 * MCP Module Exports
 * 
 * Re-exports server implementation from @ansible/mcp-server plus VS Code–local MCP wiring.
 */

export {
    STATIC_TOOLS,
    type McpToolDefinition,
    type McpToolResult,
    PluginSearchIndex,
    type PluginSearchResult,
    TaskGenerator,
    type TaskGeneratorInput,
    type TaskGeneratorResult,
    TaskBuilder,
    type TaskBuilderInput,
    type TaskBuilderResult,
    CreatorToolGenerator,
    McpToolHandler,
} from '@ansible/mcp-server';
export { registerMcpServerProvider, isMcpAvailable } from './vscodeProvider';
export { configureCursorMcp, showCursorMcpStatus, getMcpStatus, McpStatus, detectIde, IdeType } from './cursorConfig';
