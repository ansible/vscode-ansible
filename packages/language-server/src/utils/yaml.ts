import _ from 'lodash';
import { TextDocument } from 'vscode-languageserver-textdocument';
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
} from 'yaml';
import { isTaskKeyword, playExclusiveKeywords, playKeywords, taskKeywords } from './ansible';
import { Range, Position } from 'vscode-languageserver';
import type {
    CollectionsService,
    PluginData,
    PluginOption,
} from '@ansible/core/out/services/CollectionsService';

type Options = ParseOptions & DocumentOptions & SchemaOptions;

/**
 * Walks a YAML node path upward to inspect parents, keys, and values.
 */
export class AncestryBuilder<N extends Node | Pair = Node> {
    private _path: Node[];
    private _index: number;

    /**
     * Positions the builder at the end of a YAML node path.
     *
     * @param path - Ancestry path from the document root, or null for empty.
     * @param index - Optional starting index within the path.
     */
    constructor(path: Node[] | null, index?: number) {
        this._path = path ?? [];
        this._index = index ?? this._path.length - 1;
    }

    /**
     * Moves to the parent node, optionally requiring a specific node type.
     *
     * @param type - Expected parent constructor; invalid parents invalidate the path.
     * @returns This builder narrowed to the parent node type.
     */
    parent<X extends Node | Pair>(type?: new (...args: Schema[]) => X): AncestryBuilder<X> {
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
     * Moves from a key or value to the containing YAML map.
     *
     * @returns Builder positioned on the parent map of the current key.
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
     * Returns the node at the current path index.
     *
     * @returns Current node, or null when the index is out of range.
     */
    get(): N | null {
        if (this._index < 0 || this._index >= this._path.length) {
            return null;
        }
        return this._path[this._index] as N;
    }

    /**
     * Reads the string key of the pair immediately after a map node.
     *
     * @returns Key string when the child pair has a scalar key.
     */
    getStringKey(this: AncestryBuilder<YAMLMap>): string | null {
        const node = this._path[this._index + 1];
        if (isPair(node) && isScalar(node.key) && typeof node.key.value === 'string') {
            return node.key.value;
        }
        return null;
    }

    /**
     * Reads the value node of the pair immediately after a map node.
     *
     * @returns Value node when the child is a YAML pair.
     */
    getValue(this: AncestryBuilder<YAMLMap>): Node | null {
        const node = this._path[this._index + 1];
        if (isPair(node)) {
            return node.value as Node;
        }
        return null;
    }

    /**
     * Returns the ancestry path truncated at the current index.
     *
     * @returns Path prefix, or null when the index is invalid.
     */
    getPath(): Node[] | null {
        if (this._index < 0) return null;
        return this._path.slice(0, this._index + 1);
    }

    /**
     * Extends the current path through the child pair and its key node.
     *
     * @returns Path ending at the key scalar, or null when no child pair exists.
     */
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

/**
 * Resolves the YAML node path at a document position across parsed documents.
 *
 * @param document - Text document containing the position.
 * @param position - Cursor position to resolve.
 * @param docs - Parsed YAML documents to search.
 * @param inclusive - When true, positions at range end match the node.
 * @returns Node ancestry path at the position, or null when not found.
 */
export function getPathAt(
    document: TextDocument,
    position: Position,
    docs: Document[],
    inclusive = false,
): Node[] | null {
    const offset = document.offsetAt(position);
    const doc = _.find(docs, (d: Document) => contains(d.contents, offset, inclusive));
    if (doc?.contents) {
        return getPathAtOffset([doc.contents], offset, inclusive, doc);
    }
    return null;
}

/**
 * Tests whether a byte offset lies within a node's source range.
 *
 * @param node - YAML node whose range is tested.
 * @param offset - Byte offset in the document text.
 * @param inclusive - When true, offsets equal to the range end match.
 * @returns True when the offset falls inside the node range.
 */
function contains(node: Node | null, offset: number, inclusive: boolean): boolean {
    const range = getOrigRange(node);
    return !!(
        range &&
        range[0] <= offset &&
        (range[1] > offset || (inclusive && range[1] >= offset))
    );
}

/**
 * Recursively descends a YAML tree to find the deepest node at an offset.
 *
 * @param path - Current ancestry path while descending.
 * @param offset - Byte offset in the document text.
 * @param inclusive - When true, offsets at range end match child nodes.
 * @param doc - YAML document used to synthesize placeholder nodes.
 * @returns Deepest matching node path, including synthetic gap nodes.
 */
function getPathAtOffset(
    path: Node[],
    offset: number,
    inclusive: boolean,
    doc: Document,
): Node[] | null {
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
        pair = _.find(currentNode.items, (p: Pair) => contains(p.value as Node, offset, inclusive));
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
            return getPathAtOffset(path.concat(item as Node), offset, inclusive, doc);
        }
    } else if (contains(currentNode, offset, inclusive)) {
        return path;
    }
    return path.concat(doc.createNode(null));
}

const tasksKey = /^(tasks|pre_tasks|post_tasks|block|rescue|always|handlers)$/;

/**
 * Determines whether a YAML path refers to a task parameter map.
 *
 * @param path - YAML node ancestry path to test.
 * @returns True when the path is inside a tasks, handlers, or block list item.
 */
export function isTaskParam(path: Node[]): boolean {
    const taskListPath = new AncestryBuilder(path).parentOfKey().parent(YAMLSeq).getPath();
    if (taskListPath) {
        if (isPlayParam(path) || isBlockParam(path) || isRoleParam(path)) {
            return false;
        }
        if (taskListPath.length === 1) {
            return true;
        }
        const taskListKey = new AncestryBuilder(taskListPath).parent(YAMLMap).getStringKey();
        if (taskListKey && tasksKey.test(taskListKey)) {
            return true;
        }
    }
    return false;
}

/**
 * Collects collection names declared on enclosing plays, blocks, and tasks.
 *
 * @param modulePath - YAML path at a module or task parameter.
 * @returns Deduplicated collection names from collections keys in scope.
 */
export function getDeclaredCollections(modulePath: Node[] | null): string[] {
    const declaredCollections: string[] = [];
    const taskParamsNode = new AncestryBuilder(modulePath).parent(YAMLMap).get();
    declaredCollections.push(...getDeclaredCollectionsForMap(taskParamsNode));

    let path: Node[] | null = new AncestryBuilder(modulePath).parent(YAMLMap).getPath();
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
    const playParamsNode = new AncestryBuilder(path).parent(YAMLSeq).parent(YAMLMap).get();
    declaredCollections.push(...getDeclaredCollectionsForMap(playParamsNode));

    return [...new Set(declaredCollections)];
}

/**
 * Extracts collection names from a collections sequence on a YAML map.
 *
 * @param playNode - YAML map that may contain a collections key.
 * @returns Collection names declared on the map.
 */
function getDeclaredCollectionsForMap(playNode: YAMLMap | null): string[] {
    const declaredCollections: string[] = [];
    const collectionsPair = _.find(
        playNode?.items,
        (pair: Pair) => isScalar(pair.key) && pair.key.value === 'collections',
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

/**
 * Determines whether a YAML path refers to a play-level parameter map.
 *
 * @param path - YAML node ancestry path to test.
 * @param fileUri - Optional document URI used to exclude role task files.
 * @returns True for play maps, false for non-play contexts, or undefined when ambiguous.
 */
export function isPlayParam(path: Node[], fileUri?: string): boolean | undefined {
    const isAtRoot =
        new AncestryBuilder(path).parentOfKey().parent(YAMLSeq).getPath()?.length === 1;
    if (isAtRoot) {
        const mapNode = new AncestryBuilder(path).parentOfKey().get();
        if (!mapNode) {
            return undefined;
        }
        const providedKeys = getYamlMapKeys(mapNode);
        const containsPlayKeyword = providedKeys.some((p) => playExclusiveKeywords.has(p));
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
 * Determines whether a YAML path refers to a block/rescue/always parameter map.
 *
 * @param path - YAML node ancestry path to test.
 * @returns True when the map contains a block key inside a sequence.
 */
export function isBlockParam(path: Node[]): boolean {
    const builder = new AncestryBuilder(path).parentOfKey();
    const mapNode = builder.get();
    const isInYAMLSeq = !!builder.parent(YAMLSeq).get();
    if (mapNode && isInYAMLSeq) {
        const providedKeys = getYamlMapKeys(mapNode);
        return providedKeys.includes('block');
    }
    return false;
}

/**
 * Determines whether a YAML path refers to an entry in a roles list.
 *
 * @param path - YAML node ancestry path to test.
 * @returns True when the enclosing sequence belongs to a roles key.
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
 * Resolves a module name to its FQCN and plugin data using CollectionsService.
 * Uses a simple heuristic: if the name looks like a FQCN (has 2+ dots), look up
 * directly; otherwise try ansible.builtin.<name>.
 *
 * @param taskParamPath - YAML path inside a task parameter map.
 * @param document - Text document containing the task.
 * @param collectionsService - Source of cached plugin documentation.
 * @returns Plugin data for the first resolvable module in the map, or null.
 */
export async function findProvidedModule(
    taskParamPath: Node[],
    document: TextDocument,
    collectionsService: CollectionsService,
): Promise<PluginData | null> {
    const taskParameterMap = new AncestryBuilder(taskParamPath).parent(YAMLMap).get();
    if (!taskParameterMap) return null;

    const providedParameters = new Set(getYamlMapKeys(taskParameterMap));
    const providedModuleNames = [...providedParameters].filter((x) => !x || !isTaskKeyword(x));

    for (const name of providedModuleNames) {
        const data = await resolveModuleName(name, collectionsService);
        if (data) return data;
    }
    return null;
}

/**
 * Looks up plugin documentation for a module name, inferring ansible.builtin when needed.
 *
 * @param name - Module name from the task YAML.
 * @param collectionsService - Source of cached plugin documentation.
 * @returns Plugin data when the module exists, or null.
 */
async function resolveModuleName(
    name: string,
    collectionsService: CollectionsService,
): Promise<PluginData | null> {
    const dotCount = (name.match(/\./g) ?? []).length;
    if (dotCount >= 2) {
        return collectionsService.getPluginDocumentation(name, 'module');
    }
    return collectionsService.getPluginDocumentation(`ansible.builtin.${name}`, 'module');
}

/**
 * Returns possible options/suboptions at the current path level.
 *
 * @param path - YAML node ancestry path at the cursor.
 * @param document - Text document containing the task.
 * @param collectionsService - Source of cached plugin documentation.
 * @returns Option map for the current dict level, or null when not applicable.
 */
export async function getPossibleOptionsForPath(
    path: Node[],
    document: TextDocument,
    collectionsService: CollectionsService,
): Promise<Record<string, PluginOption> | null> {
    const [taskParamPath, suboptionTrace] = getTaskParamPathWithTrace(path);
    if (taskParamPath.length === 0) return null;

    const optionTraceElement = suboptionTrace.pop();
    if (optionTraceElement?.[1] !== 'dict') {
        return null;
    }

    const taskParamNode = taskParamPath[taskParamPath.length - 1];
    if (!isScalar(taskParamNode)) return null;

    const pluginData =
        taskParamNode.value === 'args'
            ? await findProvidedModule(taskParamPath, document, collectionsService)
            : await resolveModuleName(taskParamNode.value as string, collectionsService);

    if (!pluginData?.doc?.options) return null;

    let options = pluginData.doc.options;
    suboptionTrace.reverse();
    for (const [optionName, optionType] of suboptionTrace) {
        const option = options[optionName];
        if (option.type === optionType && option.suboptions) {
            options = option.suboptions;
        } else {
            return null;
        }
    }

    return options;
}

/**
 * Walks upward from a nested option path to the enclosing task and records dict/list steps.
 *
 * @param path - YAML node ancestry path starting inside a task option.
 * @returns Task parameter path and reversed trace of parent option types.
 */
function getTaskParamPathWithTrace(path: Node[]): [Node[], [string, 'list' | 'dict'][]] {
    const trace: [string, 'list' | 'dict'][] = [];
    while (!isTaskParam(path)) {
        let parentKeyPath = new AncestryBuilder(path).parentOfKey().parent(YAMLMap).getKeyPath();
        if (parentKeyPath) {
            const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
            if (isScalar(parentKeyNode) && typeof parentKeyNode.value === 'string') {
                trace.push([parentKeyNode.value, 'dict']);
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
            if (isScalar(parentKeyNode) && typeof parentKeyNode.value === 'string') {
                trace.push([parentKeyNode.value, 'list']);
                path = parentKeyPath;
                continue;
            }
        }
        return [[], []];
    }
    return [path, trace];
}

/**
 * Collects string keys from all pairs in a YAML map.
 *
 * @param mapNode - YAML map whose keys are extracted.
 * @returns Scalar key values as strings.
 */
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

/**
 * Returns the source byte range for a YAML node when available.
 *
 * @param node - YAML node whose range is read.
 * @returns Start and end byte offsets, or undefined when absent.
 */
export function getOrigRange(node: Node | null | undefined): [number, number] | undefined {
    if (node?.range) {
        return [node.range[0], node.range[1]];
    }
    return undefined;
}

/**
 * Parses YAML text into documents, preserving source tokens for range mapping.
 *
 * @param str - Raw YAML text to parse.
 * @param options - Optional parse, document, and schema options.
 * @returns Parsed documents, or an empty array for blank input.
 */
export function parseAllDocuments(str: string, options?: Options): Document[] {
    if (!str) {
        return [];
    }
    return [parseDocument(str, { keepSourceTokens: true, ...options })];
}

/**
 * Heuristically detects whether a document is an Ansible playbook.
 *
 * @param textDocument - Text document whose root structure is inspected.
 * @returns True when the document root is a sequence with play-level keys.
 */
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
    const playbookJSON = path[0].toJSON();
    for (const item of playbookJSON) {
        if (item && typeof item === 'object') {
            for (const key of Object.keys(item)) {
                playbookKeysSet.add(key);
            }
        }
    }

    const playKeywordsList = [...playKeywords.keys()];
    const taskKeywordsList = [...taskKeywords.keys()];
    const filteredList = playKeywordsList.filter((value) => !taskKeywordsList.includes(value));

    return [...playbookKeysSet].some((r) => filteredList.includes(r));
}

/**
 * Tests whether the cursor sits inside an unclosed `{{ }}` Jinja expression.
 *
 * @param document - Text document containing the cursor.
 * @param position - Cursor position to test.
 * @param path - YAML node path at the cursor.
 * @returns True when the cursor is between opening and closing Jinja delimiters.
 */
export function isCursorInsideJinjaBrackets(
    document: TextDocument,
    position: Position,
    path: Node[],
): boolean {
    const node = path[path.length - 1];
    let nodeObject: string | string[];

    try {
        nodeObject = node.toJSON() as string | string[];
    } catch {
        return false;
    }

    if (nodeObject && !nodeObject.includes('{{')) {
        return false;
    }

    const lineText = document.getText(
        Range.create(position.line, 0, position.line, position.character),
    );

    const jinjaStart = lineText.lastIndexOf('{{');
    if (jinjaStart === -1) {
        return false;
    }

    const fullLineLen = document.getText(
        Range.create(position.line, 0, position.line + 1, 0),
    ).length;
    const lineAfterCursor = document.getText(
        Range.create(position, Position.create(position.line, fullLineLen)),
    );

    let jinjaEnd = lineAfterCursor.indexOf('}}');
    if (jinjaEnd === -1) {
        return false;
    }

    const nestedOpen = lineAfterCursor.indexOf('{{');
    if (nestedOpen !== -1 && nestedOpen < jinjaEnd) {
        jinjaEnd = -1;
    }

    return jinjaEnd > -1 && position.character > jinjaStart;
}
