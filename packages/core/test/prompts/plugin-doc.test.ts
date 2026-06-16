import { describe, it, expect } from 'vitest';
import { buildTaskBuilderPrompt } from '../../src/prompts/plugin-doc';

describe('plugin-doc prompts', () => {
    describe('buildTaskBuilderPrompt', () => {
        it('includes FQCN, type, and MCP tool reference', () => {
            const result = buildTaskBuilderPrompt('ansible.builtin.copy', 'module');
            expect(result).toContain('ansible.builtin.copy');
            expect(result).toContain('module');
            expect(result).toContain('build_ansible_task');
        });

        it('works with different plugin types', () => {
            const result = buildTaskBuilderPrompt('ansible.builtin.dict', 'filter');
            expect(result).toContain('ansible.builtin.dict');
            expect(result).toContain('filter');
        });
    });
});
