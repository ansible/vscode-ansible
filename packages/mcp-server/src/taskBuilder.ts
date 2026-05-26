/**
 * Task Builder
 * 
 * Interactive, stateful task building with guided parameter collection.
 */

import { CollectionsService } from '@ansible/core';
import type { PluginData, PluginOption } from '@ansible/core';

interface TaskBuilderSession {
    id: string;
    plugin: string;
    pluginType: string;
    doc: PluginData;
    collectedParams: Record<string, unknown>;
    taskOptions: {
        task_name?: string;
        become?: boolean;
        register?: string;
        when?: string;
        loop?: unknown[];
        ignore_errors?: boolean;
        tags?: string[];
    };
    requiredParams: string[];
    optionalParams: string[];
    missingRequired: string[];
    createdAt: number;
}

export interface TaskBuilderInput {
    plugin?: string;
    plugin_type?: string;
    session_id?: string;
    params?: Record<string, unknown>;
    task_name?: string;
    become?: boolean;
    register?: string;
    when?: string;
    generate?: boolean;
    cancel?: boolean;
}

export interface TaskBuilderResult {
    status: 'in_progress' | 'complete' | 'cancelled' | 'error';
    session_id?: string;
    plugin?: string;
    collected?: Record<string, unknown>;
    missing_required?: string[];
    optional_available?: string[];
    can_generate?: boolean;
    yaml?: string;
    message: string;
}

export class TaskBuilder {
    private _sessions: Map<string, TaskBuilderSession> = new Map();
    private _sessionTimeout = 10 * 60 * 1000; // 10 minutes

    async build(input: TaskBuilderInput): Promise<TaskBuilderResult> {
        // Clean up old sessions
        this._cleanupSessions();

        // Cancel session
        if (input.cancel && input.session_id) {
            this._sessions.delete(input.session_id);
            return {
                status: 'cancelled',
                message: 'Task building session cancelled.'
            };
        }

        let session: TaskBuilderSession;

        // Continue existing session or start new one
        if (input.session_id && this._sessions.has(input.session_id)) {
            session = this._sessions.get(input.session_id)!;
        } else if (input.plugin) {
            session = await this._startSession(input.plugin, input.plugin_type || 'module');
            this._sessions.set(session.id, session);
        } else {
            return {
                status: 'error',
                message: 'Provide either session_id to continue or plugin to start a new session.'
            };
        }

        // Add any new parameters
        if (input.params) {
            for (const [key, value] of Object.entries(input.params)) {
                if (value !== undefined && value !== null && value !== '') {
                    session.collectedParams[key] = value;
                }
            }
            this._updateMissingRequired(session);
        }

        // Update task options
        if (input.task_name !== undefined) {
            session.taskOptions.task_name = input.task_name;
        }
        if (input.become !== undefined) {
            session.taskOptions.become = input.become;
        }
        if (input.register !== undefined) {
            session.taskOptions.register = input.register;
        }
        if (input.when !== undefined) {
            session.taskOptions.when = input.when;
        }

        // Check if we can generate
        const canGenerate = session.missingRequired.length === 0;

        // Generate if requested or all required params are present
        if (input.generate && canGenerate) {
            const yaml = this._generateYaml(session);
            this._sessions.delete(session.id);

            return {
                status: 'complete',
                yaml,
                message: 'Task generated successfully.'
            };
        }

        if (input.generate && !canGenerate) {
            return {
                status: 'in_progress',
                session_id: session.id,
                plugin: session.plugin,
                collected: session.collectedParams,
                missing_required: session.missingRequired,
                can_generate: false,
                message: this._buildPromptMessage(session, 'Cannot generate yet - missing required parameters.')
            };
        }

        // Return current state with prompts
        return this._buildPrompt(session);
    }

    private async _startSession(plugin: string, pluginType: string): Promise<TaskBuilderSession> {
        const service = CollectionsService.getInstance();
        const doc = await service.getPluginDocumentation(plugin, pluginType);

        if (!doc?.doc) {
            throw new Error(`Plugin not found: ${plugin}`);
        }

        const options = doc.doc.options || {};
        const requiredParams: string[] = [];
        const optionalParams: string[] = [];

        for (const [name, spec] of Object.entries(options)) {
            if (spec.required) {
                requiredParams.push(name);
            } else {
                optionalParams.push(name);
            }
        }

        // Sort optional by common usage (alphabetical for now)
        optionalParams.sort();

        return {
            id: this._generateId(),
            plugin,
            pluginType,
            doc,
            collectedParams: {},
            taskOptions: {},
            requiredParams,
            optionalParams,
            missingRequired: [...requiredParams],
            createdAt: Date.now()
        };
    }

    private _updateMissingRequired(session: TaskBuilderSession): void {
        const options = session.doc.doc?.options || {};
        session.missingRequired = session.requiredParams.filter(param => {
            if (param in session.collectedParams) {
                return false;
            }
            const spec = options[param];
            if (spec?.aliases) {
                return !spec.aliases.some(alias => alias in session.collectedParams);
            }
            return true;
        });
    }

    private _buildPrompt(session: TaskBuilderSession): TaskBuilderResult {
        return {
            status: 'in_progress',
            session_id: session.id,
            plugin: session.plugin,
            collected: session.collectedParams,
            missing_required: session.missingRequired,
            optional_available: session.optionalParams.filter(p => !(p in session.collectedParams)).slice(0, 10),
            can_generate: session.missingRequired.length === 0,
            message: this._buildPromptMessage(session)
        };
    }

    private _buildPromptMessage(session: TaskBuilderSession, prefix?: string): string {
        const options = session.doc.doc?.options || {};
        const lines: string[] = [];

        if (prefix) {
            lines.push(prefix);
            lines.push('');
        }

        lines.push(`**Building task: ${session.plugin}**`);
        lines.push(`*${session.doc.doc?.short_description || ''}*`);
        lines.push('');

        // Show collected parameters
        if (Object.keys(session.collectedParams).length > 0) {
            lines.push('**Collected parameters:**');
            for (const [key, value] of Object.entries(session.collectedParams)) {
                const displayValue = typeof value === 'string' && value.length > 50
                    ? value.substring(0, 47) + '...'
                    : JSON.stringify(value);
                lines.push(`  ✓ ${key}: ${displayValue}`);
            }
            lines.push('');
        }

        // Show missing required parameters
        if (session.missingRequired.length > 0) {
            lines.push('**Required parameters (must provide):**');
            for (const param of session.missingRequired) {
                const spec = options[param];
                const typeStr = spec?.type || 'string';
                const desc = this._getShortDescription(spec);
                const choices = spec?.choices
                    ? ` choices: [${spec.choices.slice(0, 4).join(', ')}${spec.choices.length > 4 ? '...' : ''}]`
                    : '';
                lines.push(`  • **${param}** (${typeStr})${choices}`);
                if (desc) {
                    lines.push(`    ${desc}`);
                }
            }
            lines.push('');
        }

        // Show some optional parameters
        const unsetOptional = session.optionalParams
            .filter(p => !(p in session.collectedParams))
            .slice(0, 8);

        if (unsetOptional.length > 0 && session.missingRequired.length === 0) {
            lines.push('**Optional parameters available:**');
            for (const param of unsetOptional) {
                const spec = options[param];
                const typeStr = spec?.type || 'string';
                const defVal = spec?.default !== undefined ? ` (default: ${JSON.stringify(spec.default)})` : '';
                lines.push(`  • ${param} (${typeStr})${defVal}`);
            }
            const remaining = session.optionalParams.filter(p => !(p in session.collectedParams)).length - 8;
            if (remaining > 0) {
                lines.push(`  ... and ${remaining} more`);
            }
            lines.push('');
        }

        // Next step instructions
        lines.push('---');
        if (session.missingRequired.length > 0) {
            lines.push('**Next:** Provide the required parameters:');
            lines.push('```json');
            lines.push(`{ "session_id": "${session.id}", "params": { `);
            lines.push(`    ${session.missingRequired.map(p => `"${p}": "..."`).join(', ')}`);
            lines.push('} }');
            lines.push('```');
        } else {
            lines.push('**Ready to generate!** Add more optional parameters or:');
            lines.push('```json');
            lines.push(`{ "session_id": "${session.id}", "generate": true }`);
            lines.push('```');
        }

        return lines.join('\n');
    }

    private _getShortDescription(spec?: PluginOption): string {
        if (!spec?.description) {
            return '';
        }
        const desc = Array.isArray(spec.description) ? spec.description[0] : spec.description;
        return desc.length > 100 ? desc.substring(0, 97) + '...' : desc;
    }

    private _generateYaml(session: TaskBuilderSession): string {
        const lines: string[] = [];
        const pluginName = session.plugin.split('.').pop() || session.plugin;
        const taskName = session.taskOptions.task_name ||
            pluginName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        lines.push(`- name: ${taskName}`);
        lines.push(`  ${session.plugin}:`);

        for (const [key, value] of Object.entries(session.collectedParams)) {
            const formatted = this._formatYamlValue(value, 2);
            if (formatted.includes('\n')) {
                lines.push(`    ${key}:`);
                lines.push(formatted);
            } else {
                lines.push(`    ${key}: ${formatted}`);
            }
        }

        if (session.taskOptions.register) {
            lines.push(`  register: ${session.taskOptions.register}`);
        }

        if (session.taskOptions.when) {
            lines.push(`  when: ${session.taskOptions.when}`);
        }

        if (session.taskOptions.become) {
            lines.push('  become: true');
        }

        if (session.taskOptions.ignore_errors) {
            lines.push('  ignore_errors: true');
        }

        return lines.join('\n');
    }

    private _formatYamlValue(value: unknown, indent: number = 0): string {
        const prefix = '    '.repeat(indent);

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
            if (value.includes('\n')) {
                return '|\n' + value.split('\n').map(l => prefix + '  ' + l).join('\n');
            }
            if (value.includes(':') || value.includes('#') || 
                /^(true|false|yes|no|null)$/i.test(value) ||
                /^\d+$/.test(value)) {
                return `"${value.replace(/"/g, '\\"')}"`;
            }
            return value;
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '[]';
            }
            if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
                return `[${value.join(', ')}]`;
            }
            return JSON.stringify(value);
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    }

    private _generateId(): string {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private _cleanupSessions(): void {
        const now = Date.now();
        for (const [id, session] of this._sessions) {
            if (now - session.createdAt > this._sessionTimeout) {
                this._sessions.delete(id);
            }
        }
    }

    getActiveSessionCount(): number {
        return this._sessions.size;
    }
}
