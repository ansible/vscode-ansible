import * as _ from 'lodash';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { Document } from 'yaml';
import { Node, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';

/**
 * A helper class used for building YAML path assertions. The assertions are
 * built up from the most nested (last in array) element.
 */
export class AncestryBuilder {
  private _path: Node[];

  private _index: number;

  private _returnKey: boolean;

  constructor(path: Node[] | null, index?: number) {
    this._path = path || [];
    this._index = index || this._path.length - 1;
    this._returnKey = false;
  }

  parent(type?: typeof Node | typeof Pair): AncestryBuilder {
    this._index--;
    if (this.get() instanceof Pair) {
      if (!(type === Pair)) {
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
    if (
      node instanceof Pair &&
      node.key instanceof Scalar &&
      (!key ||
        (key instanceof RegExp && key.test(node.key.value)) ||
        (typeof key == 'string' && key === node.key.value))
    ) {
      this._returnKey = true;
    } else {
      this._index = Number.MIN_SAFE_INTEGER;
    }
    return this;
  }

  get(): Node | null {
    const node = this._path[this._index] || null;
    if (this._returnKey && node instanceof Pair) {
      return node.key;
    }
    return node;
  }

  getPath(): Node[] | null {
    if (this._index < 0) return null;
    const node = this._path[this._index];
    const path = this._path.slice(0, this._index + 1);
    if (this._returnKey && node instanceof Pair) {
      path.push(node.key);
    }
    return path;
  }
}

export function getPathAt(
  document: TextDocument,
  position: Position,
  docs: Document.Parsed[],
  inclusive = false
): Node[] | null {
  const offset = document.offsetAt(position);
  const doc = _.find(docs, (d) => contains(d.contents, offset, inclusive));
  if (doc && doc.contents) {
    return getPathAtOffset([doc.contents], offset, inclusive);
  }
  return null;
}

export function contains(
  node: Node | null,
  offset: number,
  inclusive: boolean
): boolean {
  return !!(
    node?.range &&
    node.range[0] <= offset &&
    (node.range[1] > offset || (inclusive && node.range[1] >= offset))
  );
}

export function getPathAtOffset(
  path: Node[],
  offset: number,
  inclusive: boolean
): Node[] | null {
  if (path) {
    const currentNode = path[path.length - 1];
    if (currentNode instanceof YAMLMap) {
      let pair = _.find(currentNode.items, (p) =>
        contains(p.key, offset, inclusive)
      );
      if (pair) {
        return getPathAtOffset(path.concat(pair, pair.key), offset, inclusive);
      }
      pair = _.find(currentNode.items, (p) =>
        contains(p.value, offset, inclusive)
      );
      if (pair) {
        return getPathAtOffset(
          path.concat(pair, pair.value),
          offset,
          inclusive
        );
      }
      pair = _.find(currentNode.items, (p) => {
        const inBetweenNode = new Node();
        const start = (p.key as Node)?.range?.[1];
        const end = (p.value as Node)?.range?.[0];
        if (start && end) {
          inBetweenNode.range = [start, end - 1];
          return contains(inBetweenNode, offset, inclusive);
        } else return false;
      });
      if (pair) {
        return path.concat(pair, new Node());
      }
    } else if (currentNode instanceof YAMLSeq) {
      const item = _.find(currentNode.items, (n) =>
        contains(n, offset, inclusive)
      );
      if (item) {
        return getPathAtOffset(path.concat(item), offset, inclusive);
      }
    } else if (contains(currentNode, offset, inclusive)) {
      return path;
    }
    return path.concat(new Node()); // empty node as indentation marker
  }
  return null;
}

export const tasksKey = /^(tasks|pre_tasks|post_tasks|block|rescue|always)$/;
export function mayBeModule(path: Node[]): boolean {
  const taskListPath = new AncestryBuilder(path)
    .parent(YAMLMap)
    .parent(YAMLSeq)
    .getPath();
  if (taskListPath) {
    // basic shape of the task list has been found
    if (taskListPath.length === 1) {
      // case when the task list is at the top level of the document
      return true;
    }
    if (new AncestryBuilder(taskListPath).parentKey(tasksKey).get()) {
      // case when a task list is defined explicitly by a keyword
      return true;
    }
  }
  return false;
}

export function getDeclaredCollections(modulePath: Node[] | null): string[] {
  const declaredCollections: string[] = [];
  let blockPath: Node[] | null = modulePath;
  let path: Node[] | null = modulePath;
  while (blockPath) {
    // traverse the YAML up through the Ansible blocks
    path = blockPath;
    blockPath = new AncestryBuilder(blockPath)
      .parent(YAMLMap)
      .parent(YAMLSeq)
      .parentKey(/^block|rescue|always$/)
      .getPath();
  }
  // now we should be at the tasks/pre_tasks/post_tasks level
  const playNode = new AncestryBuilder(path)
    .parent(YAMLMap)
    .parent(YAMLSeq)
    .parent(YAMLMap)
    .get() as YAMLMap | null;
  const collectionsPair = _.find(
    playNode?.items,
    (pair) => pair.key instanceof Scalar && pair.key.value === 'collections'
  );

  if (collectionsPair) {
    // we've found the collections declaration
    const collectionsNode = collectionsPair.value;
    if (collectionsNode instanceof YAMLSeq) {
      for (const collectionNode of collectionsNode.items) {
        if (collectionNode instanceof Scalar) {
          declaredCollections.push(collectionNode.value);
        }
      }
    }
  }

  return declaredCollections;
}
