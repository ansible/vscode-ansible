/**
 * Schema-driven form validation utilities.
 * Extracted from SchemaForm for independent testability and reuse.
 */

import type { ParameterSchema } from '../bridge/creator';

/** Ansible FQCN format: namespace.name with lowercase letters, digits, and underscores. */
const FQCN_PATTERN = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

/**
 * Check whether a form value should be considered missing for required-field validation.
 *
 * @param value - The current field value to check.
 * @param prop - Schema metadata describing the field type.
 * @returns True when the value is absent or empty for its type.
 */
export function isValueMissing(value: unknown, prop: ParameterSchema): boolean {
    if (value === undefined || value === null) return true;
    if (prop.type === 'array') return !Array.isArray(value) || value.length === 0;
    if (prop.type === 'boolean') return false;
    if (typeof value === 'string') return value.trim() === '';
    return false;
}

/**
 * Return a validation error message for a single form field, or undefined when valid.
 *
 * @param key - The schema parameter key (e.g. "collection", "name").
 * @param value - The current field value.
 * @param prop - Schema metadata for the field.
 * @param isRequired - Whether the field is listed in the schema required array.
 * @returns Error message string, or undefined when the value is valid.
 */
export function getFieldError(
    key: string,
    value: unknown,
    prop: ParameterSchema,
    isRequired: boolean,
): string | undefined {
    const strVal = typeof value === 'string' ? value.trim() : '';

    if (isRequired && isValueMissing(value, prop)) {
        return 'This field is required';
    }

    if (key === 'collection' && strVal !== '') {
        if (!FQCN_PATTERN.test(strVal)) {
            return 'Must be in format namespace.name (lowercase letters and underscores only)';
        }
    }

    if (prop.minLength !== undefined && prop.minLength > 0 && strVal.length > 0 && strVal.length < prop.minLength) {
        return `Must be at least ${String(prop.minLength)} characters`;
    }

    if (prop.maxLength !== undefined && strVal.length > prop.maxLength) {
        return `Must be at most ${String(prop.maxLength)} characters`;
    }

    if (prop.pattern && strVal !== '') {
        try {
            if (!new RegExp(prop.pattern).test(strVal)) {
                return 'Does not match the required format';
            }
        } catch {
            /* invalid regex in schema, skip */
        }
    }

    return undefined;
}
