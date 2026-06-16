import { describe, it, expect } from 'vitest';
import { buildMcpToolExamplePrompt } from '../../src/prompts/mcp-examples';

describe('mcp-examples prompts', () => {
    describe('buildMcpToolExamplePrompt', () => {
        it('returns curated prompt for known tools', () => {
            const result = buildMcpToolExamplePrompt('search_ansible_plugins', 'Search plugins');
            expect(result).toContain('copy files');
            expect(result).toContain('search_ansible_plugins');
        });

        it('returns curated prompt for get_plugin_documentation', () => {
            const result = buildMcpToolExamplePrompt('get_plugin_documentation', 'Get docs');
            expect(result).toContain('ansible.builtin.copy');
        });

        it('derives prompt from description for ac_ tools', () => {
            const result = buildMcpToolExamplePrompt(
                'ac_add_plug_filter',
                'Add a filter plugin to a collection.\nMore details here.',
            );
            expect(result).toContain('Add a filter plugin to a collection');
            expect(result).toContain('ac_add_plug_filter');
            expect(result).not.toContain('More details');
        });

        it('removes trailing period from ac_ tool descriptions', () => {
            const result = buildMcpToolExamplePrompt(
                'ac_init_coll',
                'Initialize a new collection.',
            );
            expect(result).toContain('Initialize a new collection, use the ac_init_coll');
            expect(result).not.toContain('.,');
        });

        it('falls back to description for unknown tools', () => {
            const result = buildMcpToolExamplePrompt(
                'custom_tool',
                'Do something interesting with the data',
            );
            expect(result).toContain('Do something interesting with the data');
            expect(result).toContain('custom_tool');
        });

        it('falls back to name-based prompt for short descriptions', () => {
            const result = buildMcpToolExamplePrompt('my_tool', 'Short');
            expect(result).toContain('Run the my tool command');
        });
    });
});
