import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { Document } from 'yaml';
import { Node, Pair, YAMLMap, YAMLSeq } from 'yaml/types';
import * as _ from 'lodash';

export function getPathAt(
  document: TextDocument,
  position: Position,
  docs: Document.Parsed[]
): Node[] | null {
  const offset = document.offsetAt(position);
  const doc = _.find(docs, (d) => contains(d.contents, offset));
  if (doc && doc.contents) {
    return getPathAtOffset([doc.contents], offset);
  }
  return null;
}

export function contains(node: Node | null, offset: number): boolean {
  return !!(node?.range && node.range[0] <= offset && node.range[1] > offset);
}

export function getPathAtOffset(path: Node[], offset: number): Node[] | null {
  if (path) {
    const currentNode = path[path.length - 1];
    if (currentNode instanceof YAMLMap) {
      let pair = _.find(currentNode.items, (p) => contains(p.key, offset));
      if (pair) {
        return getPathAtOffset(path.concat(pair, pair.key), offset);
      }
      pair = _.find(currentNode.items, (p) => contains(p.value, offset));
      if (pair) {
        return getPathAtOffset(path.concat(pair, pair.value), offset);
      }
    } else if (currentNode instanceof YAMLSeq) {
      const item = _.find(currentNode.items, (n) => contains(n, offset));
      if (item) {
        return getPathAtOffset(path.concat(item), offset);
      }
    } else if (contains(currentNode, offset)) {
      return path;
    }
  }
  return null;
}
