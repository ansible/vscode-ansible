import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    fileExists,
    toLspRange,
    hasOwnProperty,
    isObject,
    insert,
    getUnsupportedError,
} from '../../src/utils/misc';

describe('toLspRange', () => {
    const doc = TextDocument.create(
        'file:///test.yml',
        'yaml',
        1,
        'line one\nline two\nline three',
    );

    it('maps byte offsets to LSP positions', () => {
        const range = toLspRange([0, 8], doc);
        expect(range.start).toEqual({ line: 0, character: 0 });
        expect(range.end).toEqual({ line: 0, character: 8 });
    });

    it('spans across lines', () => {
        const range = toLspRange([0, 14], doc);
        expect(range.start.line).toBe(0);
        expect(range.end.line).toBe(1);
    });

    it('handles zero-length range', () => {
        const range = toLspRange([5, 5], doc);
        expect(range.start).toEqual(range.end);
    });
});

describe('insert', () => {
    it('inserts at the beginning', () => {
        expect(insert('world', 0, 'hello ')).toBe('hello world');
    });

    it('inserts in the middle', () => {
        expect(insert('hllo', 1, 'e')).toBe('hello');
    });

    it('inserts at the end', () => {
        expect(insert('hello', 5, ' world')).toBe('hello world');
    });

    it('handles empty string insertion', () => {
        expect(insert('hello', 3, '')).toBe('hello');
    });
});

describe('hasOwnProperty', () => {
    it('returns true for own properties', () => {
        expect(hasOwnProperty({ foo: 1 }, 'foo')).toBe(true);
    });

    it('returns false for inherited properties', () => {
        const obj = Object.create({ inherited: true });
        expect(hasOwnProperty(obj, 'inherited')).toBe(false);
    });

    it('returns false for missing properties', () => {
        expect(hasOwnProperty({ foo: 1 }, 'bar')).toBe(false);
    });

    it('returns false for null', () => {
        expect(hasOwnProperty(null, 'foo')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(hasOwnProperty(undefined, 'foo')).toBe(false);
    });

    it('returns false for primitives', () => {
        expect(hasOwnProperty(42, 'foo')).toBe(false);
    });
});

describe('isObject', () => {
    it('returns true for plain objects', () => {
        expect(isObject({})).toBe(true);
    });

    it('returns true for arrays', () => {
        expect(isObject([])).toBe(true);
    });

    it('returns false for null', () => {
        expect(isObject(null)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isObject(undefined)).toBe(false);
    });

    it('returns false for strings', () => {
        expect(isObject('hello')).toBe(false);
    });

    it('returns false for numbers', () => {
        expect(isObject(42)).toBe(false);
    });

    it('returns false for booleans', () => {
        expect(isObject(true)).toBe(false);
    });
});

describe('getUnsupportedError', () => {
    const originalPlatform = process.platform;

    it('returns undefined on non-Windows platforms', () => {
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });
        try {
            expect(getUnsupportedError()).toBeUndefined();
        } finally {
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                configurable: true,
            });
        }
    });

    it('returns an error message on win32', () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });
        try {
            const result = getUnsupportedError();
            expect(result).toContain('WSL');
            expect(result).toContain('Windows');
        } finally {
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                configurable: true,
            });
        }
    });
});

describe('fileExists', () => {
    it('returns true for existing files', async () => {
        const thisFile = fileURLToPath(import.meta.url);
        expect(await fileExists(thisFile)).toBe(true);
    });

    it('returns false for non-existent paths', async () => {
        expect(await fileExists('/nonexistent/path/to/file.txt')).toBe(false);
    });
});
