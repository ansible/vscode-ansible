/**
 * AI prompt builders for skill loading and application.
 * Centralized here so they can be reused across extension, MCP server, or CLI.
 */

/**
 * Build a prompt to load a skill via MCP and apply its guidance.
 *
 * @param skillName - Human-readable skill name.
 * @param skillId - Unique skill identifier.
 * @param skillDescription - Brief description of what the skill helps with.
 * @returns Prompt instructing the AI to load and follow the skill.
 */
export function buildSkillLoadPrompt(
    skillName: string,
    skillId: string,
    skillDescription: string,
): string {
    return (
        `Use the skill_get tool to load the "${skillName}" skill (ID: "${skillId}"), ` +
        `then follow its guidance to help me with: ${skillDescription}`
    );
}

/**
 * Build a prompt for copying to clipboard that loads and applies a skill.
 *
 * @param skillName - Human-readable skill name.
 * @param skillId - Unique skill identifier.
 * @param skillDescription - Brief description of what the skill helps with.
 * @returns Prompt using explicit MCP tool call syntax for clipboard use.
 */
export function buildSkillClipboardPrompt(
    skillName: string,
    skillId: string,
    skillDescription: string,
): string {
    return (
        `Use the MCP tool skill_get({ skill_id: "${skillId}" }) to load the ` +
        `"${skillName}" skill, then apply its guidance to help me with: ${skillDescription}`
    );
}
