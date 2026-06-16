import { describe, it, expect } from 'vitest';
import { buildSkillLoadPrompt, buildSkillClipboardPrompt } from '../../src/prompts/skills';

describe('skills prompts', () => {
    describe('buildSkillLoadPrompt', () => {
        it('includes skill name, ID, and description', () => {
            const result = buildSkillLoadPrompt(
                'Code Review',
                'code-review',
                'Review code changes',
            );
            expect(result).toContain('Code Review');
            expect(result).toContain('code-review');
            expect(result).toContain('Review code changes');
            expect(result).toContain('skill_get');
        });
    });

    describe('buildSkillClipboardPrompt', () => {
        it('uses explicit MCP tool call syntax', () => {
            const result = buildSkillClipboardPrompt('Bugfix', 'bugfix-workflow', 'Fix a bug');
            expect(result).toContain('skill_get({ skill_id: "bugfix-workflow" })');
            expect(result).toContain('Bugfix');
            expect(result).toContain('Fix a bug');
        });
    });
});
