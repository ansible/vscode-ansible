import * as _ from 'lodash';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { Document } from 'yaml';
import { Node, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';
import { DocsLibrary, IModuleMetadata } from '../services/docsLibrary';
import { isTaskKeyword, playExclusiveKeywords } from './ansible';

/**
 * A helper class used for building YAML path assertions and retrieving parent
 * nodes. The assertions are built up from the most nested (last in array)
 * element.
 */
export class AncestryBuilder<N extends Node | Pair = Node> {
  private _path: Node[];

  private _index: number;

  constructor(path: Node[] | null, index?: number) {
    this._path = path || [];
    this._index = index || this._path.length - 1;
  }

  /**
   * Move up the path, optionally asserting the type of the parent.
   *
   * Unless Pair is explicitly asserted, it is ignored/skipped over when moving
   * up.
   */
  parent<X extends Node | Pair>(
    type?: new (...args: unknown[]) => X
  ): AncestryBuilder<X> {
    this._index--;
    if (this.get() instanceof Pair) {
      if (!type || !(type === Pair.prototype.constructor)) {
        this._index--;
      }
    }
    if (type) {
      if (!(this.get() instanceof type)) {
        this._index = Number.MIN_SAFE_INTEGER;
      }
    }
    return this as unknown as AncestryBuilder<X>;
  }

  /**
   * Move up the path, asserting that the current node was a key of a mapping
   * pair. The builder skips over the Pair to the parent YAMLMap.
   */
  parentOfKey(): AncestryBuilder<YAMLMap> {
    const node = this.get();
    this.parent(Pair);
    const pairNode = this.get();
    if (pairNode instanceof Pair && pairNode.key === node) {
      this.parent(YAMLMap);
    } else {
      this._index = Number.MIN_SAFE_INTEGER;
    }
    return this as unknown as AncestryBuilder<YAMLMap>;
  }

  /**
   * Get node up to which the assertions have led.
   */
  get(): N | null {
    return (this._path[this._index] as N) || null;
  }

  /**
   * Get the key of the Pair one level down the path.
   *
   * The key is returned only if it indeed is a string Scalar.
   */
  // The `this` argument is for generics restriction of this method.
  getStringKey(this: AncestryBuilder<YAMLMap>): string | null {
    const node = this._path[this._index + 1];
    if (
      node instanceof Pair &&
      node.key instanceof Scalar &&
      typeof node.key.value === 'string'
    ) {
      return node.key.value;
    }
    return null;
  }

  /**
   * Get the value of the Pair one level down the path.
   */
  // The `this` argument is for generics restriction of this method.
  getValue(this: AncestryBuilder<YAMLMap>): Node | null {
    const node = this._path[this._index + 1];
    if (node instanceof Pair) {
      return node.value;
    }
    return null;
  }

  /**
   * Get the path to which the assertions have led.
   *
   * The path will be a subpath of the original path.
   */
  getPath(): Node[] | null {
    if (this._index < 0) return null;
    const path = this._path.slice(0, this._index + 1);
    return path;
  }

  /**
   * Get the path to the key of the Pair one level down the path to which the
   * assertions have led.
   *
   * The path will be a subpath of the original path.
   */
  // The `this` argument is for generics restriction of this method.
  getKeyPath(this: AncestryBuilder<YAMLMap>): Node[] | null {
    if (this._index < 0) return null;
    const path = this._path.slice(0, this._index + 1);
    const node = this._path[this._index + 1];
    if (node instanceof Pair) {
      path.push(node);
      path.push(node.key);
      return path;
    }
    return null;
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

/**
 * Determines whether the path points at a parameter key of an Ansible task.
 */
export function isTaskParam(path: Node[]): boolean {
  const taskListPath = new AncestryBuilder(path)
    .parentOfKey()
    .parent(YAMLSeq)
    .getPath();
  if (taskListPath) {
    // basic shape of the task list has been found

    if (isPlayParam(path) || isBlockParam(path) || isRoleParam(path))
      return false;

    if (taskListPath.length === 1) {
      // case when the task list is at the top level of the document
      return true;
    }
    const taskListKey = new AncestryBuilder(taskListPath)
      .parent(YAMLMap)
      .getStringKey();
    if (taskListKey && tasksKey.test(taskListKey)) {
      // case when a task list is defined explicitly by a keyword
      return true;
    }
  }
  return false;
}

/**
 * Tries to find the list of collections declared at the Ansible play/block/task level.
 */
export function getDeclaredCollections(modulePath: Node[] | null): string[] {
  const declaredCollections: string[] = [];
  const taskParamsNode = new AncestryBuilder(modulePath).parent(YAMLMap).get();
  declaredCollections.push(...getDeclaredCollectionsForMap(taskParamsNode));

  let path: Node[] | null = new AncestryBuilder(modulePath)
    .parent(YAMLMap)
    .getPath();
  while (true) {
    // traverse the YAML up through the Ansible blocks
    const builder = new AncestryBuilder(path).parent(YAMLSeq).parent(YAMLMap);
    const key = builder.getStringKey();
    if (key && /^block|rescue|always$/.test(key)) {
      declaredCollections.push(...getDeclaredCollectionsForMap(builder.get()));
      path = builder.getPath();
    } else {
      break;
    }
  }
  // now we should be at the tasks/pre_tasks/post_tasks level
  const playParamsNode = new AncestryBuilder(path)
    .parent(YAMLSeq)
    .parent(YAMLMap)
    .get();
  declaredCollections.push(...getDeclaredCollectionsForMap(playParamsNode));

  return [...new Set(declaredCollections)]; // deduplicate
}

function getDeclaredCollectionsForMap(playNode: YAMLMap | null): string[] {
  const declaredCollections: string[] = [];
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

/**
 * Heuristically determines whether the path points at an Ansible play. The
 * `fileUri` helps guessing in case the YAML tree doesn't give any clues.
 *
 * Returns `undefined` if highly uncertain.
 */
export function isPlayParam(
  path: Node[],
  fileUri?: string
): boolean | undefined {
  const isAtRoot =
    new AncestryBuilder(path).parentOfKey().parent(YAMLSeq).getPath()
      ?.length === 1;
  if (isAtRoot) {
    const mapNode = new AncestryBuilder(path).parentOfKey().get() as YAMLMap;
    const providedKeys = getYamlMapKeys(mapNode);
    const containsPlayKeyword = providedKeys.some((p) =>
      playExclusiveKeywords.has(p)
    );
    if (containsPlayKeyword) {
      return true;
    }
    if (fileUri) {
      const isInRole = /\/roles\/[^/]+\/tasks\//.test(fileUri);
      if (isInRole) {
        return false;
      }
    }
  } else {
    return false;
  }
}

/**
 * Determines whether the path points at one of Ansible block parameter keys.
 */
export function isBlockParam(path: Node[]): boolean {
  const mapNode = new AncestryBuilder(path).parentOfKey().get();
  if (mapNode) {
    const providedKeys = getYamlMapKeys(mapNode);
    return providedKeys.includes('block');
  }
  return false;
}

/**
 * Determines whether the path points at one of Ansible role parameter keys.
 */
export function isRoleParam(path: Node[]): boolean {
  const rolesKey = new AncestryBuilder(path)
    .parentOfKey()
    .parent(YAMLSeq)
    .parent(YAMLMap)
    .getStringKey();
  return rolesKey === 'roles';
}

/**
 * For a given Ansible task parameter path, find the module if it has been
 * provided for the task.
 */
export async function findProvidedModule(
  taskParamPath: Node[],
  document: TextDocument,
  docsLibrary: DocsLibrary
): Promise<IModuleMetadata | undefined> {
  const taskParameterMap = new AncestryBuilder(taskParamPath)
    .parent(YAMLMap)
    .get();
  if (taskParameterMap) {
    // find task parameters that have been provided by the user
    const providedParameters = new Set(getYamlMapKeys(taskParameterMap));
    // should usually be 0 or 1
    const providedModuleNames = [...providedParameters].filter(
      (x) => !x || !isTaskKeyword(x)
    );

    // find the module if it has been provided
    for (const m of providedModuleNames) {
      const module = await docsLibrary.findModule(
        m,
        taskParamPath,
        document.uri
      );
      if (module) {
        return module;
      }
    }
  }
}

export function getYamlMapKeys(mapNode: YAMLMap): Array<string> {
  return mapNode.items.map((pair) => {
    if (pair.key && pair.key instanceof Scalar) {
      return pair.key.value;
    }
  });
}
