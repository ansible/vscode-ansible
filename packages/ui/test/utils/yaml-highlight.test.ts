import { describe, it, expect } from 'vitest';
import { highlightYaml, highlightComment } from '../../src/utils/yaml-highlight';

describe('highlightYaml', () => {
    it('highlights full-line comments', () => {
        const result = highlightYaml('# this is a comment');
        expect(result).toBe('<span class="yaml-comment"># this is a comment</span>');
    });

    it('returns empty string for blank lines', () => {
        const result = highlightYaml('');
        expect(result).toBe('');
    });

    it('highlights key-value pairs', () => {
        const result = highlightYaml('name: value');
        expect(result).toContain('class="yaml-key"');
        expect(result).toContain('name');
    });

    it('highlights boolean values', () => {
        const result = highlightYaml('enabled: true');
        expect(result).toContain('class="yaml-bool"');
    });

    it('highlights number values', () => {
        const result = highlightYaml('count: 42');
        expect(result).toContain('class="yaml-number"');
    });

    it('highlights null values', () => {
        const result = highlightYaml('field: null');
        expect(result).toContain('class="yaml-null"');
    });

    it('highlights quoted string values', () => {
        const result = highlightYaml("name: 'hello'");
        expect(result).toContain('class="yaml-string"');
    });

    it('highlights list markers with key', () => {
        const result = highlightYaml('  - key: value');
        expect(result).toContain('class="yaml-list-marker"');
        expect(result).toContain('class="yaml-key"');
    });

    it('highlights bare list markers', () => {
        const result = highlightYaml('  - ');
        expect(result).toContain('class="yaml-list-marker"');
    });

    it('highlights list markers with boolean value', () => {
        const result = highlightYaml('  - true');
        expect(result).toContain('class="yaml-list-marker"');
        expect(result).toContain('class="yaml-bool"');
    });

    it('processes multiple lines', () => {
        const yaml = '# header\nname: value\ncount: 3';
        const result = highlightYaml(yaml);
        const lines = result.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toContain('yaml-comment');
        expect(lines[1]).toContain('yaml-key');
        expect(lines[2]).toContain('yaml-number');
    });

    it('handles inline comments', () => {
        const result = highlightYaml('name: value  # optional');
        expect(result).toContain('yaml-comment-dim');
    });

    it('escapes HTML in values', () => {
        const result = highlightYaml('html: <div>');
        expect(result).toContain('&lt;div&gt;');
        expect(result).not.toContain('<div>');
    });
});

describe('highlightComment', () => {
    it('highlights simple comments as dim', () => {
        const result = highlightComment('  # optional');
        expect(result).toBe('<span class="yaml-comment-dim">  # optional</span>');
    });

    it('highlights structured comments with required', () => {
        const result = highlightComment('  # (str, required) The name');
        expect(result).toContain('yaml-comment-type');
        expect(result).toContain('yaml-comment-required');
    });

    it('highlights structured comments with optional', () => {
        const result = highlightComment('  # (int, optional) Timeout value');
        expect(result).toContain('yaml-comment-type');
        expect(result).toContain('yaml-comment-optional');
    });

    it('falls back to dim for non-structured comments', () => {
        const result = highlightComment('  # just a note');
        expect(result).toContain('yaml-comment-dim');
        expect(result).not.toContain('yaml-comment-type');
    });
});
