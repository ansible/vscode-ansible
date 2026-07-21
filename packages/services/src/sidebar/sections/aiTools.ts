/**
 * AI Tools NavTree section.
 */
import type { SidebarSection, SidebarTreeNode } from '@ansible/common';
import type { SidebarAiToolInput, SidebarModelInput } from '../types';

/**
 * Build AI Tools (MCP tool categories) when AI features are enabled.
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildAiTools(input: SidebarModelInput): SidebarSection {
    const tools = input.aiTools ?? [];
    const iconMap: Record<string, string> = {
        getting_started: 'rocket',
        discovery: 'search',
        generation: 'code',
        execution: 'package',
        devtools: 'tools',
        creator: 'wand',
    };
    const byCategory = new Map<string, SidebarAiToolInput[]>();
    for (const tool of tools) {
        const list = byCategory.get(tool.category) ?? [];
        list.push(tool);
        byCategory.set(tool.category, list);
    }
    const categoryNodes: SidebarTreeNode[] = [...byCategory.entries()].map(
        ([category, catTools]) => ({
            id: `ai-cat-${category}`,
            label: catTools[0]?.categoryLabel ?? category,
            description: `${String(catTools.length)} tools`,
            icon: iconMap[category] ?? 'symbol-misc',
            children: catTools
                .slice()
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((t) => ({
                    id: `ai-tool-${t.name}`,
                    label: t.label,
                    tooltip: formatAiToolTooltip(t),
                    icon: 'sparkle',
                    actions: [
                        {
                            id: `ai-use-${t.name}`,
                            label: 'Use in Chat',
                            icon: 'comment',
                            command: 'ansibleMcpTools.useInChat',
                            args: [t.toolInfo],
                        },
                        {
                            id: `ai-copy-${t.name}`,
                            label: 'Copy Prompt',
                            icon: 'copy',
                            command: 'ansibleMcpTools.copyPrompt',
                            // Handler expects { toolInfo: ToolInfo }
                            args: [{ toolInfo: t.toolInfo }],
                        },
                    ],
                })),
        }),
    );
    const nodes: SidebarTreeNode[] = [];
    if (input.mcpConfigured === false) {
        const ide = input.mcpIdeLabel ?? 'this IDE';
        nodes.push({
            id: 'mcp-warning',
            label: `MCP not configured for ${ide}`,
            description: 'click to configure',
            tooltip: `AI tools require MCP to be configured.\n\nClick to configure for ${ide}.`,
            icon: 'warning',
            warning: true,
            actions: [
                {
                    id: 'mcp-configure',
                    label: 'Configure MCP',
                    icon: 'gear',
                    command: 'ansibleMcpTools.configure',
                },
            ],
        });
    }
    nodes.push(...categoryNodes);
    return {
        id: 'aiTools',
        title: 'AI Tools',
        headerActions: [
            {
                id: 'ai-tools-refresh',
                label: 'Refresh',
                icon: 'refresh',
                command: 'ansibleMcpTools.refresh',
            },
        ],
        nodes,
    };
}

/**
 * Plain-text hover content for an MCP tool row (native McpToolsController tooltip).
 * @param tool - AI tool input row
 * @returns Multiline tooltip
 */
function formatAiToolTooltip(tool: SidebarAiToolInput): string {
    const info = tool.toolInfo as
        | {
              tool?: {
                  name?: string;
                  description?: string;
                  inputSchema?: {
                      properties?: Record<string, { description?: string; type?: string }>;
                      required?: string[];
                  };
              };
              examplePrompt?: string;
          }
        | undefined;
    const def = info?.tool;
    const lines: string[] = [def?.name ?? tool.name, ''];
    if (def?.description) {
        lines.push(def.description, '');
    }
    const inputSchema = def?.inputSchema;
    const props = inputSchema?.properties;
    if (props && Object.keys(props).length > 0) {
        const required = new Set(inputSchema.required ?? []);
        lines.push('Parameters:');
        for (const [name, schema] of Object.entries(props)) {
            const reqMark = required.has(name) ? ' (required)' : '';
            lines.push(`- ${name}${reqMark}: ${schema.description ?? schema.type ?? 'any'}`);
        }
        lines.push('');
    }
    const example = info?.examplePrompt ?? tool.examplePrompt;
    if (example) {
        lines.push('Example prompt:', example);
    }
    return lines.join('\n').trim();
}
