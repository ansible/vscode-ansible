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

/** One-shot Ansible task and playbook YAML generator backed by plugin documentation. */
export class TaskGenerator {
    private _docCache = new Map<string, PluginData>();

    /**
     * Generates a single Ansible task YAML block from plugin parameters.
     *
     * @param input - Plugin identity, module parameters, and task-level options
     * @returns Generated YAML and any validation warnings
     */
    async generate(input: TaskGeneratorInput): Promise<TaskGeneratorResult> {
        const pluginType = input.plugin_type ?? 'module';
        const warnings: string[] = [];

        // Fetch plugin documentation
        const doc = await this._getPluginDoc(input.plugin, pluginType);

        if (!doc?.doc) {
            throw new Error(
                `Plugin not found: ${input.plugin}. Use search_ansible_plugins to find available plugins.`,
            );
        }

        // Validate parameters
        const validation = this._validateParams(input.params, doc.doc.options ?? {});
        warnings.push(...validation.warnings);

        // Generate YAML
        const yaml = this._buildYaml(input, doc);

        return { yaml, warnings };
    }

    /**
     * Assembles a multi-task playbook by generating each task individually.
     *
     * @param input - Play definition including hosts, tasks, and play-level options
     * @param input.name - Playbook play name shown in the generated YAML
     * @param input.hosts - Inventory host pattern for the play
     * @param input.tasks - Task definitions passed to `generate()` for each entry
     * @param input.become - When true, adds `become: true` at the play level
     * @param input.vars - Optional play-level variables merged into the output
     * @param input.gather_facts - When false, emits `gather_facts: false` on the play
     * @returns Complete playbook YAML and aggregated warnings from each task
     */
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
                lines.push(`    ${key}: ${this._formatValue(value)}`);
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
                const message = error instanceof Error ? error.message : String(error);
                warnings.push(`Failed to generate task for ${task.plugin}: ${message}`);
            }
        }

        return { yaml: lines.join('\n'), warnings };
    }

    /**
     * Fetches plugin documentation, using an in-memory cache per plugin and type.
     *
     * @param plugin - FQCN or short plugin name
     * @param pluginType - Ansible plugin type (e.g. `module`)
     * @returns Cached or freshly loaded PluginData, or null when not found
     */
    private async _getPluginDoc(plugin: string, pluginType: string): Promise<PluginData | null> {
        const cacheKey = `${plugin}:${pluginType}`;

        const cached = this._docCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const service = CollectionsService.getInstance();
        const doc = await service.getPluginDocumentation(plugin, pluginType);

        if (doc) {
            this._docCache.set(cacheKey, doc);
        }

        return doc;
    }

    /**
     * Checks supplied parameters against documented plugin options.
     *
     * @param params - Caller-supplied module parameters
     * @param options - Documented option specs from ansible-doc
     * @returns Soft validation warnings (e.g. missing required parameters)
     */
    private _validateParams(
        params: Record<string, unknown>,
        options: Record<string, PluginOption>,
    ): { warnings: string[] } {
        const warnings: string[] = [];

        // Check for required parameters
        for (const [name, spec] of Object.entries(options)) {
            if (spec.required && !(name in params)) {
                // Check aliases
                const hasAlias = spec.aliases?.some((alias) => alias in params);
                if (!hasAlias) {
                    warnings.push(`Missing required parameter: ${name}`);
                }
            }
        }

        // Check for unknown parameters (soft warning)
        for (const name of Object.keys(params)) {
            if (!(name in options)) {
                const isAlias = Object.values(options).some((spec) => spec.aliases?.includes(name));
                if (!isAlias) {
                    // Don't warn - could be a valid param not in our docs
                }
            }
        }

        return { warnings };
    }

    /**
     * Builds the YAML lines for one Ansible task from input and plugin metadata.
     *
     * @param input - Task generator input including parameters and task options
     * @param doc - Plugin documentation used for default task naming
     * @returns Single-task YAML string
     */
    private _buildYaml(input: TaskGeneratorInput, doc: PluginData): string {
        const lines: string[] = [];

        // Task name
        const taskName = input.task_name ?? this._generateTaskName(input.plugin, doc);
        lines.push(`- name: ${taskName}`);

        // Plugin and parameters
        lines.push(`  ${input.plugin}:`);

        for (const [key, value] of Object.entries(input.params)) {
            const formatted = this._formatValue(value);
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
                lines.push(`    - ${this._formatValue(item)}`);
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

    /**
     * Derives a human-readable task name from plugin docs or the module name.
     *
     * @param plugin - FQCN or short plugin name
     * @param doc - Plugin documentation for short_description fallback
     * @returns Title-cased task name suitable for the `name` field
     */
    private _generateTaskName(plugin: string, doc: PluginData): string {
        if (doc.doc?.short_description) {
            const desc = doc.doc.short_description;
            return desc.charAt(0).toUpperCase() + desc.slice(1, 60);
        }

        const name = plugin.split('.').pop() ?? plugin;
        return name
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    /**
     * Serializes a value as a YAML scalar or compact JSON representation.
     *
     * @param value - Arbitrary parameter or task option value
     * @returns YAML-safe string for inline task output
     */
    private _formatValue(value: unknown): string {
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
            if (
                value.every(
                    (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
                )
            ) {
                return `[${value.map((v) => this._formatValue(v)).join(', ')}]`;
            }
            return JSON.stringify(value);
        }

        if (typeof value === 'object') {
            if (Object.keys(value).length === 0) {
                return '{}';
            }
            return JSON.stringify(value);
        }

        if (typeof value === 'bigint' || typeof value === 'symbol') {
            return value.toString();
        }

        return JSON.stringify(value);
    }

    /**
     * Quotes or block-formats a string when YAML syntax requires it.
     *
     * @param value - Raw string parameter value
     * @returns Unquoted, quoted, or block-scalar YAML representation
     */
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

    /**
     * Renders a nested object as indented YAML mapping lines.
     *
     * @param obj - Object-valued module parameter
     * @param indent - Current YAML indentation level
     * @returns Lines to append under the parent key
     */
    private _formatObject(obj: Record<string, unknown>, indent: number): string[] {
        const lines: string[] = [];
        const prefix = '  '.repeat(indent);

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                lines.push(`${prefix}${key}:`);
                lines.push(...this._formatObject(value as Record<string, unknown>, indent + 1));
            } else {
                lines.push(`${prefix}${key}: ${this._formatValue(value)}`);
            }
        }

        return lines;
    }

    /**
     * Renders one list element as YAML list-item lines.
     *
     * @param item - Object or scalar list entry
     * @param indent - Current YAML indentation level
     * @returns Lines representing a single `-` list item and nested keys
     */
    private _formatListItem(item: unknown, indent: number): string[] {
        const lines: string[] = [];
        const prefix = '  '.repeat(indent);

        if (typeof item === 'object' && item !== null) {
            const entries = Object.entries(item as Record<string, unknown>);
            if (entries.length > 0) {
                const [firstKey, firstValue] = entries[0];
                lines.push(`${prefix}- ${firstKey}: ${this._formatValue(firstValue)}`);

                for (let i = 1; i < entries.length; i++) {
                    const [key, value] = entries[i];
                    lines.push(`${prefix}  ${key}: ${this._formatValue(value)}`);
                }
            }
        } else {
            lines.push(`${prefix}- ${this._formatValue(item)}`);
        }

        return lines;
    }

    /** Clears cached plugin documentation so the next lookup refetches from CollectionsService. */
    clearCache(): void {
        this._docCache.clear();
    }
}
