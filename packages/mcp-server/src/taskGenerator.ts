/**
 * Task Generator
 * 
 * One-shot Ansible task YAML generation for any plugin.
 */

import { CollectionsService } from '@ansible/core';
import type { PluginData, PluginOption } from '@ansible/core';

export interface TaskGeneratorInput {
    plugin: string;
    plugin_type?: string;
    params: Record<string, unknown>;
    task_name?: string;
    register?: string;
    when?: string;
    loop?: unknown[];
    become?: boolean;
    ignore_errors?: boolean;
    tags?: string[];
}

export interface TaskGeneratorResult {
    yaml: string;
    warnings: string[];
}

export class TaskGenerator {
    private _docCache: Map<string, PluginData> = new Map();

    async generate(input: TaskGeneratorInput): Promise<TaskGeneratorResult> {
        const pluginType = input.plugin_type || 'module';
        const warnings: string[] = [];

        // Fetch plugin documentation
        const doc = await this._getPluginDoc(input.plugin, pluginType);

        if (!doc?.doc) {
            throw new Error(`Plugin not found: ${input.plugin}. Use search_ansible_plugins to find available plugins.`);
        }

        // Validate parameters
        const validation = this._validateParams(input.params, doc.doc.options || {});
        warnings.push(...validation.warnings);

        // Generate YAML
        const yaml = this._buildYaml(input, doc);

        return { yaml, warnings };
    }

    async generatePlaybook(input: {
        name: string;
        hosts: string;
        tasks: TaskGeneratorInput[];
        become?: boolean;
        vars?: Record<string, unknown>;
        gather_facts?: boolean;
    }): Promise<TaskGeneratorResult> {
        const warnings: string[] = [];
        const lines: string[] = [];

        lines.push('---');
        lines.push(`- name: ${input.name}`);
        lines.push(`  hosts: ${input.hosts}`);

        if (input.gather_facts === false) {
            lines.push('  gather_facts: false');
        }

        if (input.become) {
            lines.push('  become: true');
        }

        if (input.vars && Object.keys(input.vars).length > 0) {
            lines.push('  vars:');
            for (const [key, value] of Object.entries(input.vars)) {
                lines.push(`    ${key}: ${this._formatValue(value, 2)}`);
            }
        }

        lines.push('  tasks:');

        for (const task of input.tasks) {
            try {
                const result = await this.generate(task);
                // Indent the task and add to playbook
                const taskLines = result.yaml.split('\n');
                for (const line of taskLines) {
                    lines.push('  ' + line);
                }
                lines.push(''); // Blank line between tasks
                warnings.push(...result.warnings);
            } catch (error) {
                warnings.push(`Failed to generate task for ${task.plugin}: ${error}`);
            }
        }

        return { yaml: lines.join('\n'), warnings };
    }

    private async _getPluginDoc(plugin: string, pluginType: string): Promise<PluginData | null> {
        const cacheKey = `${plugin}:${pluginType}`;

        if (this._docCache.has(cacheKey)) {
            return this._docCache.get(cacheKey)!;
        }

        const service = CollectionsService.getInstance();
        const doc = await service.getPluginDocumentation(plugin, pluginType);

        if (doc) {
            this._docCache.set(cacheKey, doc);
        }

        return doc;
    }

    private _validateParams(
        params: Record<string, unknown>,
        options: Record<string, PluginOption>
    ): { warnings: string[] } {
        const warnings: string[] = [];

        // Check for required parameters
        for (const [name, spec] of Object.entries(options)) {
            if (spec.required && !(name in params)) {
                // Check aliases
                const hasAlias = spec.aliases?.some(alias => alias in params);
                if (!hasAlias) {
                    warnings.push(`Missing required parameter: ${name}`);
                }
            }
        }

        // Check for unknown parameters (soft warning)
        for (const name of Object.keys(params)) {
            if (!(name in options)) {
                const isAlias = Object.values(options).some(
                    spec => spec.aliases?.includes(name)
                );
                if (!isAlias) {
                    // Don't warn - could be a valid param not in our docs
                }
            }
        }

        return { warnings };
    }

    private _buildYaml(input: TaskGeneratorInput, doc: PluginData): string {
        const lines: string[] = [];

        // Task name
        const taskName = input.task_name || this._generateTaskName(input.plugin, doc);
        lines.push(`- name: ${taskName}`);

        // Plugin and parameters
        lines.push(`  ${input.plugin}:`);

        for (const [key, value] of Object.entries(input.params)) {
            const formatted = this._formatValue(value, 2);
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                lines.push(`    ${key}:`);
                const objLines = this._formatObject(value as Record<string, unknown>, 3);
                lines.push(...objLines);
            } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
                lines.push(`    ${key}:`);
                for (const item of value) {
                    const itemLines = this._formatListItem(item, 3);
                    lines.push(...itemLines);
                }
            } else {
                lines.push(`    ${key}: ${formatted}`);
            }
        }

        // Task-level options
        if (input.register) {
            lines.push(`  register: ${input.register}`);
        }

        if (input.when) {
            lines.push(`  when: ${input.when}`);
        }

        if (input.loop && input.loop.length > 0) {
            lines.push('  loop:');
            for (const item of input.loop) {
                lines.push(`    - ${this._formatValue(item, 0)}`);
            }
        }

        if (input.become) {
            lines.push('  become: true');
        }

        if (input.ignore_errors) {
            lines.push('  ignore_errors: true');
        }

        if (input.tags && input.tags.length > 0) {
            lines.push(`  tags: [${input.tags.join(', ')}]`);
        }

        return lines.join('\n');
    }

    private _generateTaskName(plugin: string, doc: PluginData): string {
        if (doc.doc?.short_description) {
            const desc = doc.doc.short_description;
            return desc.charAt(0).toUpperCase() + desc.slice(1, 60);
        }

        const name = plugin.split('.').pop() || plugin;
        return name
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    private _formatValue(value: unknown, _depth: number): string {
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
            return this._formatString(value);
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '[]';
            }
            if (value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
                return `[${value.map(v => this._formatValue(v, 0)).join(', ')}]`;
            }
            return JSON.stringify(value);
        }

        if (typeof value === 'object') {
            if (Object.keys(value).length === 0) {
                return '{}';
            }
            return JSON.stringify(value);
        }

        return String(value);
    }

    private _formatString(value: string): string {
        if (
            value === '' ||
            value.includes(':') ||
            value.includes('#') ||
            value.includes('\n') ||
            value.startsWith(' ') ||
            value.startsWith('{') ||
            value.startsWith('[') ||
            value.startsWith('*') ||
            value.startsWith('&') ||
            value.startsWith('!') ||
            value.startsWith('|') ||
            value.startsWith('>') ||
            /^(true|false|yes|no|on|off|null|~)$/i.test(value) ||
            /^-?\d+\.?\d*$/.test(value)
        ) {
            if (value.includes('\n')) {
                return `|\n    ${value.split('\n').join('\n    ')}`;
            }
            return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
        return value;
    }

    private _formatObject(obj: Record<string, unknown>, indent: number): string[] {
        const lines: string[] = [];
        const prefix = '  '.repeat(indent);

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                lines.push(`${prefix}${key}:`);
                lines.push(...this._formatObject(value as Record<string, unknown>, indent + 1));
            } else {
                lines.push(`${prefix}${key}: ${this._formatValue(value, indent)}`);
            }
        }

        return lines;
    }

    private _formatListItem(item: unknown, indent: number): string[] {
        const lines: string[] = [];
        const prefix = '  '.repeat(indent);

        if (typeof item === 'object' && item !== null) {
            const entries = Object.entries(item as Record<string, unknown>);
            if (entries.length > 0) {
                const [firstKey, firstValue] = entries[0];
                lines.push(`${prefix}- ${firstKey}: ${this._formatValue(firstValue, indent)}`);
                
                for (let i = 1; i < entries.length; i++) {
                    const [key, value] = entries[i];
                    lines.push(`${prefix}  ${key}: ${this._formatValue(value, indent)}`);
                }
            }
        } else {
            lines.push(`${prefix}- ${this._formatValue(item, indent)}`);
        }

        return lines;
    }

    clearCache(): void {
        this._docCache.clear();
    }
}
