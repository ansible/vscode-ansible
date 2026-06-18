/**
 * AI prompt builders for plugin documentation interaction.
 * Each builder imports a skill markdown file and appends dynamic context.
 */

import { stripFrontmatter } from '../utils/skillHelpers';

import buildTaskSkill from '../skills/build-task.content';

/**
 * Build a prompt to interactively create a task using a specific plugin.
 *
 * @param fqcn - Fully qualified collection name of the plugin (e.g. "ansible.builtin.copy").
 * @param pluginType - Plugin type (module, lookup, filter, etc.).
 * @returns Prompt that guides the user through building a task with the AI task builder.
 */
export function buildTaskBuilderPrompt(fqcn: string, pluginType: string): string {
    return `${stripFrontmatter(buildTaskSkill)}\nPlugin: ${fqcn}\nType: ${pluginType}`;
}
