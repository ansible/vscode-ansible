/**
 * AI prompt builders for MCP tool example prompts.
 * These generate example chat prompts that demonstrate how to use MCP tools.
 * Centralized here so they can be reused across extension, MCP server, or CLI.
 */

/** Known MCP tool names with curated example prompts. */
const TOOL_EXAMPLES: Record<string, string> = {
    search_ansible_plugins:
        'Search for Ansible plugins that can copy files, use the search_ansible_plugins MCP tool to accomplish this',
    get_plugin_documentation:
        'Show me the documentation for ansible.builtin.copy, use the get_plugin_documentation MCP tool to accomplish this',
    list_ansible_collections:
        'List what Ansible collections are installed, use the list_ansible_collections MCP tool to accomplish this',
    generate_ansible_task:
        'Generate an Ansible task to copy /etc/hosts to /tmp/hosts.backup, use the generate_ansible_task MCP tool to accomplish this',
    build_ansible_task:
        'Help me build an Ansible task for the apt module step by step, use the build_ansible_task MCP tool to accomplish this',
    generate_ansible_playbook:
        'Create a playbook to install and configure nginx on webservers, use the generate_ansible_playbook MCP tool to accomplish this',
    list_execution_environments:
        'List what execution environments are available, use the list_execution_environments MCP tool to accomplish this',
    get_ee_details:
        'Show me the details of the creator-ee execution environment, use the get_ee_details MCP tool to accomplish this',
    list_ansible_dev_tools:
        'List what ansible-dev-tools packages are installed, use the list_ansible_dev_tools MCP tool to accomplish this',
    install_ansible_collection:
        'Install the community.general Ansible collection, use the install_ansible_collection MCP tool to accomplish this',
    get_collection_plugins:
        'List all plugins in the cisco.nxos collection, use the get_collection_plugins MCP tool to accomplish this',
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
