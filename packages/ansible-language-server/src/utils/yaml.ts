import * as _ from "lodash";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  Document,
  DocumentOptions,
  isMap,
  isPair,
  isScalar,
  isSeq,
  Node,
  Pair,
  parseDocument,
  ParseOptions,
  Schema,
  SchemaOptions,
  YAMLMap,
  YAMLSeq,
} from "yaml";
import { IModuleMetadata, IOption } from "../interfaces/module";
import { DocsLibrary } from "../services/docsLibrary";
import { isTaskKeyword, playExclusiveKeywords } from "./ansible";
import { playKeywords, taskKeywords } from "../utils/ansible";
import { Range, Position } from "vscode-languageserver";

type Options = ParseOptions & DocumentOptions & SchemaOptions;

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
    type?: new (...args: Schema[]) => X,
  ): AncestryBuilder<X> {
    this._index--;
    if (isPair(this.get())) {
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
    if (isPair(pairNode) && pairNode.key === node) {
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
      node &&
      isPair(node) &&
      isScalar(node.key) &&
      typeof node.key.value === "string"
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
    if (isPair(node)) {
      return node.value as Node;
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
    if (isPair(node)) {
      path.push(node);
      path.push(node.key as Node);
      return path;
    }
    return null;
  }
}

export function getPathAt(
  document: TextDocument,
  position: Position,
  docs: Document[],
  inclusive = false,
): Node[] | null {
  const offset = document.offsetAt(position);
  const doc = _.find(docs, (d) => contains(d.contents, offset, inclusive));
  if (doc && doc.contents) {
    return getPathAtOffset([doc.contents], offset, inclusive, doc);
  }
  return null;
}

export function contains(
  node: Node | null,
  offset: number,
  inclusive: boolean,
): boolean {
  const range = getOrigRange(node);
  return !!(
    range &&
    range[0] <= offset &&
    (range[1] > offset || (inclusive && range[1] >= offset))
  );
}

export function getPathAtOffset(
  path: Node[],
  offset: number,
  inclusive: boolean,
  doc: Document,
): Node[] | null {
  if (path) {
    const currentNode = path[path.length - 1];
    if (isMap(currentNode)) {
      let pair = _.find(currentNode.items, (p) =>
        contains(p.key as Node, offset, inclusive),
      );
      if (pair) {
        return getPathAtOffset(
          path.concat(pair as unknown as Node, pair.key as Node),
          offset,
          inclusive,
          doc,
        );
      }
      pair = _.find(currentNode.items, (p) =>
        contains(p.value as Node, offset, inclusive),
      );
      if (pair) {
        return getPathAtOffset(
          path.concat(pair as unknown as Node, pair.value as Node),
          offset,
          inclusive,
          doc,
        );
      }
      pair = _.find(currentNode.items, (p) => {
        const inBetweenNode = doc.createNode(null);
        const start = getOrigRange(p.key as Node)?.[1];
        const end = getOrigRange(p.value as Node)?.[0];
        if (start && end) {
          inBetweenNode.range = [start, end - 1, end];
          return contains(inBetweenNode, offset, inclusive);
        } else return false;
      });
      if (pair) {
        return path.concat(pair as unknown as Node, doc.createNode(null));
      }
    } else if (isSeq(currentNode)) {
      const item = _.find(currentNode.items, (n) =>
        contains(n as Node, offset, inclusive),
      );
      if (item) {
        return getPathAtOffset(
          path.concat(item as Node),
          offset,
          inclusive,
          doc,
        );
      }
    } else if (contains(currentNode, offset, inclusive)) {
      return path;
    }
    return path.concat(doc.createNode(null)); // empty node as indentation marker
  }
  return null;
}

export const tasksKey =
  /^(tasks|pre_tasks|post_tasks|block|rescue|always|handlers)$/;

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
    (pair) => isScalar(pair.key) && pair.key.value === "collections",
  );

  if (collectionsPair) {
    // we've found the collections declaration
    const collectionsNode = collectionsPair.value;
    if (isSeq(collectionsNode)) {
      for (const collectionNode of collectionsNode.items) {
        if (isScalar(collectionNode)) {
          declaredCollections.push(String(collectionNode.value));
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
  fileUri?: string,
): boolean | undefined {
  const isAtRoot =
    new AncestryBuilder(path).parentOfKey().parent(YAMLSeq).getPath()
      ?.length === 1;
  if (isAtRoot) {
    const mapNode = new AncestryBuilder(path).parentOfKey().get() as YAMLMap;
    const providedKeys = getYamlMapKeys(mapNode);
    const containsPlayKeyword = providedKeys.some((p) =>
      playExclusiveKeywords.has(p),
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
  const builder = new AncestryBuilder(path).parentOfKey();
  const mapNode = builder.get();
  // the block must have a list as parent
  const isInYAMLSeq = !!builder.parent(YAMLSeq).get();
  if (mapNode && isInYAMLSeq) {
    const providedKeys = getYamlMapKeys(mapNode);
    return providedKeys.includes("block");
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
  return rolesKey === "roles";
}

/**
 * If the path points at a parameter or sub-parameter provided for a module, it
 * will return the list of all possible options or sub-options at that
 * level/indentation.
 */
export async function getPossibleOptionsForPath(
  path: Node[],
  document: TextDocument,
  docsLibrary: DocsLibrary,
): Promise<Map<string, IOption> | null> {
  const [taskParamPath, suboptionTrace] = getTaskParamPathWithTrace(path);
  if (!taskParamPath) return null;

  const optionTraceElement = suboptionTrace.pop();
  if (!optionTraceElement || optionTraceElement[1] !== "dict") {
    // that element must always be a `dict`
    // (unlike for sub-options, which can also be a 'list')
    return null;
  }

  // The module name is a key of the task parameters map
  const taskParamNode = taskParamPath[taskParamPath.length - 1];
  if (!isScalar(taskParamNode)) return null;

  let module;
  // Module options can either be directly under module or in 'args'
  if (taskParamNode.value === "args") {
    module = await findProvidedModule(taskParamPath, document, docsLibrary);
  } else {
    [module] = await docsLibrary.findModule(
      taskParamNode.value as string,
      taskParamPath,
      document.uri,
    );
  }
  if (!module || !module.documentation) return null;

  let options = module.documentation.options;
  suboptionTrace.reverse(); // now going down the path
  for (const [optionName, optionType] of suboptionTrace) {
    const option = options.get(optionName);
    if (optionName && option?.type === optionType && option.suboptions) {
      options = option.suboptions;
    } else {
      return null; // suboption structure mismatch
    }
  }

  return options;
}

/**
 * For a given path, it searches up that path until a path to the task parameter
 * (typically a module name) is found. The trace of keys with indication whether
 * the values hold a 'list' or a 'dict' is preserved along the way and returned
 * alongside.
 */
export function getTaskParamPathWithTrace(
  path: Node[],
): [Node[], [string, "list" | "dict"][]] {
  const trace: [string, "list" | "dict"][] = [];
  while (!isTaskParam(path)) {
    let parentKeyPath = new AncestryBuilder(path)
      .parentOfKey()
      .parent(YAMLMap)
      .getKeyPath();
    if (parentKeyPath) {
      const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
      if (isScalar(parentKeyNode) && typeof parentKeyNode.value === "string") {
        trace.push([parentKeyNode.value, "dict"]);
        path = parentKeyPath;
        continue;
      }
    }
    parentKeyPath = new AncestryBuilder(path)
      .parentOfKey()
      .parent(YAMLSeq)
      .parent(YAMLMap)
      .getKeyPath();
    if (parentKeyPath) {
      const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
      if (isScalar(parentKeyNode) && typeof parentKeyNode.value === "string") {
        trace.push([parentKeyNode.value, "list"]);
        path = parentKeyPath;
        continue;
      }
    }
    return [[], []]; // return empty if no structural match found
  }
  return [path, trace];
}

/**
 * For a given Ansible task parameter path, find the module if it has been
 * provided for the task.
 */
export async function findProvidedModule(
  taskParamPath: Node[],
  document: TextDocument,
  docsLibrary: DocsLibrary,
): Promise<IModuleMetadata | undefined> {
  const taskParameterMap = new AncestryBuilder(taskParamPath)
    .parent(YAMLMap)
    .get();
  if (taskParameterMap) {
    // find task parameters that have been provided by the user
    const providedParameters = new Set(getYamlMapKeys(taskParameterMap));
    // should usually be 0 or 1
    const providedModuleNames = [...providedParameters].filter(
      (x) => !x || !isTaskKeyword(x),
    );

    // find the module if it has been provided
    for (const m of providedModuleNames) {
      const [module] = await docsLibrary.findModule(
        m,
        taskParamPath,
        document.uri,
      );
      if (module) {
        return module;
      }
    }
  }
}

export function getYamlMapKeys(mapNode: YAMLMap): Array<string> {
  return mapNode.items
    .map((pair) => {
      if (pair.key && isScalar(pair.key)) {
        return String(pair.key.value);
      }
    })
    .filter((e) => !!e) as string[];
}

export function getOrigRange(
  node: Node | null | undefined,
): [number, number] | undefined {
  if (
    node?.range &&
    node.range[0] !== undefined &&
    node.range[1] !== undefined
  ) {
    return [node.range[0], node.range[1]];
  }
  return undefined;
}

/** Parsing with the YAML library tailored to the needs of this extension */
export function parseAllDocuments(str: string, options?: Options): Document[] {
  if (!str) {
    return [];
  }
  const doc = parseDocument(
    str,
    Object.assign({ keepSourceTokens: true, options }),
  );
  return [doc];
}

/**
 * For a given yaml file that is recognized as Ansible file, the function
 * checks whether the file is a playbook or not
 * @param textDocument - the text document to check
 */
export function isPlaybook(textDocument: TextDocument): boolean {
  // Check for empty file
  if (textDocument.getText().trim().length === 0) {
    return false;
  }

  const yamlDocs = parseAllDocuments(textDocument.getText());
  const path = getPathAt(textDocument, { line: 1, character: 1 }, yamlDocs);

  //   Check if keys are present or not
  if (!path) {
    return false;
  }

  //   A playbook is always YAML sequence
  if (!isSeq(path[0])) {
    return false;
  }

  const playbookKeysSet: Set<string> = new Set();
  const playbookJSON = path[0].toJSON();

  playbookJSON.forEach((item) => {
    if (item) {
      Object.keys(item).forEach((item) => playbookKeysSet.add(item));
    }
  });

  const playbookKeys = [...playbookKeysSet];

  const playKeywordsList = [...playKeywords.keys()];
  const taskKeywordsList = [...taskKeywords.keys()];

  //   Filters out all play keywords that are task keywords
  const filteredList = playKeywordsList.filter(
    (value) => !taskKeywordsList.includes(value),
  );

  //   Check if any top-level key of the ansible file is a part of filtered list
  //    If it is: The file is a playbook
  //    Else: The file is not a playbook
  const isPlaybookValue = playbookKeys.some((r: string) =>
    filteredList.includes(r),
  );

  return isPlaybookValue;
}

/**
 * A function to check if the cursor is present inside valid jinja inline brackets in a yaml file
 * @param document - text document on which the function is to be checked
 * @param position - current cursor position
 * @param path - array of nodes leading to that position
 * @returns boolean true if the cursor is inside valid jinja inline brackets, else false
 */
export function isCursorInsideJinjaBrackets(
  document: TextDocument,
  position: Position,
  path: Node[],
): boolean {
  const node = path?.[path?.length - 1];
  let nodeObject: string | string[];

  try {
    nodeObject = node.toJSON();
  } catch (error) {
    // return early if invalid yaml syntax
    return false;
  }

  if (nodeObject && !nodeObject.includes("{{ ")) {
    // this handles the case that if a value starts with {{ foo }}, the whole expression must be quoted
    // to create a valid syntax
    // refer: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_variables.html#when-to-quote-variables-a-yaml-gotcha
    return false;
  }

  // get text from the beginning of current line till the cursor
  const lineText = document.getText(
    Range.create(position.line, 0, position.line, position.character),
  );

  const jinjaInlineBracketStartIndex = lineText.lastIndexOf("{{ ");
  const lineAfterCursor = document.getText(
    Range.create(
      position,
      document.positionAt(document.offsetAt(position) + lineText.length),
    ),
  );

  // this is a safety check in case of multiple jinja inline brackets in a single line
  let jinjaInlineBracketEndIndex = lineAfterCursor.indexOf(" }}");
  if (
    lineAfterCursor.indexOf("{{ ") !== -1 &&
    lineAfterCursor.indexOf("{{ ") < jinjaInlineBracketEndIndex
  ) {
    jinjaInlineBracketEndIndex = -1;
  }

  if (
    jinjaInlineBracketStartIndex > -1 &&
    jinjaInlineBracketEndIndex > -1 &&
    position.character > jinjaInlineBracketStartIndex &&
    position.character <=
      jinjaInlineBracketEndIndex +
        jinjaInlineBracketStartIndex +
        lineText.length
  ) {
    return true;
  }

  return false;
}
