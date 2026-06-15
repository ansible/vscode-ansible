import type { PluginOption } from '../bridge/plugin-doc';
import { toArray } from './ansible-markup';

export type CommentMode = 'none' | 'optional' | 'descriptions';

/**
 * Convert example or task titles into title case for display.
 * @param text - Raw title text from plugin documentation
 * @returns Title-cased display text
 */
export function capitalizeTitle(text: string): string {
    if (!text) {
        return text;
    }
    return text
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Generate sample task YAML for the requested comment mode.
 * @param fqcn - Fully qualified plugin name
 * @param options - Parameter schema map for the plugin
 * @param commentMode - Comment style to apply to generated YAML
 * @returns Sample task YAML text
 */
export function generateSampleYaml(
    fqcn: string,
    options: Record<string, PluginOption>,
    commentMode: CommentMode,
): string {
    const lines: string[] = [];
    const pluginName = fqcn.split('.').pop() ?? fqcn;

    lines.push(`- name: ${capitalizeTitle(pluginName.replace(/_/g, ' '))} task`);
    lines.push(`  ${fqcn}:`);

    const sortedOptions = Object.entries(options).sort((a, b) => {
        const aReq = a[1].required ? 0 : 1;
        const bReq = b[1].required ? 0 : 1;
        if (aReq !== bReq) {
            return aReq - bReq;
        }
        return a[0].localeCompare(b[0]);
    });

    for (const [name, opt] of sortedOptions) {
        addParamToYaml(lines, name, opt, 4, false, commentMode);
    }

    return lines.join('\n');
}

/**
 * Append one parameter and its suboptions to generated sample YAML lines.
 * @param lines - Accumulated YAML lines for the sample task
 * @param name - Parameter name
 * @param opt - Parameter schema metadata
 * @param indent - Current indentation level in spaces
 * @param isFirstInList - Whether this parameter starts a YAML list item
 * @param commentMode - Comment style to apply to generated YAML
 */
function addParamToYaml(
    lines: string[],
    name: string,
    opt: PluginOption,
    indent: number,
    isFirstInList = false,
    commentMode: CommentMode = 'optional',
): void {
    const spaces = ' '.repeat(indent);

    let comment = '';
    if (commentMode === 'descriptions') {
        const desc = toArray(opt.description)[0] ?? '';
        const cleanDesc = desc.replace(/\s+/g, ' ').trim();
        const truncatedDesc =
            cleanDesc.length > 60 ? cleanDesc.substring(0, 57) + '...' : cleanDesc;
        const typeStr = opt.type ?? 'str';
        const reqMarker = opt.required ? 'required' : 'optional';
        comment = `  # (${typeStr}, ${reqMarker}) ${truncatedDesc}`;
    } else if (commentMode === 'optional') {
        comment = opt.required ? '' : '  # optional';
    }

    const prefix = isFirstInList ? '- ' : '';
    const prefixSpaces = isFirstInList ? ' '.repeat(indent - 2) : spaces;

    const value = getExampleValue(name, opt);

    if (opt.suboptions && Object.keys(opt.suboptions).length > 0) {
        const sortedSubopts = Object.entries(opt.suboptions).sort((a, b) => {
            const aReq = a[1].required ? 0 : 1;
            const bReq = b[1].required ? 0 : 1;
            if (aReq !== bReq) {
                return aReq - bReq;
            }
            return a[0].localeCompare(b[0]);
        });

        if (opt.type === 'list') {
            lines.push(`${prefixSpaces}${prefix}${name}:${comment}`);

            let isFirst = true;
            for (const [subName, subOpt] of sortedSubopts) {
                addParamToYaml(lines, subName, subOpt, indent + 4, isFirst, commentMode);
                isFirst = false;
            }
        } else {
            lines.push(`${prefixSpaces}${prefix}${name}:${comment}`);

            for (const [subName, subOpt] of sortedSubopts) {
                addParamToYaml(lines, subName, subOpt, indent + 2, false, commentMode);
            }
        }
    } else if (opt.type === 'list') {
        const elemValue = getElementValue(name, opt);
        lines.push(`${prefixSpaces}${prefix}${name}:${comment}`);
        lines.push(`${spaces}  - ${elemValue}`);
    } else {
        lines.push(`${prefixSpaces}${prefix}${name}: ${value}${comment}`);
    }
}

/**
 * Choose a representative example value for a parameter.
 * @param name - Parameter name
 * @param opt - Parameter schema metadata
 * @returns Example YAML value text for the parameter
 */
function getExampleValue(name: string, opt: PluginOption): string {
    if (opt.default !== undefined && opt.default !== null) {
        return formatYamlValue(opt.default);
    }

    if (opt.choices && opt.choices.length > 0) {
        return formatYamlValue(opt.choices[0]);
    }

    switch (opt.type) {
        case 'bool':
        case 'boolean':
            return 'true';
        case 'int':
        case 'integer':
            return '0';
        case 'float':
            return '0.0';
        case 'path':
            return '"/path/to/file"';
        case 'raw':
        case 'jsonarg':
            return '{}';
        case 'dict':
            return '{}';
        case 'list':
            return '[]';
        case 'str':
        case 'string':
        default:
            return getContextualExample(name);
    }
}

/**
 * Choose an example list element value for a list-typed parameter.
 * @param name - Parameter name
 * @param opt - Parameter schema metadata
 * @returns Example YAML list item value
 */
function getElementValue(name: string, opt: PluginOption): string {
    if (opt.elements) {
        switch (opt.elements) {
            case 'dict':
                return '{}';
            case 'int':
            case 'integer':
                return '1';
            case 'bool':
            case 'boolean':
                return 'true';
            case 'str':
            case 'string':
            default:
                return `"${name}_item"`;
        }
    }
    return `"${name}_item"`;
}

/**
 * Generate a contextual string example based on common parameter names.
 * @param name - Parameter name used to infer a realistic example
 * @returns Quoted example string for the parameter
 */
function getContextualExample(name: string): string {
    const lowerName = name.toLowerCase();

    if (lowerName.includes('name')) {
        return '"example_name"';
    }
    if (lowerName.includes('path') || lowerName.includes('dest') || lowerName.includes('src')) {
        return '"/path/to/file"';
    }
    if (lowerName.includes('host')) {
        return '"hostname.example.com"';
    }
    if (lowerName.includes('port')) {
        return '22';
    }
    if (lowerName.includes('user')) {
        return '"admin"';
    }
    if (lowerName.includes('pass') || lowerName.includes('secret')) {
        return '"{{ vault_password }}"';
    }
    if (lowerName.includes('url')) {
        return '"https://example.com"';
    }
    if (lowerName.includes('state')) {
        return '"present"';
    }
    if (lowerName.includes('mode')) {
        return '"0644"';
    }
    if (lowerName.includes('owner')) {
        return '"root"';
    }
    if (lowerName.includes('group')) {
        return '"root"';
    }
    if (lowerName.includes('text') || lowerName.includes('content') || lowerName.includes('data')) {
        return '"example content"';
    }
    if (lowerName.includes('command') || lowerName.includes('cmd')) {
        return '"echo hello"';
    }
    if (lowerName.includes('timeout')) {
        return '30';
    }
    if (lowerName.includes('delay')) {
        return '5';
    }
    if (lowerName.includes('retries') || lowerName.includes('retry')) {
        return '3';
    }
    if (
        lowerName.includes('regexp') ||
        lowerName.includes('regex') ||
        lowerName.includes('pattern')
    ) {
        return '"^.*$"';
    }
    if (lowerName.includes('line')) {
        return '"example line"';
    }
    if (lowerName.includes('key')) {
        return '"key_name"';
    }
    if (lowerName.includes('value')) {
        return '"value"';
    }
    if (lowerName.includes('version')) {
        return '"1.0.0"';
    }
    if (lowerName.includes('interface')) {
        return '"eth0"';
    }
    if (lowerName.includes('vlan')) {
        return '100';
    }
    if (lowerName.includes('ip') || lowerName.includes('address')) {
        return '"192.168.1.1"';
    }
    if (lowerName.includes('network') || lowerName.includes('subnet')) {
        return '"192.168.1.0/24"';
    }

    return `"${name}_value"`;
}

/**
 * Format a JavaScript value as YAML literal text.
 * @param value - Value to render into sample YAML
 * @returns YAML-safe literal representation
 */
export function formatYamlValue(value: unknown): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        if (
            value === '' ||
            value.includes(':') ||
            value.includes('#') ||
            value.includes("'") ||
            value.includes('"') ||
            value.includes('\n') ||
            value.startsWith(' ') ||
            value.endsWith(' ') ||
            /^[{[\]|>*&!%@`]/.test(value)
        ) {
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        if (/^(true|false|yes|no|on|off|null|~|\d+\.?\d*)$/i.test(value)) {
            return `"${value}"`;
        }
        return value;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[]';
        }
        return JSON.stringify(value);
    }
    if (typeof value === 'object') {
        if (Object.keys(value).length === 0) {
            return '{}';
        }
        return JSON.stringify(value);
    }
    return JSON.stringify(value);
}
