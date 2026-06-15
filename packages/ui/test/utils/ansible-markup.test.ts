import { describe, it, expect } from 'vitest';
import { escapeHtml, toArray, formatAnsibleMarkup } from '../../src/utils/ansible-markup';

describe('escapeHtml', () => {
    it('escapes ampersand', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes angle brackets', () => {
        expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('escapes quotes', () => {
        expect(escapeHtml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &#039;world&#039;');
    });

    it('returns empty string unchanged', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('passes through plain text', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });
});

describe('toArray', () => {
    it('returns empty array for undefined', () => {
        expect(toArray(undefined)).toEqual([]);
    });

    it('returns empty array for empty string', () => {
        expect(toArray('')).toEqual([]);
    });

    it('wraps a single string in an array', () => {
        expect(toArray('hello')).toEqual(['hello']);
    });

    it('returns an array unchanged', () => {
        expect(toArray(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('returns empty array as-is', () => {
        expect(toArray([])).toEqual([]);
    });
});

describe('formatAnsibleMarkup', () => {
    it('converts I() to italic', () => {
        expect(formatAnsibleMarkup('I(text)')).toBe('<em>text</em>');
    });

    it('converts C() to code', () => {
        expect(formatAnsibleMarkup('C(text)')).toBe('<code>text</code>');
    });

    it('converts B() to bold', () => {
        expect(formatAnsibleMarkup('B(text)')).toBe('<strong>text</strong>');
    });

    it('converts U() to link with target and noreferrer', () => {
        expect(formatAnsibleMarkup('U(https://example.com)')).toBe(
            '<a href="https://example.com" target="_blank" rel="noreferrer">https://example.com</a>',
        );
    });

    it('converts :ref: to plain text', () => {
        const result = formatAnsibleMarkup('See :ref:`explanation <ref_link>` for details');
        expect(result).toContain('explanation');
        expect(result).not.toContain(':ref:');
        expect(result).not.toContain('ref_link');
    });

    it('converts backtick code', () => {
        expect(formatAnsibleMarkup('use `foo` here')).toBe('use <code>foo</code> here');
    });

    it('escapes HTML before processing markup', () => {
        expect(formatAnsibleMarkup('Use I(<div>)')).toBe('Use <em>&lt;div&gt;</em>');
    });

    it('handles multiple markup codes in one string', () => {
        const result = formatAnsibleMarkup('See B(bold) and I(italic) and C(code)');
        expect(result).toContain('<strong>bold</strong>');
        expect(result).toContain('<em>italic</em>');
        expect(result).toContain('<code>code</code>');
    });

    it('passes plain text through with HTML escaping', () => {
        expect(formatAnsibleMarkup('just plain text')).toBe('just plain text');
    });
});
