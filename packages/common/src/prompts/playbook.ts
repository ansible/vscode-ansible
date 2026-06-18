/**
 * AI prompt builders for playbook-related analysis.
 * Each builder imports a skill markdown file and appends dynamic context.
 */

import { stripFrontmatter } from '../utils/skillHelpers';

import analyzeTaskResultSkill from '../skills/analyze-task-result.content';
import summarizePlaybookSkill from '../skills/summarize-playbook.content';

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

    const cleanResult: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
        if (!key.startsWith('_ansible_') && key !== 'invocation') {
            cleanResult[key] = value;
        }
    }

    const statusText = status === 'failed' ? 'FAILED' : status === 'changed' ? 'CHANGED' : 'OK';
    const sourceInfo = taskPath ? `Source: ${taskPath}\n` : '';

    return (
        `${stripFrontmatter(analyzeTaskResultSkill)}\n` +
        `Task: ${taskName}\n` +
        `Module: ${module}\n` +
        `Host: ${host}\n` +
        `Status: ${statusText}\n` +
        sourceInfo +
        `Args:\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n` +
        `Result:\n\`\`\`json\n${JSON.stringify(cleanResult, null, 2)}\n\`\`\``
    );
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
    return (
        `${stripFrontmatter(summarizePlaybookSkill)}\n` +
        `Playbook: ${playbookName}\n` +
        `Path: ${relativePath}`
    );
}
