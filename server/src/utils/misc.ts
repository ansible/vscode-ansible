import { promises as fs } from 'fs';
import { URL } from 'url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver-types';
import { parseAllDocuments } from 'yaml';
import { IDocumentMetadata } from '../interfaces/documentMeta';

async function fileExists(filePath: string): Promise<boolean> {
  return !!(await fs.stat(filePath).catch(() => false));
}

export async function getAnsibleMetadata(
  uri: string
): Promise<IDocumentMetadata> {
  let metaPath;
  // const path = /file:\/\/(.*)/.exec(uri)?.groups
  const pathArray = uri.split('/');
  // Find first
  for (let index = pathArray.length - 1; index >= 0; index--) {
    if (pathArray[index] === 'tasks') {
      metaPath = pathArray.slice(0, index).concat('meta', 'main.yml').join('/');
    }
  }
  const metadata = {
    collections: new Array<string>(),
  };
  if (metaPath && fileExists(metaPath)) {
    try {
      const metaContents = await fs.readFile(new URL(metaPath), {
        encoding: 'utf8',
      });
      parseAllDocuments(metaContents).forEach((metaDoc) => {
        const metaObject: unknown = metaDoc.toJSON();
        if (
          hasOwnProperty(metaObject, 'collections') &&
          metaObject.collections instanceof Array
        ) {
          metaObject.collections.forEach((collection) => {
            if (typeof collection === 'string') {
              metadata.collections.push(collection);
            }
          });
        }
      });
    } catch (error) {
      //TODO: Log debug
    }
  }
  return metadata;
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
