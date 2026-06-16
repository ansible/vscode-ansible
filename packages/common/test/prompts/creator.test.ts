import { describe, it, expect } from 'vitest';
import {
    buildCreatorOverviewPrompt,
    buildCreatorCommandWalkthroughPrompt,
} from '../../src/prompts/creator';

describe('creator prompts', () => {
    describe('buildCreatorOverviewPrompt', () => {
        it('includes tool reference and key topics', () => {
            const result = buildCreatorOverviewPrompt();
            expect(result).toContain('get_ansible_creator_schema');
            expect(result).toContain('ansible-creator');
            expect(result).toContain('scaffold');
        });
    });

    describe('buildCreatorCommandWalkthroughPrompt', () => {
        it('includes command string and tool name', () => {
            const result = buildCreatorCommandWalkthroughPrompt(
                'ansible-creator add plugin filter',
                'ac_add_plug_filter',
            );
            expect(result).toContain('ansible-creator add plugin filter');
            expect(result).toContain('ac_add_plug_filter');
        });

        it('includes description when provided', () => {
            const result = buildCreatorCommandWalkthroughPrompt(
                'ansible-creator init collection',
                'ac_init_coll',
                'Initialize a new Ansible collection',
            );
            expect(result).toContain('Initialize a new Ansible collection');
        });

        it('works without description', () => {
            const result = buildCreatorCommandWalkthroughPrompt(
                'ansible-creator add resource',
                'ac_add_res',
            );
            expect(result).not.toContain('undefined');
            expect(result).toContain('ac_add_res');
        });
    });
});
