import { describe, it, expect } from 'vitest';
import { STATIC_TOOLS, mcpError } from '../src/tools';
import type { McpErrorDetail } from '../src/tools';

const MAX_TOOL_NAME_LENGTH = 64;

describe('STATIC_TOOLS', () => {
    it('is non-empty', () => {
        expect(STATIC_TOOLS.length).toBeGreaterThan(0);
    });

    it('each tool has name, description, and inputSchema', () => {
        for (const tool of STATIC_TOOLS) {
            expect(tool.name, `tool name for ${tool.name}`).toBeTruthy();
            expect(typeof tool.name).toBe('string');
            expect(tool.description, `description for ${tool.name}`).toBeTruthy();
            expect(typeof tool.description).toBe('string');
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('has unique tool names', () => {
        const names = STATIC_TOOLS.map((t) => t.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });

    it('each inputSchema has type object', () => {
        for (const tool of STATIC_TOOLS) {
            expect(tool.inputSchema.type).toBe('object');
        }
    });

    it('no tool name exceeds reasonable length', () => {
        for (const tool of STATIC_TOOLS) {
            expect(tool.name.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH);
        }
    });

    it('every static tool has behavioral annotations', () => {
        for (const tool of STATIC_TOOLS) {
            const ann = tool.annotations;
            expect(ann, `annotations missing on ${tool.name}`).toBeDefined();
            if (ann) {
                expect(typeof ann.readOnlyHint).toBe('boolean');
                expect(typeof ann.destructiveHint).toBe('boolean');
                expect(typeof ann.idempotentHint).toBe('boolean');
            }
        }
    });

    it('install_ansible_collection is marked destructive', () => {
        const install = STATIC_TOOLS.find((t) => t.name === 'install_ansible_collection');
        expect(install).toBeDefined();
        if (install?.annotations) {
            expect(install.annotations.destructiveHint).toBe(true);
            expect(install.annotations.readOnlyHint).toBe(false);
        }
    });

    it('read-only tools are not marked destructive', () => {
        const readOnlyNames = [
            'search_ansible_plugins',
            'get_plugin_documentation',
            'list_ansible_collections',
            'generate_ansible_task',
            'get_ansible_best_practices',
        ];
        for (const name of readOnlyNames) {
            const tool = STATIC_TOOLS.find((t) => t.name === name);
            expect(tool, `tool ${name} not found`).toBeDefined();
            if (tool?.annotations) {
                expect(tool.annotations.readOnlyHint, `${name} readOnlyHint`).toBe(true);
                expect(tool.annotations.destructiveHint, `${name} destructiveHint`).toBe(false);
            }
        }
    });

    it('generate_ansible_task has plugin_type enum', () => {
        const tool = STATIC_TOOLS.find((t) => t.name === 'generate_ansible_task');
        expect(tool).toBeDefined();
        if (tool) {
            const pluginType = tool.inputSchema.properties.plugin_type as {
                enum?: string[];
            };
            expect(pluginType.enum).toBeDefined();
            expect(pluginType.enum).toContain('module');
            expect(pluginType.enum).toContain('filter');
        }
    });

    it('build_ansible_task has plugin_type enum and no required fields', () => {
        const tool = STATIC_TOOLS.find((t) => t.name === 'build_ansible_task');
        expect(tool).toBeDefined();
        if (tool) {
            expect(tool.inputSchema.required).toBeUndefined();
            const pluginType = tool.inputSchema.properties.plugin_type as {
                enum?: string[];
            };
            expect(pluginType.enum).toBeDefined();
            expect(pluginType.enum).toContain('module');
        }
    });
});

describe('mcpError', () => {
    it('produces a JSON-parseable structured error', () => {
        const detail: McpErrorDetail = {
            code: 'MISSING_PARAM',
            recoverability: 'fail',
            message: 'Missing required parameter: query',
        };
        const result = mcpError(detail);

        expect(result.isError).toBe(true);
        expect(result.content).toHaveLength(1);

        const parsed = JSON.parse(result.content[0].text) as McpErrorDetail;
        expect(parsed.code).toBe('MISSING_PARAM');
        expect(parsed.recoverability).toBe('fail');
        expect(parsed.message).toBe('Missing required parameter: query');
    });

    it('includes suggestion when provided', () => {
        const result = mcpError({
            code: 'NOT_FOUND',
            recoverability: 'fail',
            message: 'Plugin not found',
            suggestion: 'Use search_ansible_plugins',
        });

        const parsed = JSON.parse(result.content[0].text) as McpErrorDetail;
        expect(parsed.suggestion).toBe('Use search_ansible_plugins');
    });
});
