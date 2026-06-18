/**
 * AI prompt builders for ansible-creator scaffolding.
 * Each builder imports a skill markdown file and appends dynamic context.
 */

import { stripFrontmatter } from '../utils/skillHelpers';

import overviewCreatorSkill from '../skills/overview-creator.content';
import walkthroughSkill from '../skills/walkthrough-creator-command.content';

/**
 * Build a prompt to explain ansible-creator capabilities.
 *
 * @returns Prompt requesting an overview of ansible-creator's scaffolding features.
 */
export function buildCreatorOverviewPrompt(): string {
    return stripFrontmatter(overviewCreatorSkill);
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
    const descLine = description ? `Description: ${description}\n` : '';
    return (
        `${stripFrontmatter(walkthroughSkill)}\n` +
        `Command: ${commandStr}\n` +
        `MCP Tool: ${toolName}\n` +
        descLine
    );
}
