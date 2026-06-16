import { describe, it, expect } from 'vitest';
import {
    buildEESummaryPrompt,
    buildEEDetailPrompt,
} from '../../src/prompts/execution-environments';

describe('execution-environments prompts', () => {
    describe('buildEESummaryPrompt', () => {
        it('includes MCP tool reference', () => {
            const result = buildEESummaryPrompt();
            expect(result).toContain('list_execution_environments');
        });
    });

    describe('buildEEDetailPrompt', () => {
        it('includes EE name and tool reference', () => {
            const result = buildEEDetailPrompt('creator-ee');
            expect(result).toContain('creator-ee');
            expect(result).toContain('get_ee_details');
        });

        it('mentions expected output fields', () => {
            const result = buildEEDetailPrompt('my-ee');
            expect(result).toContain('Python packages');
            expect(result).toContain('Ansible collections');
        });
    });
});
