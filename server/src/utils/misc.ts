import { promises as fs } from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver-types';

export async function fileExists(filePath: string): Promise<boolean> {
  return !!(await fs.stat(filePath).catch(() => false));
}

export function toLspRange(
  range: [number, number],
  textDocument: TextDocument
): Range {
  const start = textDocument.positionAt(range[0]);
  const end = textDocument.positionAt(range[1]);
  return Range.create(start, end);
}

export function hasOwnProperty<X extends unknown, Y extends PropertyKey>(
  obj: X,
  prop: Y
): obj is X & Record<PropertyKey, unknown> & Record<Y, unknown> {
  return isObject(obj) && obj.hasOwnProperty(prop);
}

/**
 * Checks whether `obj` is a non-null object.
 * @param obj
 * @returns
 */
export function isObject<X extends unknown>(
  obj: X
): obj is X & Record<PropertyKey, unknown> {
  return obj && typeof obj === 'object';
}
