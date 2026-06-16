/**
 * AI prompt builders for playbook-related analysis.
 * Centralized here so they can be reused by extension, MCP server, or CLI.
 */

/** Input for building a task-level AI analysis prompt. */
export interface TaskAnalysisInput {
    taskName: string;
    module: string;
    host: string;
    status: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
    path?: string;
}

/**
 * Build a structured prompt for AI analysis of a single task execution result.
 * Instructs the agent to use MCP tools, read source, and provide actionable insights.
 *
 * @param input - Task execution details (name, module, host, status, args, result, path).
 * @returns Markdown-formatted prompt string suitable for chat injection.
 */
export function buildTaskAnalysisPrompt(input: TaskAnalysisInput): string {
    const { taskName, module, host, status, args, result, path: taskPath } = input;

    // Strip internal ansible keys from result for cleaner prompt
    const cleanResult: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
        if (!key.startsWith('_ansible_') && key !== 'invocation') {
            cleanResult[key] = value;
        }
    }

    const statusText = status === 'failed' ? 'FAILED' : status === 'changed' ? 'CHANGED' : 'OK';
    const sourceInfo = taskPath ? `**Source:** \`${taskPath}\`\n` : '';

    return `Analyze this Ansible task execution result and provide insights:

## Task: ${taskName}
**Module:** \`${module}\`
**Host:** ${host}
**Status:** ${statusText}
${sourceInfo}
## Invocation (Task Arguments)
\`\`\`yaml
${JSON.stringify(args, null, 2)}
\`\`\`

## Result
\`\`\`yaml
${JSON.stringify(cleanResult, null, 2)}
\`\`\`

## Instructions
1. Use the \`get_plugin_doc\` MCP tool to retrieve the documentation for the \`${module}\` module
2. Review the module's parameters, return values, and examples
3. ${taskPath ? `Read the source file at \`${taskPath}\` to understand the task context` : 'Analyze the task in isolation'}
4. Analyze the task result:
   - If FAILED: Explain the likely cause and suggest fixes
   - If CHANGED: Confirm expected behavior or flag any concerns
   - If OK: Verify the task behaved as intended
5. Compare the invocation against the module's best practices
6. Suggest any improvements to the task configuration`;
}

/**
 * Build a structured prompt for AI summary of an entire playbook.
 * Instructs the agent to read the file, catalog structure, and audit collections.
 *
 * @param relativePath - Workspace-relative path to the playbook file.
 * @param playbookName - Display name of the playbook.
 * @returns Markdown-formatted prompt string suitable for chat injection.
 */
export function buildPlaybookSummaryPrompt(relativePath: string, playbookName: string): string {
    return `Please analyze the Ansible playbook at "${relativePath}" and provide a comprehensive summary.

## Instructions:
1. Read the playbook file
2. Follow all imports (import_playbook, include_playbook)
3. Examine all roles used (check roles/ directory and requirements.yml)
4. List all tasks in order of execution
5. Identify any variables, handlers, and templates used
6. **Catalog all collections and plugins used** - note every fully-qualified collection name (FQCN) referenced in the playbook (e.g., ansible.builtin.copy, community.general.ufw)

## Required Output (in this order):

### Executive Summary
Provide a 1-2 paragraph summary explaining what this playbook accomplishes at a high level. Describe the purpose, the systems it targets, and the end result after successful execution. Write this for someone who needs to quickly understand what running this playbook will do.

### Hierarchical Structure
- Playbook: ${playbookName}
  - Play 1: [name] (hosts: [hosts])
    - Pre-tasks: [list]
    - Roles: [list with brief description]
    - Tasks: [list with brief description]
    - Handlers: [list]
    - Post-tasks: [list]
  - Play 2: ...

### Collections Used
List all collections referenced in the playbook with their FQCNs.

### Other Dependencies
Note any additional external dependencies (Galaxy roles, required variables, inventory requirements, etc.)

---

## Final Step: Collection Audit (Do this LAST)
**Important: Complete all sections above before this step.**

1. Use the \`list_collections\` MCP tool to check which collections are currently installed
2. Compare the installed collections against those required by the playbook
3. Note any version requirements from collections/requirements.yml if present
4. **End your response by asking the user** if they would like to install any missing collections using the \`install_collection\` MCP tool

This prompt should be the final thing in your response so the user can easily respond with their choice.`;
}
