/**
 * AI prompt builders for Ansible Execution Environments.
 * Each builder imports a skill markdown file and appends dynamic context.
 */

import { stripFrontmatter } from '../utils/skillHelpers';

import summarizeEEsSkill from '../skills/summarize-execution-envs.content';
import detailEESkill from '../skills/detail-execution-env.content';

/**
 * Build a prompt to summarize all available execution environments.
 *
 * @returns Prompt instructing the AI to list and compare EEs.
 */
export function buildEESummaryPrompt(): string {
    return stripFrontmatter(summarizeEEsSkill);
}

/**
 * Build a prompt to describe a specific execution environment in detail.
 *
 * @param eeName - Name/label of the execution environment.
 * @returns Prompt requesting detailed EE analysis.
 */
export function buildEEDetailPrompt(eeName: string): string {
    return `${stripFrontmatter(detailEESkill)}\nExecution Environment: ${eeName}`;
}
