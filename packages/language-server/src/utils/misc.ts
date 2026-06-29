import { promises as fs } from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver-types';

/**
 * Checks whether a file exists at the given path.
 *
 * @param filePath - Absolute or relative path to test.
 * @returns True when the path refers to an existing file.
 */
export async function fileExists(filePath: string): Promise<boolean> {
    return !!(await fs.stat(filePath).catch(() => false));
}

/**
 * Converts a byte offset range into an LSP range for the given document.
 *
 * @param range - Start and end byte offsets in the document text.
 * @param textDocument - Document whose positions are resolved.
 * @returns The corresponding LSP range.
 */
export function toLspRange(range: [number, number], textDocument: TextDocument): Range {
    const start = textDocument.positionAt(range[0]);
    const end = textDocument.positionAt(range[1]);
    return Range.create(start, end);
}

/**
 * Narrows an object type when it owns the given property key.
 *
 * @param obj - Value to inspect.
 * @param prop - Property key to test.
 * @returns True when the object owns the property.
 */
export function hasOwnProperty<X, Y extends PropertyKey>(
    obj: X,
    prop: Y,
): obj is X & Record<Y, unknown> {
    return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, prop);
}

/**
 * Narrows a value to a non-null object record.
 *
 * @param obj - Value to test.
 * @returns True when the value is a non-null object.
 */
export function isObject<X>(obj: X): obj is X & Record<PropertyKey, unknown> {
    return obj !== null && obj !== undefined && typeof obj === 'object';
}

/**
 * Inserts a substring at the given index within a string.
 *
 * @param str - Source string.
 * @param index - Zero-based insertion offset.
 * @param val - Text to insert.
 * @returns The string with the inserted value.
 */
export function insert(str: string, index: number, val: string): string {
    return `${str.substring(0, index)}${val}${str.substring(index)}`;
}

/**
 * Returns an error message when the LS runs on an unsupported platform.
 *
 * @returns A user-facing error message, or undefined when the platform is supported.
 */
export function getUnsupportedError(): string | undefined {
    if (process.platform === 'win32') {
        return 'Ansible Language Server can only run inside WSL on Windows.';
    }
}
