import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { Document } from 'yaml';
import { Node, Pair, YAMLMap, YAMLSeq } from 'yaml/types';
import * as _ from 'lodash';

export function getNodeAt(
  document: TextDocument,
  position: Position,
  docs: Document.Parsed[]
): Node | null {
  const offset = document.offsetAt(position);
  const doc = _.find(docs, (d) => contains(d.contents, offset));
  if (doc) {
    return getNodeAtOffset(doc.contents, offset);
  }
  return null;
}

export function contains(node: Node | null, offset: number): boolean {
  return !!(node?.range && node.range[0] <= offset && node.range[1] > offset);
}

export function getNodeAtOffset(
  context: Node | null,
  offset: number
): Node | null {
  if (context instanceof YAMLMap) {
    let pair = _.find(context.items, (p) => contains(p.key, offset));
    if (pair) {
      return getNodeAtOffset(pair.key, offset);
    }
    pair = _.find(context.items, (p) => contains(p.value, offset));
    if (pair) {
      return getNodeAtOffset(pair.value, offset);
    }
  } else if (context instanceof YAMLSeq) {
    const item = _.find(context.items, (n) => contains(n, offset));
    if (item) {
      return getNodeAtOffset(item, offset);
    }
  } else if (contains(context, offset)) {
    return context;
  }
  return null;
}
