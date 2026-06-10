import { format } from 'util';
import { MarkupContent, MarkupKind } from 'vscode-languageserver';
import { parse, toMD } from 'antsibull-docs';
import type { PluginDoc, PluginOption } from '@ansible/core/out/services/CollectionsService';

/**
 * Formats Ansible module documentation as LSP markdown hover content.
 *
 * @param doc - Plugin documentation from the collections cache.
 * @returns Markdown markup content for display in hovers.
 */
export function formatModule(doc: PluginDoc): MarkupContent {
    const sections: string[] = [];

    if (doc.short_description) {
        sections.push(`*${formatDescription(doc.short_description)}*`);
    }
    if (doc.description) {
        sections.push('**Description**');
        sections.push(formatDescription(doc.description));
    }
    if (doc.requirements) {
        sections.push('**Requirements**');
        sections.push(formatDescription(doc.requirements));
    }
    if (doc.notes) {
        sections.push('**Notes**');
        sections.push(formatDescription(doc.notes));
    }

    return {
        kind: MarkupKind.Markdown,
        value: sections.join('\n\n'),
    };
}

/**
 * Formats a single module option as LSP markdown hover content.
 *
 * @param option - Option specification from plugin documentation.
 * @param name - Canonical option name.
 * @param withDetails - Whether to include type and required metadata.
 * @returns Markdown markup content for the option.
 */
export function formatOption(
    option: PluginOption,
    name: string,
    withDetails = false,
): MarkupContent {
    const sections: string[] = [];

    if (withDetails) {
        const details = getDetails(option);
        if (details) {
            sections.push(`\`${details}\``);
        }
    }

    if (option.description) {
        sections.push(formatDescription(option.description, false));
    }

    if (option.default !== undefined) {
        sections.push(`*Default*:\n \`\`\`javascript\n${format(option.default)}\n\`\`\``);
    }

    if (option.choices) {
        const formatted = option.choices.map((c) => `\`${c}\``);
        sections.push(`*Choices*: [${formatted.join(', ')}]`);
    }

    if (option.aliases) {
        const withBase = [name, ...option.aliases];
        const formatted = withBase.map((a) => `\`${a}\``);
        sections.push(`*Aliases*: [${formatted.join(', ')}]`);
    }

    return {
        kind: MarkupKind.Markdown,
        value: sections.join('\n\n'),
    };
}

/**
 * Builds a compact type and requirement summary for a module option.
 *
 * @param option - Option specification to summarize.
 * @returns A parenthetical detail string, or undefined when empty.
 */
export function getDetails(option: PluginOption): string | undefined {
    const details: string[] = [];

    if (option.required) {
        details.push('(required)');
    }
    if (option.type) {
        if (option.type === 'list' && option.elements) {
            details.push(`list(${option.elements})`);
        } else {
            details.push(option.type);
        }
    }

    return details.length > 0 ? details.join(' ') : undefined;
}

/**
 * Normalizes plugin description text into markdown, optionally as a bullet list.
 *
 * @param doc - Raw description string or list of paragraphs.
 * @param asList - When true, array entries are rendered as list items.
 * @returns Formatted markdown text.
 */
function formatDescription(doc?: string | string[], asList = true): string {
    if (!doc) return '';

    if (Array.isArray(doc)) {
        const lines = doc.map((element) =>
            asList ? `- ${replaceMacros(element)}` : `${replaceMacros(element)}\n`,
        );
        return lines.join('\n');
    }

    if (typeof doc === 'string') {
        return replaceMacros(doc);
    }

    return '';
}

/**
 * Converts antsibull-docs macro syntax in a string to markdown.
 *
 * @param text - Raw documentation text that may contain macros.
 * @returns Markdown-safe text.
 */
function replaceMacros(text: unknown): string {
    const safeText = typeof text === 'string' ? text : JSON.stringify(text);
    return toMD(parse(safeText));
}
