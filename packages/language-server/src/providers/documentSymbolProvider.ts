import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { type Node, type Pair, isMap, isScalar, isSeq, parseAllDocuments, YAMLMap } from 'yaml';
import { isTaskKeyword, playExclusiveKeywords } from '../utils/ansible';
import { toLspRange } from '../utils/misc';
import { getOrigRange } from '../utils/yaml';

/** Play-level keys whose values are task lists, in display order. */
const PLAY_TASK_SECTIONS = ['pre_tasks', 'roles', 'tasks', 'post_tasks', 'handlers'] as const;

/** Block-level keys whose values are task lists. */
const BLOCK_SECTIONS = ['block', 'rescue', 'always'] as const;

/** Keys that mark a top-level sequence item as a playbook import. */
const PLAYBOOK_IMPORT_KEYS = ['import_playbook', 'ansible.builtin.import_playbook'];

/**
 * Builds a hierarchical outline of plays, task sections, blocks, tasks,
 * and roles for an Ansible YAML document.
 *
 * Playbooks yield one symbol per play. Task files (for example
 * `roles/x/tasks/main.yml`) yield one symbol per task. Documents whose
 * root is not a sequence of maps produce no symbols. Every YAML document
 * in a multi-document stream is outlined.
 *
 * @param document - Text document to outline.
 * @returns Document symbols, or an empty array when nothing is recognized.
 */
export function doDocumentSymbols(document: TextDocument): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];
    // Unlike the shared single-document helper, outline every `---` document.
    for (const yamlDoc of parseAllDocuments(document.getText(), { keepSourceTokens: true })) {
        const root = yamlDoc.contents;
        if (!isSeq(root)) {
            continue;
        }
        root.items.forEach((item, index) => {
            if (!isMap(item)) {
                return;
            }
            const symbol = isPlayMap(item)
                ? playSymbol(item, index, document)
                : taskSymbol(item, index, document);
            if (symbol) {
                symbols.push(symbol);
            }
        });
    }
    return symbols;
}

/**
 * Tests whether a top-level map is a play or a playbook import.
 *
 * @param map - Top-level sequence item.
 * @returns True when the map holds a play-exclusive key or an import.
 */
function isPlayMap(map: YAMLMap): boolean {
    return map.items.some((pair) => {
        const key = scalarKey(pair);
        return !!key && (playExclusiveKeywords.has(key) || PLAYBOOK_IMPORT_KEYS.includes(key));
    });
}

/**
 * Creates the symbol for a play, with its task sections as children.
 *
 * @param map - Play map node.
 * @param index - Position of the play in the playbook.
 * @param document - Source document for range conversion.
 * @returns The play symbol, or undefined when the node has no range.
 */
function playSymbol(
    map: YAMLMap,
    index: number,
    document: TextDocument,
): DocumentSymbol | undefined {
    const importPair = map.items.find((pair) =>
        PLAYBOOK_IMPORT_KEYS.includes(scalarKey(pair) ?? ''),
    );
    if (importPair) {
        const target = scalarValue(importPair.value);
        return createSymbol(
            stringValue(map, 'name') ?? `import_playbook: ${target ?? '?'}`,
            SymbolKind.File,
            map,
            importPair.key as Node,
            document,
            target,
        );
    }

    const hosts = scalarValue(findPair(map, 'hosts')?.value);
    const nameNode = findPair(map, 'name')?.value as Node | undefined;
    const name =
        stringValue(map, 'name') ?? (hosts ? `Play: ${hosts}` : `Play ${String(index + 1)}`);
    const symbol = createSymbol(
        name,
        SymbolKind.Module,
        map,
        nameNode ?? (findPair(map, 'hosts')?.key as Node | undefined),
        document,
        hosts ? `hosts: ${hosts}` : undefined,
    );
    if (!symbol) {
        return undefined;
    }

    for (const section of PLAY_TASK_SECTIONS) {
        const pair = findPair(map, section);
        const child = pair ? sectionSymbol(pair, section, document) : undefined;
        if (child) {
            symbol.children?.push(child);
        }
    }
    return symbol;
}

/**
 * Creates a container symbol for a task-list key such as `tasks` or `rescue`.
 *
 * @param pair - Key/value pair whose value is the task or role list.
 * @param key - Section key name.
 * @param document - Source document for range conversion.
 * @returns The section symbol, or undefined when the value is not a list.
 */
function sectionSymbol(
    pair: Pair,
    key: string,
    document: TextDocument,
): DocumentSymbol | undefined {
    const keyNode = pair.key as Node;
    const value = pair.value;
    if (!isSeq(value)) {
        return undefined;
    }
    const start = getOrigRange(keyNode)?.[0];
    const end = getOrigRange(value)?.[1];
    const selection = getOrigRange(keyNode);
    if (start === undefined || end === undefined || !selection) {
        return undefined;
    }

    const children: DocumentSymbol[] = [];
    value.items.forEach((item, index) => {
        let symbol: DocumentSymbol | undefined;
        if (key === 'roles') {
            symbol = roleSymbol(item as Node, index, document);
        } else if (isMap(item)) {
            symbol = taskSymbol(item, index, document);
        }
        if (symbol) {
            children.push(symbol);
        }
    });

    return {
        name: key,
        kind: SymbolKind.Array,
        range: toLspRange([start, end], document),
        selectionRange: toLspRange(selection, document),
        children,
    };
}

/**
 * Creates the symbol for one task, recursing into block sections.
 *
 * @param map - Task map node.
 * @param index - Position of the task in its list.
 * @param document - Source document for range conversion.
 * @returns The task or block symbol, or undefined when the node has no range.
 */
function taskSymbol(
    map: YAMLMap,
    index: number,
    document: TextDocument,
): DocumentSymbol | undefined {
    const isBlock = !!findPair(map, 'block');
    const modulePair = isBlock
        ? undefined
        : map.items.find((pair) => {
              const key = scalarKey(pair);
              return !!key && !isTaskKeyword(key);
          });
    const moduleName = modulePair ? scalarKey(modulePair) : undefined;
    const nameNode = findPair(map, 'name')?.value as Node | undefined;
    const fallback = isBlock
        ? `Block ${String(index + 1)}`
        : (moduleName ?? `Task ${String(index + 1)}`);

    const symbol = createSymbol(
        stringValue(map, 'name') ?? fallback,
        isBlock ? SymbolKind.Namespace : SymbolKind.Function,
        map,
        nameNode ?? (modulePair?.key as Node | undefined),
        document,
        stringValue(map, 'name') ? moduleName : undefined,
    );
    if (!symbol || !isBlock) {
        return symbol;
    }

    for (const section of BLOCK_SECTIONS) {
        const pair = findPair(map, section);
        const child = pair ? sectionSymbol(pair, section, document) : undefined;
        if (child) {
            symbol.children?.push(child);
        }
    }
    return symbol;
}

/**
 * Creates the symbol for a `roles:` entry given as a string or a map.
 *
 * @param node - Role list item.
 * @param index - Position of the role in its list.
 * @param document - Source document for range conversion.
 * @returns The role symbol, or undefined for unsupported entries.
 */
function roleSymbol(node: Node, index: number, document: TextDocument): DocumentSymbol | undefined {
    if (isScalar(node)) {
        const name = scalarValue(node);
        return name ? createSymbol(name, SymbolKind.Package, node, node, document) : undefined;
    }
    if (isMap(node)) {
        const rolePair = findPair(node, 'role') ?? findPair(node, 'name');
        const name = scalarValue(rolePair?.value) ?? `Role ${String(index + 1)}`;
        return createSymbol(name, SymbolKind.Package, node, rolePair?.value as Node, document);
    }
    return undefined;
}

/**
 * Assembles a DocumentSymbol whose selection range lies inside its range.
 *
 * @param name - Non-empty symbol name.
 * @param kind - Symbol kind.
 * @param node - Node spanning the whole symbol.
 * @param selectionNode - Node to select when navigating, defaults to `node`.
 * @param document - Source document for range conversion.
 * @param detail - Optional secondary text.
 * @returns The symbol, or undefined when `node` has no source range.
 */
function createSymbol(
    name: string,
    kind: SymbolKind,
    node: Node,
    selectionNode: Node | undefined,
    document: TextDocument,
    detail?: string,
): DocumentSymbol | undefined {
    const range = getOrigRange(node);
    if (!range) {
        return undefined;
    }
    const selected = getOrigRange(selectionNode);
    const selection =
        selected && selected[0] >= range[0] && selected[1] <= range[1] ? selected : range;
    return {
        name,
        detail,
        kind,
        range: toLspRange(range, document),
        selectionRange: toLspRange(selection, document),
        children: [],
    };
}

/**
 * Finds a pair in a map by its scalar key.
 *
 * @param map - Map to search.
 * @param key - Key to match.
 * @returns The matching pair, if any.
 */
function findPair(map: YAMLMap, key: string): Pair | undefined {
    return map.items.find((pair) => scalarKey(pair) === key);
}

/**
 * Reads a pair's key as a string when it is a scalar.
 *
 * @param pair - Pair to read.
 * @returns The key text, or undefined for complex keys.
 */
function scalarKey(pair: Pair): string | undefined {
    return isScalar(pair.key) ? String(pair.key.value) : undefined;
}

/**
 * Reads a scalar node as trimmed, non-empty text.
 *
 * @param node - Candidate scalar node.
 * @returns The text, or undefined for non-scalars, null, or blank values.
 */
function scalarValue(node: unknown): string | undefined {
    if (!isScalar(node)) {
        return undefined;
    }
    const { value } = node;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return undefined;
    }
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
}

/**
 * Reads a map entry as trimmed, non-empty text.
 *
 * @param map - Map to read from.
 * @param key - Entry key.
 * @returns The text, or undefined when absent or blank.
 */
function stringValue(map: YAMLMap, key: string): string | undefined {
    return scalarValue(findPair(map, key)?.value);
}
