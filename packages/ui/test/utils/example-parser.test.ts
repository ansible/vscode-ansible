import { describe, it, expect } from 'vitest';
import { parseExamples } from '../../src/utils/example-parser';

describe('parseExamples', () => {
    it('parses a single simple task', () => {
        const examples = `- name: Install package
  ansible.builtin.yum:
    name: httpd
    state: present`;
        const sections = parseExamples(examples);
        expect(sections).toHaveLength(1);
        expect(sections[0].title).toBe('Install Package');
        expect(sections[0].task).toContain('ansible.builtin.yum');
    });

    it('parses multiple tasks', () => {
        const examples = `- name: first task
  debug:
    msg: hello

- name: second task
  debug:
    msg: world`;
        const sections = parseExamples(examples);
        expect(sections).toHaveLength(2);
        expect(sections[0].title).toBe('First Task');
        expect(sections[1].title).toBe('Second Task');
    });

    it('returns empty array for empty input', () => {
        expect(parseExamples('')).toEqual([]);
    });

    it('returns empty for input with no tasks', () => {
        expect(parseExamples('# just a comment\n# another comment')).toEqual([]);
    });

    it('handles section headers (# Using merged)', () => {
        const examples = `# Using merged
- name: merge config
  some.module:
    state: merged`;
        const sections = parseExamples(examples);
        expect(sections).toHaveLength(1);
        expect(sections[0].title).toBe('Using merged: Merge Config');
    });

    it('parses before state blocks', () => {
        const examples = `# Before state:
# some context
- name: do something
  module:
    param: value`;
        const sections = parseExamples(examples);
        expect(sections).toHaveLength(1);
        expect(sections[0].task).toContain('module:');
    });

    it('parses task output blocks', () => {
        const examples = `- name: run command
  command: echo hello
# Task output:
# ok: [localhost]`;
        const sections = parseExamples(examples);
        expect(sections).toHaveLength(1);
        expect(sections[0].taskOutput).toContain('ok: [localhost]');
    });

    it('parses after state blocks', () => {
        const examples = `- name: configure interface
  module:
    name: eth0
# After state:
# interface is configured`;
        const sections = parseExamples(examples);
        expect(sections).toHaveLength(1);
        expect(sections[0].afterState).toContain('interface is configured');
    });

    it('strips surrounding quotes from task names', () => {
        const examples = `- name: "quoted task name"
  debug:
    msg: test`;
        const sections = parseExamples(examples);
        expect(sections[0].title).toBe('Quoted Task Name');
    });

    it('skips divider comments', () => {
        const examples = `- name: task one
  debug:
    msg: hello
# --------
- name: task two
  debug:
    msg: world`;
        const sections = parseExamples(examples);
        expect(sections).toHaveLength(2);
    });
});
