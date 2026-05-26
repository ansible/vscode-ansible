import { describe, it, expect } from 'vitest';
import { STATIC_TOOLS } from '../src/tools';

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
        const names = STATIC_TOOLS.map(t => t.name);
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
});
