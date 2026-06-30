import { describe, it, expect } from 'vitest';
import {
    isTaskKeyword,
    playKeywords,
    taskKeywords,
    blockKeywords,
    roleKeywords,
    playExclusiveKeywords,
    playWithoutTaskKeywords,
} from '../../src/utils/ansible';

describe('isTaskKeyword', () => {
    it('returns true for known task keywords', () => {
        expect(isTaskKeyword('name')).toBe(true);
        expect(isTaskKeyword('register')).toBe(true);
        expect(isTaskKeyword('when')).toBe(true);
        expect(isTaskKeyword('notify')).toBe(true);
        expect(isTaskKeyword('loop')).toBe(true);
        expect(isTaskKeyword('retries')).toBe(true);
        expect(isTaskKeyword('until')).toBe(true);
        expect(isTaskKeyword('become')).toBe(true);
        expect(isTaskKeyword('args')).toBe(true);
        expect(isTaskKeyword('action')).toBe(true);
        expect(isTaskKeyword('listen')).toBe(true);
    });

    it('returns true for legacy with_ loop keywords', () => {
        expect(isTaskKeyword('with_items')).toBe(true);
        expect(isTaskKeyword('with_dict')).toBe(true);
        expect(isTaskKeyword('with_fileglob')).toBe(true);
        expect(isTaskKeyword('with_anything')).toBe(true);
    });

    it('returns false for non-task keywords', () => {
        expect(isTaskKeyword('hosts')).toBe(false);
        expect(isTaskKeyword('gather_facts')).toBe(false);
        expect(isTaskKeyword('roles')).toBe(false);
        expect(isTaskKeyword('pre_tasks')).toBe(false);
        expect(isTaskKeyword('post_tasks')).toBe(false);
    });

    it('returns false for arbitrary strings', () => {
        expect(isTaskKeyword('not_a_keyword')).toBe(false);
        expect(isTaskKeyword('')).toBe(false);
        expect(isTaskKeyword('ansible.builtin.copy')).toBe(false);
    });
});

describe('keyword maps', () => {
    it('playKeywords contains play-level keys', () => {
        expect(playKeywords.has('hosts')).toBe(true);
        expect(playKeywords.has('gather_facts')).toBe(true);
        expect(playKeywords.has('tasks')).toBe(true);
        expect(playKeywords.has('roles')).toBe(true);
        expect(playKeywords.has('vars')).toBe(true);
    });

    it('taskKeywords contains task-level keys', () => {
        expect(taskKeywords.has('register')).toBe(true);
        expect(taskKeywords.has('loop')).toBe(true);
        expect(taskKeywords.has('until')).toBe(true);
        expect(taskKeywords.has('listen')).toBe(true);
    });

    it('blockKeywords contains block/rescue/always', () => {
        expect(blockKeywords.has('block')).toBe(true);
        expect(blockKeywords.has('rescue')).toBe(true);
        expect(blockKeywords.has('always')).toBe(true);
    });

    it('roleKeywords contains role-level keys', () => {
        expect(roleKeywords.has('become')).toBe(true);
        expect(roleKeywords.has('when')).toBe(true);
        expect(roleKeywords.has('vars')).toBe(true);
    });

    it('playExclusiveKeywords excludes task/role/block keywords', () => {
        expect(playExclusiveKeywords.has('hosts')).toBe(true);
        expect(playExclusiveKeywords.has('gather_facts')).toBe(true);
        for (const [key] of playExclusiveKeywords) {
            expect(taskKeywords.has(key)).toBe(false);
            expect(roleKeywords.has(key)).toBe(false);
            expect(blockKeywords.has(key)).toBe(false);
        }
    });

    it('playWithoutTaskKeywords excludes task keywords', () => {
        for (const [key] of playWithoutTaskKeywords) {
            expect(taskKeywords.has(key)).toBe(false);
        }
        expect(playWithoutTaskKeywords.has('hosts')).toBe(true);
    });

    it('keyword values are strings or MarkupContent', () => {
        for (const [, value] of taskKeywords) {
            if (typeof value === 'string') {
                expect(value.length).toBeGreaterThan(0);
            } else {
                expect(value).toHaveProperty('kind');
                expect(value).toHaveProperty('value');
            }
        }
    });
});
