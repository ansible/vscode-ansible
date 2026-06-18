/**
 * Helpers for working with internal skill markdown files.
 * Used by prompt builders to strip YAML frontmatter before composing prompts.
 */

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

/**
 * Remove YAML frontmatter fences from a skill markdown string.
 *
 * @param raw - Raw skill file content (may include `---` fenced frontmatter).
 * @returns The body text with frontmatter stripped and leading whitespace trimmed.
 */
export function stripFrontmatter(raw: string): string {
    return raw.replace(FRONTMATTER_RE, '').trim();
}
