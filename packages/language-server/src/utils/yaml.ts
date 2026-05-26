import _ from "lodash";
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
import {
  isTaskKeyword,
  playExclusiveKeywords,
  playKeywords,
  taskKeywords,
} from "./ansible";
import { Range, Position } from "vscode-languageserver";
import type {
  CollectionsService,
  PluginData,
  PluginOption,
} from "@ansible/core/out/services/CollectionsService";

type Options = ParseOptions & DocumentOptions & SchemaOptions;

export class AncestryBuilder<N extends Node | Pair = Node> {
  private _path: Node[];
  private _index: number;

  constructor(path: Node[] | null, index?: number) {
    this._path = path || [];
    this._index = index || this._path.length - 1;
  }

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

  get(): N | null {
    return (this._path[this._index] as N) || null;
  }

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

  getValue(this: AncestryBuilder<YAMLMap>): Node | null {
    const node = this._path[this._index + 1];
    if (isPair(node)) {
      return node.value as Node;
    }
    return null;
  }

  getPath(): Node[] | null {
    if (this._index < 0) return null;
    return this._path.slice(0, this._index + 1);
  }

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
  const doc = _.find(docs, (d: Document) => contains(d.contents, offset, inclusive));
  if (doc && doc.contents) {
    return getPathAtOffset([doc.contents], offset, inclusive, doc);
  }
  return null;
}

function contains(
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

function getPathAtOffset(
  path: Node[],
  offset: number,
  inclusive: boolean,
  doc: Document,
): Node[] | null {
  if (!path) return null;

  const currentNode = path[path.length - 1];
  if (isMap(currentNode)) {
    let pair = _.find(currentNode.items, (p: Pair) =>
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
    pair = _.find(currentNode.items, (p: Pair) =>
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
    pair = _.find(currentNode.items, (p: Pair) => {
      const inBetweenNode = doc.createNode(null);
      const start = getOrigRange(p.key as Node)?.[1];
      const end = getOrigRange(p.value as Node)?.[0];
      if (start && end) {
        inBetweenNode.range = [start, end - 1, end];
        return contains(inBetweenNode, offset, inclusive);
      }
      return false;
    });
    if (pair) {
      return path.concat(pair as unknown as Node, doc.createNode(null));
    }
  } else if (isSeq(currentNode)) {
    const item = _.find(currentNode.items, (n: unknown) =>
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
  return path.concat(doc.createNode(null));
}

const tasksKey = /^(tasks|pre_tasks|post_tasks|block|rescue|always|handlers)$/;

export function isTaskParam(path: Node[]): boolean {
  const taskListPath = new AncestryBuilder(path)
    .parentOfKey()
    .parent(YAMLSeq)
    .getPath();
  if (taskListPath) {
    if (isPlayParam(path) || isBlockParam(path) || isRoleParam(path)) {
      return false;
    }
    if (taskListPath.length === 1) {
      return true;
    }
    const taskListKey = new AncestryBuilder(taskListPath)
      .parent(YAMLMap)
      .getStringKey();
    if (taskListKey && tasksKey.test(taskListKey)) {
      return true;
    }
  }
  return false;
}

export function getDeclaredCollections(modulePath: Node[] | null): string[] {
  const declaredCollections: string[] = [];
  const taskParamsNode = new AncestryBuilder(modulePath).parent(YAMLMap).get();
  declaredCollections.push(...getDeclaredCollectionsForMap(taskParamsNode));

  let path: Node[] | null = new AncestryBuilder(modulePath)
    .parent(YAMLMap)
    .getPath();
  let traversing = true;
  while (traversing) {
    const builder = new AncestryBuilder(path).parent(YAMLSeq).parent(YAMLMap);
    const key = builder.getStringKey();
    if (key && /^block|rescue|always$/.test(key)) {
      declaredCollections.push(...getDeclaredCollectionsForMap(builder.get()));
      path = builder.getPath();
    } else {
      traversing = false;
    }
  }
  const playParamsNode = new AncestryBuilder(path)
    .parent(YAMLSeq)
    .parent(YAMLMap)
    .get();
  declaredCollections.push(...getDeclaredCollectionsForMap(playParamsNode));

  return [...new Set(declaredCollections)];
}

function getDeclaredCollectionsForMap(playNode: YAMLMap | null): string[] {
  const declaredCollections: string[] = [];
  const collectionsPair = _.find(
    playNode?.items,
    (pair: Pair) => isScalar(pair.key) && pair.key.value === "collections",
  );
  if (collectionsPair) {
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

export function isBlockParam(path: Node[]): boolean {
  const builder = new AncestryBuilder(path).parentOfKey();
  const mapNode = builder.get();
  const isInYAMLSeq = !!builder.parent(YAMLSeq).get();
  if (mapNode && isInYAMLSeq) {
    const providedKeys = getYamlMapKeys(mapNode);
    return providedKeys.includes("block");
  }
  return false;
}

export function isRoleParam(path: Node[]): boolean {
  const rolesKey = new AncestryBuilder(path)
    .parentOfKey()
    .parent(YAMLSeq)
    .parent(YAMLMap)
    .getStringKey();
  return rolesKey === "roles";
}

/**
 * Resolves a module name to its FQCN and plugin data using CollectionsService.
 * Uses a simple heuristic: if the name looks like a FQCN (has 2+ dots), look up
 * directly; otherwise try ansible.builtin.<name>.
 */
export async function findProvidedModule(
  taskParamPath: Node[],
  document: TextDocument,
  collectionsService: CollectionsService,
): Promise<PluginData | null> {
  const taskParameterMap = new AncestryBuilder(taskParamPath)
    .parent(YAMLMap)
    .get();
  if (!taskParameterMap) return null;

  const providedParameters = new Set(getYamlMapKeys(taskParameterMap));
  const providedModuleNames = [...providedParameters].filter(
    (x) => !x || !isTaskKeyword(x),
  );

  for (const name of providedModuleNames) {
    const data = await resolveModuleName(name, collectionsService);
    if (data) return data;
  }
  return null;
}

async function resolveModuleName(
  name: string,
  collectionsService: CollectionsService,
): Promise<PluginData | null> {
  const dotCount = (name.match(/\./g) || []).length;
  if (dotCount >= 2) {
    return collectionsService.getPluginDocumentation(name, "module");
  }
  return collectionsService.getPluginDocumentation(
    `ansible.builtin.${name}`,
    "module",
  );
}

/**
 * Returns possible options/suboptions at the current path level.
 */
export async function getPossibleOptionsForPath(
  path: Node[],
  document: TextDocument,
  collectionsService: CollectionsService,
): Promise<Record<string, PluginOption> | null> {
  const [taskParamPath, suboptionTrace] = getTaskParamPathWithTrace(path);
  if (!taskParamPath) return null;

  const optionTraceElement = suboptionTrace.pop();
  if (!optionTraceElement || optionTraceElement[1] !== "dict") {
    return null;
  }

  const taskParamNode = taskParamPath[taskParamPath.length - 1];
  if (!isScalar(taskParamNode)) return null;

  let pluginData: PluginData | null = null;
  if (taskParamNode.value === "args") {
    pluginData = await findProvidedModule(
      taskParamPath,
      document,
      collectionsService,
    );
  } else {
    pluginData = await resolveModuleName(
      taskParamNode.value as string,
      collectionsService,
    );
  }

  if (!pluginData?.doc?.options) return null;

  let options = pluginData.doc.options;
  suboptionTrace.reverse();
  for (const [optionName, optionType] of suboptionTrace) {
    const option = options[optionName];
    if (optionName && option?.type === optionType && option.suboptions) {
      options = option.suboptions;
    } else {
      return null;
    }
  }

  return options;
}

function getTaskParamPathWithTrace(
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
    return [[], []];
  }
  return [path, trace];
}

export function getYamlMapKeys(mapNode: YAMLMap): string[] {
  return mapNode.items
    .map((pair) => {
      if (pair.key && isScalar(pair.key)) {
        return String(pair.key.value);
      }
      return undefined;
    })
    .filter((e): e is string => !!e);
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

export function parseAllDocuments(str: string, options?: Options): Document[] {
  if (!str) {
    return [];
  }
  return [parseDocument(str, { keepSourceTokens: true, ...options })];
}

export function isPlaybook(textDocument: TextDocument): boolean {
  if (textDocument.getText().trim().length === 0) {
    return false;
  }

  const yamlDocs = parseAllDocuments(textDocument.getText());
  const path = getPathAt(textDocument, { line: 1, character: 1 }, yamlDocs);

  if (!path || !isSeq(path[0])) {
    return false;
  }

  const playbookKeysSet = new Set<string>();
  const playbookJSON = path[0].toJSON() as unknown[];
  for (const item of playbookJSON) {
    if (item && typeof item === "object") {
      for (const key of Object.keys(item)) {
        playbookKeysSet.add(key);
      }
    }
  }

  const playKeywordsList = [...playKeywords.keys()];
  const taskKeywordsList = [...taskKeywords.keys()];
  const filteredList = playKeywordsList.filter(
    (value) => !taskKeywordsList.includes(value),
  );

  return [...playbookKeysSet].some((r) => filteredList.includes(r));
}

export function isCursorInsideJinjaBrackets(
  document: TextDocument,
  position: Position,
  path: Node[],
): boolean {
  const node = path[path.length - 1];
  let nodeObject: string | string[];

  try {
    nodeObject = node.toJSON();
  } catch {
    return false;
  }

  if (nodeObject && !nodeObject.includes("{{")) {
    return false;
  }

  const lineText = document.getText(
    Range.create(position.line, 0, position.line, position.character),
  );

  const jinjaStart = lineText.lastIndexOf("{{");
  if (jinjaStart === -1) {
    return false;
  }

  const fullLineLen = document.getText(
    Range.create(position.line, 0, position.line + 1, 0),
  ).length;
  const lineAfterCursor = document.getText(
    Range.create(position, Position.create(position.line, fullLineLen)),
  );

  let jinjaEnd = lineAfterCursor.indexOf("}}");
  if (jinjaEnd === -1) {
    return false;
  }

  const nestedOpen = lineAfterCursor.indexOf("{{");
  if (nestedOpen !== -1 && nestedOpen < jinjaEnd) {
    jinjaEnd = -1;
  }

  return jinjaEnd > -1 && position.character > jinjaStart;
}
