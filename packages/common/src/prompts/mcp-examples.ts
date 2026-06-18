/**
 * AI prompt builders for MCP tool example prompts.
 * These generate example chat prompts that demonstrate how to use MCP tools.
 * Centralized here so they can be reused across extension, MCP server, or CLI.
 */

/** Known MCP tool names with curated example prompts. */
const TOOL_EXAMPLES: Record<string, string> = {
    search_ansible_plugins:
        'Ask me what kind of Ansible plugin I need, then use the search_ansible_plugins MCP tool to find matching plugins',
    get_plugin_documentation:
        'Ask me which Ansible plugin I want to learn about, then use the get_plugin_documentation MCP tool to retrieve and explain its documentation',
    list_ansible_collections:
        'List what Ansible collections are installed, use the list_ansible_collections MCP tool to accomplish this',
    generate_ansible_task:
        'Ask me what I want an Ansible task to do, then use the generate_ansible_task MCP tool to create it',
    build_ansible_task:
        'Ask me which Ansible module I want to use, then help me build a task step by step using the build_ansible_task MCP tool',
    generate_ansible_playbook:
        'Ask me what I want a playbook to accomplish, then use the generate_ansible_playbook MCP tool to create it',
    list_execution_environments:
        'List what execution environments are available, use the list_execution_environments MCP tool to accomplish this',
    get_ee_details:
        'Ask me which execution environment I want to inspect, then use the get_ee_details MCP tool to show its details',
    list_ansible_dev_tools:
        'List what ansible-dev-tools packages are installed, use the list_ansible_dev_tools MCP tool to accomplish this',
    install_ansible_collection:
        'Ask me which Ansible collection I want to install, then use the install_ansible_collection MCP tool to install it',
    get_collection_plugins:
        'Ask me which Ansible collection I want to explore, then use the get_collection_plugins MCP tool to list its plugins',
    get_ansible_creator_schema:
        'Show me what content types ansible-creator can scaffold, use the get_ansible_creator_schema MCP tool to accomplish this',
};

/**
 * Generate an example chat prompt demonstrating how to use a specific MCP tool.
 *
 * For well-known tools, returns a curated example. For `ac_*` creator tools and
 * other unknown tools, derives the example from the tool's description.
 *
 * @param toolName - MCP tool name (e.g. "search_ansible_plugins").
 * @param toolDescription - Tool description text (used as fallback for unknown tools).
 * @returns Example prompt suitable for injection into chat.
 */
export function buildMcpToolExamplePrompt(toolName: string, toolDescription: string): string {
    const curated = TOOL_EXAMPLES[toolName];
    if (curated) {
        return curated;
    }

    if (toolName.startsWith('ac_')) {
        const firstLine = toolDescription.split('\n')[0].trim();
        const action = firstLine.endsWith('.') ? firstLine.slice(0, -1) : firstLine;
        return `${action}, use the ${toolName} MCP tool to accomplish this`;
    }

    const desc = toolDescription.split('\n')[0].trim();
    if (desc && desc.length > 10) {
        const action = desc.endsWith('.') ? desc.slice(0, -1) : desc;
        return `${action}, use the ${toolName} MCP tool to accomplish this`;
    }
    return `Run the ${toolName.replace(/_/g, ' ')} command, use the ${toolName} MCP tool to accomplish this`;
}
