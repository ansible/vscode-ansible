/**
 * AI prompt builders for ansible-creator scaffolding.
 * Centralized here so they can be reused across extension, MCP server, or CLI.
 */

/**
 * Build a prompt to explain ansible-creator capabilities.
 *
 * @returns Prompt requesting an overview of ansible-creator's scaffolding features.
 */
export function buildCreatorOverviewPrompt(): string {
    return `Explain the ansible-creator scaffolding tool and summarize its capabilities.

Use the \`get_ansible_creator_schema\` MCP tool to get the full schema, then provide:
1. What ansible-creator is and why it's useful
2. A summary of each content type it can scaffold (collections, playbooks, plugins, etc.)
3. The key parameters for each scaffolding command
4. Best practices for starting new Ansible projects
5. How the generated structure follows Ansible best practices`;
}

/**
 * Build a prompt to walk through a specific ansible-creator command.
 *
 * @param commandStr - Human-readable command string (e.g. "ansible-creator add plugin filter").
 * @param toolName - MCP tool name for this command (e.g. "ac_add_plug_filter").
 * @param description - Optional description of what the command does.
 * @returns Prompt guiding the user through the scaffolding command's parameters.
 */
export function buildCreatorCommandWalkthroughPrompt(
    commandStr: string,
    toolName: string,
    description?: string,
): string {
    const descLine = description ? `\nThis command: ${description}\n` : '';

    return `Help me use the "${commandStr}" command to scaffold new Ansible content.
${descLine}
Use the \`${toolName}\` MCP tool to execute this command once I provide the required parameters.

Please:
1. Explain what this command creates and the resulting directory structure
2. Walk me through the required and optional parameters
3. Suggest best practices for the values I should provide
4. After I provide the details, use the \`${toolName}\` tool to run the command`;
}
