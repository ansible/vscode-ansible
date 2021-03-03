import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { Document } from 'yaml';
import { Node, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';
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

export class AncestryBuilder {
  private _path: Node[];

  private _index: number;

  private _returnKey: boolean;

  constructor(path: Node[] | null, index?: number) {
    this._path = path || [];
    this._index = index || this._path.length - 1;
    this._returnKey = false;
  }

  parent(type?: typeof Node): AncestryBuilder {
    this._index--;
    if (this.get() instanceof Pair) {
      if (!(type?.prototype instanceof Pair)) {
        this._index--; // unless Pair is explicitly requested, we ignore pair when just going up
      }
    }
    if (type) {
      if (!(this.get() instanceof type)) {
        this._index = Number.MIN_SAFE_INTEGER;
      }
    }
    this._returnKey = false;
    return this;
  }

  parentKey(key?: string | RegExp): AncestryBuilder {
    this._index--;
    const node = this.get();
    if (typeof key == 'string') {
      key = new RegExp(`^${key}$`);
    }
    if (
      node instanceof Pair &&
      node.key instanceof Scalar &&
      (!key || key.test(node.key.value))
    ) {
      this._returnKey = true;
    } else {
      this._index = Number.MIN_SAFE_INTEGER;
    }
    return this;
  }

  get(): Node | undefined {
    const node = this._path[this._index];
    if (this._returnKey && node instanceof Pair) {
      return node.key;
    }
    return node;
  }

  getPath(): Node[] | undefined {
    if (this._index < 0) return undefined;
    const node = this._path[this._index];
    const path = this._path.slice(0, this._index + 1);
    if (this._returnKey && node instanceof Pair) {
      path.push(node.key);
    }
    return path;
  }
}
