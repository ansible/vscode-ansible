import { describe, it, expect } from 'vitest';
import { isValueMissing, getFieldError } from '../../src/utils/formValidation';
import type { ParameterSchema } from '../../src/bridge/creator';

const stringProp: ParameterSchema = { type: 'string', description: 'test' };
const arrayProp: ParameterSchema = { type: 'array', description: 'test' };
const boolProp: ParameterSchema = { type: 'boolean', description: 'test' };

describe('isValueMissing', () => {
    it('treats undefined as missing', () => {
        expect(isValueMissing(undefined, stringProp)).toBe(true);
    });

    it('treats null as missing', () => {
        expect(isValueMissing(null, stringProp)).toBe(true);
    });

    it('treats empty string as missing', () => {
        expect(isValueMissing('', stringProp)).toBe(true);
    });

    it('treats whitespace-only string as missing', () => {
        expect(isValueMissing('   ', stringProp)).toBe(true);
    });

    it('treats non-empty string as present', () => {
        expect(isValueMissing('hello', stringProp)).toBe(false);
    });

    it('treats empty array as missing', () => {
        expect(isValueMissing([], arrayProp)).toBe(true);
    });

    it('treats populated array as present', () => {
        expect(isValueMissing(['item'], arrayProp)).toBe(false);
    });

    it('treats false boolean as present', () => {
        expect(isValueMissing(false, boolProp)).toBe(false);
    });

    it('treats true boolean as present', () => {
        expect(isValueMissing(true, boolProp)).toBe(false);
    });

    it('treats number as present', () => {
        expect(isValueMissing(42, stringProp)).toBe(false);
    });
});

describe('getFieldError', () => {
    describe('required validation', () => {
        it('returns error for empty required string', () => {
            expect(getFieldError('name', '', stringProp, true)).toBe('This field is required');
        });

        it('returns no error for filled required string', () => {
            expect(getFieldError('name', 'value', stringProp, true)).toBeUndefined();
        });

        it('returns error for empty required array', () => {
            expect(getFieldError('tags', [], arrayProp, true)).toBe('This field is required');
        });

        it('returns no error for populated required array', () => {
            expect(getFieldError('tags', ['tag1'], arrayProp, true)).toBeUndefined();
        });

        it('returns no error for false required boolean', () => {
            expect(getFieldError('force', false, boolProp, true)).toBeUndefined();
        });

        it('returns no error for optional empty field', () => {
            expect(getFieldError('name', '', stringProp, false)).toBeUndefined();
        });
    });

    describe('FQCN collection validation', () => {
        it('accepts valid FQCN', () => {
            expect(getFieldError('collection', 'my_ns.my_col', stringProp, true)).toBeUndefined();
        });

        it('rejects name without dot', () => {
            expect(getFieldError('collection', 'abc', stringProp, true)).toBe(
                'Must be in format namespace.name (lowercase letters and underscores only)',
            );
        });

        it('rejects uppercase', () => {
            expect(getFieldError('collection', 'MyNs.MyCol', stringProp, true)).toBe(
                'Must be in format namespace.name (lowercase letters and underscores only)',
            );
        });

        it('rejects hyphens', () => {
            expect(getFieldError('collection', 'my-ns.my-col', stringProp, true)).toBe(
                'Must be in format namespace.name (lowercase letters and underscores only)',
            );
        });

        it('rejects leading underscore in namespace', () => {
            expect(getFieldError('collection', '_ns.col', stringProp, true)).toBe(
                'Must be in format namespace.name (lowercase letters and underscores only)',
            );
        });

        it('rejects consecutive underscores', () => {
            expect(getFieldError('collection', 'my__ns.col', stringProp, true)).toBe(
                'Must be in format namespace.name (lowercase letters and underscores only)',
            );
        });

        it('does not apply FQCN check to non-collection fields', () => {
            expect(getFieldError('name', 'abc', stringProp, true)).toBeUndefined();
        });
    });

    describe('minLength validation', () => {
        const prop: ParameterSchema = { ...stringProp, minLength: 3 };

        it('returns error when too short', () => {
            expect(getFieldError('name', 'ab', prop, false)).toBe('Must be at least 3 characters');
        });

        it('returns no error when long enough', () => {
            expect(getFieldError('name', 'abc', prop, false)).toBeUndefined();
        });

        it('skips check for empty value', () => {
            expect(getFieldError('name', '', prop, false)).toBeUndefined();
        });
    });

    describe('maxLength validation', () => {
        const prop: ParameterSchema = { ...stringProp, maxLength: 5 };

        it('returns error when too long', () => {
            expect(getFieldError('name', 'abcdef', prop, false)).toBe(
                'Must be at most 5 characters',
            );
        });

        it('returns no error when within limit', () => {
            expect(getFieldError('name', 'abc', prop, false)).toBeUndefined();
        });

        it('handles maxLength of 0', () => {
            const zeroProp: ParameterSchema = { ...stringProp, maxLength: 0 };
            expect(getFieldError('name', 'a', zeroProp, false)).toBe(
                'Must be at most 0 characters',
            );
        });
    });

    describe('pattern validation', () => {
        const prop: ParameterSchema = { ...stringProp, pattern: '^[a-z]+$' };

        it('returns error for non-matching value', () => {
            expect(getFieldError('name', 'ABC', prop, false)).toBe(
                'Does not match the required format',
            );
        });

        it('returns no error for matching value', () => {
            expect(getFieldError('name', 'abc', prop, false)).toBeUndefined();
        });

        it('skips check for empty value', () => {
            expect(getFieldError('name', '', prop, false)).toBeUndefined();
        });

        it('skips check for invalid regex in schema', () => {
            const badProp: ParameterSchema = { ...stringProp, pattern: '[invalid(' };
            expect(getFieldError('name', 'test', badProp, false)).toBeUndefined();
        });
    });
});
