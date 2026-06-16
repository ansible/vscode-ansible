/**
 * AI prompt builders for Ansible Execution Environments.
 * Centralized here so they can be reused across extension, MCP server, or CLI.
 */

/**
 * Build a prompt to summarize all available execution environments.
 *
 * @returns Prompt instructing the AI to list and compare EEs.
 */
export function buildEESummaryPrompt(): string {
    return `Generate a summary of the available Ansible Execution Environments.

Use the \`list_execution_environments\` MCP tool to get the list of available EEs, then provide:
1. An overview of each execution environment and its purpose
2. Key tools and collections included in each
3. Recommendations for which EE to use for different scenarios`;
}

/**
 * Build a prompt to describe a specific execution environment in detail.
 *
 * @param eeName - Name/label of the execution environment.
 * @returns Prompt requesting detailed EE analysis.
 */
export function buildEEDetailPrompt(eeName: string): string {
    return `Generate a detailed summary of the Ansible Execution Environment "${eeName}".

Use the \`get_ee_details\` MCP tool with ee_name="${eeName}" to get all information about this EE.

The tool returns complete details including:
- Container base OS and Ansible version
- ALL installed Python packages with versions
- ALL installed Ansible collections with versions
- System packages (if available)

Based on the tool output, provide:
1. A summary of the container image and its base OS
2. Key Python packages and what they enable
3. Notable Ansible collections included and their use cases
4. Best use cases for this execution environment`;
}
