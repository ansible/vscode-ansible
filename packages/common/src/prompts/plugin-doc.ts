/**
 * AI prompt builders for plugin documentation interaction.
 * Centralized here so they can be reused across extension, MCP server, or CLI.
 */

/**
 * Build a prompt to interactively create a task using a specific plugin.
 *
 * @param fqcn - Fully qualified collection name of the plugin (e.g. "ansible.builtin.copy").
 * @param pluginType - Plugin type (module, lookup, filter, etc.).
 * @returns Prompt that guides the user through building a task with the AI task builder.
 */
export function buildTaskBuilderPrompt(fqcn: string, pluginType: string): string {
    return `Help me create an Ansible task using the ${fqcn} ${pluginType}, guiding me through the required and optional parameters. Use the build_ansible_task MCP tool to accomplish this.`;
}
