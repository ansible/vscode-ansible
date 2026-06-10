import { EOL } from 'os';
import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
    MarkupContent,
    Range,
    TextEdit,
} from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { isNode, isScalar, Node, YAMLMap } from 'yaml';
import type { WorkspaceFolderContext } from '../services/workspaceManager';
import {
    blockKeywords,
    playKeywords,
    playWithoutTaskKeywords,
    roleKeywords,
    taskKeywords,
} from '../utils/ansible';
import { formatModule, formatOption, getDetails } from '../utils/docsFormatter';
import { insert, toLspRange } from '../utils/misc';
import {
    AncestryBuilder,
    findProvidedModule,
    getPathAt,
    getOrigRange,
    getYamlMapKeys,
    isBlockParam,
    isPlayParam,
    isRoleParam,
    isTaskParam,
    parseAllDocuments,
    getPossibleOptionsForPath,
    isCursorInsideJinjaBrackets,
    isPlaybook,
} from '../utils/yaml';
import { getVarsCompletion } from './completionProviderUtils';
import type { HostType } from '../services/ansibleInventory';
import { CollectionsService } from '@ansible/core/out/services/CollectionsService';

interface CompletionItemData {
    documentUri: string;
    moduleFqcn?: string;
    type?: string;
    range?: Range;
    atEndOfLine?: boolean;
    firstElementOfList?: boolean;
}

const priorityMap = {
    nameKeyword: 1,
    moduleName: 2,
    keyword: 4,
    requiredOption: 1,
    option: 2,
    aliasOption: 3,
    defaultChoice: 1,
    choice: 2,
} as const;

let dummyMappingCharacter: string;
let isAnsiblePlaybook: boolean;

/**
 * Provides Ansible-aware completion items for the cursor position in a document.
 *
 * @param document - Text document being completed.
 * @param position - Cursor position in the document.
 * @param context - Workspace folder context for settings and inventory.
 * @returns Completion items for keywords, modules, options, hosts, or variables.
 */
export async function doCompletion(
    document: TextDocument,
    position: Position,
    context: WorkspaceFolderContext,
): Promise<CompletionItem[]> {
    isAnsiblePlaybook = isPlaybook(document);

    let preparedText = document.getText();
    const offset = document.offsetAt(position);

    dummyMappingCharacter = '_:';
    const previousChars = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: position.character },
    });
    if (previousChars.includes(': ')) {
        dummyMappingCharacter = '__';
    }

    preparedText = insert(preparedText, offset, dummyMappingCharacter);
    const yamlDocs = parseAllDocuments(preparedText);

    const extensionSettings = await context.documentSettings.get(document.uri);
    const useFqcn = extensionSettings.ansible.useFullyQualifiedCollectionNames;

    const path = getPathAt(document, position, yamlDocs, true);
    if (!path) return [];

    const node = path[path.length - 1];

    const collectionsService = CollectionsService.getInstance();

    const isPlay = isPlayParam(path);
    if (isPlay) {
        return getKeywordCompletion(document, position, path, playKeywords);
    }
    if (isBlockParam(path)) {
        return getKeywordCompletion(document, position, path, blockKeywords);
    }
    if (isRoleParam(path)) {
        return getKeywordCompletion(document, position, path, roleKeywords);
    }

    if (isTaskParam(path)) {
        const completionItems = getKeywordCompletion(document, position, path, taskKeywords);

        if (isPlay === undefined) {
            completionItems.push(
                ...getKeywordCompletion(document, position, path, playWithoutTaskKeywords),
            );
        }

        const module = await findProvidedModule(path, document, collectionsService);
        if (!module) {
            completionItems.push(
                ...getKeywordCompletion(
                    document,
                    position,
                    path,
                    new Map([['block', blockKeywords.get('block') as string]]),
                ),
            );

            const cursorAtEnd = atEndOfLine(document, position);
            const nodeRange = getNodeRange(node, document);
            const cursorAtFirst = firstElementOfList(document, nodeRange);

            let textEdit: TextEdit | undefined;
            if (nodeRange) {
                textEdit = { range: nodeRange, newText: '' };
            }

            const moduleCompletionItems = getModuleCompletions(
                collectionsService,
                useFqcn,
                cursorAtEnd,
                cursorAtFirst,
                textEdit,
                document.uri,
            );
            completionItems.push(...moduleCompletionItems);
        }
        return completionItems;
    }

    if (isAnsiblePlaybook && isCursorInsideJinjaBrackets(document, position, path)) {
        return getVarsCompletion(document.uri, path);
    }

    const options = await getPossibleOptionsForPath(path, document, collectionsService);

    if (options) {
        const optionMap = new AncestryBuilder(path).parentOfKey().get();
        if (!optionMap) {
            return [];
        }
        const providedOptions = new Set(getYamlMapKeys(optionMap));
        const nodeRange = getNodeRange(node, document);
        const cursorAtFirst = firstElementOfList(document, nodeRange);
        const cursorAtEnd = atEndOfLine(document, position);

        return Object.entries(options)
            .filter(([name]) => !providedOptions.has(name))
            .map(([name, specs], index) => {
                const details = getDetails(specs);
                const priority = specs.required ? priorityMap.requiredOption : priorityMap.option;

                const completionItem: CompletionItem = {
                    label: name,
                    detail: details,
                    sortText: priority.toString() + index.toString().padStart(3),
                    kind: CompletionItemKind.Property,
                    documentation: formatOption(specs, name),
                    data: {
                        documentUri: document.uri,
                        type: specs.type,
                        range: nodeRange,
                        atEndOfLine: cursorAtEnd,
                        firstElementOfList: cursorAtFirst,
                    },
                };

                const insertText = cursorAtEnd ? `${name}:` : name;
                if (nodeRange) {
                    completionItem.textEdit = { range: nodeRange, newText: insertText };
                } else {
                    completionItem.insertText = insertText;
                }
                return completionItem;
            });
    }

    let keyPath: Node[] | null;
    if (new AncestryBuilder(path).parent(YAMLMap).getValue() === null) {
        keyPath = new AncestryBuilder(path).parent(YAMLMap).parent(YAMLMap).getKeyPath();
    } else {
        keyPath = new AncestryBuilder(path).parent(YAMLMap).getKeyPath();
    }

    if (keyPath) {
        const keyNode = keyPath[keyPath.length - 1];
        const keyOptions = await getPossibleOptionsForPath(keyPath, document, collectionsService);
        if (keyOptions && isScalar(keyNode)) {
            const nodeRange = getNodeRange(node, document);
            const option = keyOptions[keyNode.value as string];

            const choices: unknown[] = [];
            let defaultChoice = option.default;
            if (option.type === 'bool' && typeof option.default === 'string') {
                defaultChoice = option.default.toLowerCase() === 'yes' ? true : false;
            }
            if (option.choices) {
                choices.push(...option.choices);
            } else if (option.type === 'bool') {
                choices.push(true, false);
            } else if (defaultChoice !== undefined) {
                choices.push(defaultChoice);
            }

            return choices.map((choice, index) => {
                const priority =
                    choice === defaultChoice ? priorityMap.defaultChoice : priorityMap.choice;
                const insertValue = String(choice);
                const completionItem: CompletionItem = {
                    label: insertValue,
                    detail: choice === defaultChoice ? 'default' : undefined,
                    sortText: priority.toString() + index.toString().padStart(3),
                    kind: CompletionItemKind.Value,
                };
                if (nodeRange) {
                    completionItem.textEdit = {
                        range: nodeRange,
                        newText: insertValue,
                    };
                } else {
                    completionItem.insertText = insertValue;
                }
                return completionItem;
            });
        }
    }

    let keyPathForHosts: Node[] | null;
    const element = new AncestryBuilder(path).parent(YAMLMap).getValue();
    if (isNode(element) && isScalar(element) && element.value === null) {
        keyPathForHosts = new AncestryBuilder(path).parent(YAMLMap).parent(YAMLMap).getKeyPath();
    } else {
        keyPathForHosts = new AncestryBuilder(path).parent(YAMLMap).getKeyPath();
    }

    if (keyPathForHosts) {
        const keyNodeForHosts = keyPathForHosts[keyPathForHosts.length - 1];
        const isHostsKeyword =
            isPlayParam(keyPathForHosts) &&
            isScalar(keyNodeForHosts) &&
            keyNodeForHosts.value === 'hosts';
        const isAnsibleHostKeyword =
            isScalar(keyNodeForHosts) &&
            keyNodeForHosts.value === 'ansible_host' &&
            new AncestryBuilder(keyPathForHosts).parent().parent(YAMLMap).getStringKey() === 'vars';

        if (isHostsKeyword || isAnsibleHostKeyword) {
            const hostsList = (await context.ansibleInventory).hostList;
            return getHostCompletion(hostsList);
        }
    }

    return [];
}

/**
 * Builds completion items for all modules in installed collections.
 *
 * @param collectionsService - Source of installed collection and module metadata.
 * @param useFqcn - Whether to insert fully qualified collection names.
 * @param cursorAtEnd - Whether the cursor is at the end of the line.
 * @param cursorAtFirst - Whether the cursor is on the first list item.
 * @param textEdit - Optional text edit range for the current token.
 * @param documentUri - URI of the document receiving completions.
 * @returns Module completion items with snippet insert text when appropriate.
 */
function getModuleCompletions(
    collectionsService: CollectionsService,
    useFqcn: boolean,
    cursorAtEnd: boolean,
    cursorAtFirst: boolean,
    textEdit: TextEdit | undefined,
    documentUri: string,
): CompletionItem[] {
    const items: CompletionItem[] = [];
    const collections = collectionsService.getCollections();

    for (const [, collection] of collections) {
        const modules = collection.pluginTypes.get('module');
        if (!modules) continue;

        for (const plugin of modules) {
            const fqcn = plugin.fullName;
            const parts = fqcn.split('.');
            const shortName = parts[parts.length - 1];
            const namespace = parts.slice(0, -1).join('.');

            const insertName = useFqcn ? fqcn : shortName;
            const insertText = cursorAtEnd
                ? `${insertName}:${resolveSuffix('dict', cursorAtFirst, isAnsiblePlaybook)}`
                : insertName;

            items.push({
                label: useFqcn ? fqcn : shortName,
                kind: CompletionItemKind.Class,
                detail: namespace,
                sortText: useFqcn
                    ? `${String(priorityMap.moduleName)}_${fqcn}`
                    : `${String(priorityMap.moduleName)}_${shortName}`,
                filterText: useFqcn ? `${shortName} ${fqcn}` : `${shortName} ${fqcn}`,
                data: {
                    documentUri,
                    moduleFqcn: fqcn,
                    atEndOfLine: cursorAtEnd,
                    firstElementOfList: cursorAtFirst,
                },
                insertTextFormat: cursorAtEnd
                    ? InsertTextFormat.Snippet
                    : InsertTextFormat.PlainText,
                textEdit: textEdit ? { ...textEdit, newText: insertText } : undefined,
                insertText: textEdit ? undefined : insertText,
            });
        }
    }

    return items;
}

/**
 * Enriches a completion item with module documentation and snippet insert text.
 *
 * @param completionItem - Completion item to resolve.
 * @param context - Workspace folder context for settings lookup.
 * @returns The completion item with documentation and insert text applied.
 */
export async function doCompletionResolve(
    completionItem: CompletionItem,
    context: WorkspaceFolderContext,
): Promise<CompletionItem> {
    const data = completionItem.data as CompletionItemData | undefined;

    if (data?.moduleFqcn && data.documentUri) {
        const collectionsService = CollectionsService.getInstance();
        const pluginData = await collectionsService.getPluginDocumentation(
            data.moduleFqcn,
            'module',
        );

        if (pluginData?.doc) {
            const useFqcn = (await context.documentSettings.get(data.documentUri)).ansible
                .useFullyQualifiedCollectionNames;

            const parts = data.moduleFqcn.split('.');
            const shortName = parts[parts.length - 1] ?? data.moduleFqcn;
            const insertName = useFqcn ? data.moduleFqcn : shortName;
            const insertText = data.atEndOfLine
                ? `${insertName}:${resolveSuffix(
                      'dict',
                      data.firstElementOfList ?? false,
                      isAnsiblePlaybook,
                  )}`
                : insertName;

            if (completionItem.textEdit) {
                completionItem.textEdit.newText = insertText;
                completionItem.insertTextFormat = InsertTextFormat.Snippet;
            } else {
                completionItem.insertText = insertText;
                completionItem.insertTextFormat = InsertTextFormat.PlainText;
            }

            completionItem.documentation = formatModule(pluginData.doc);
        }
    }

    if (data?.type) {
        const label =
            typeof completionItem.label === 'string'
                ? completionItem.label
                : String(completionItem.label);
        const insertText = data.atEndOfLine
            ? `${label}:${resolveSuffix(data.type, data.firstElementOfList ?? false, isAnsiblePlaybook)}`
            : label;

        if (completionItem.textEdit) {
            completionItem.textEdit.newText = insertText;
        } else {
            completionItem.insertText = insertText;
        }
    }
    return completionItem;
}

/**
 * Returns completion items for undocumented keywords in the current YAML map.
 *
 * @param document - Text document being completed.
 * @param position - Cursor position in the document.
 * @param path - YAML node path at the cursor.
 * @param keywords - Map of keyword names to documentation.
 * @returns Completion items for keywords not yet present in the map.
 */
function getKeywordCompletion(
    document: TextDocument,
    position: Position,
    path: Node[],
    keywords: Map<string, string | MarkupContent>,
): CompletionItem[] {
    const parameterMap = new AncestryBuilder(path).parent(YAMLMap).get();
    if (!parameterMap) {
        return [];
    }
    const providedParams = new Set(getYamlMapKeys(parameterMap));

    const remainingParams = [...keywords.entries()].filter(
        ([keyword]) => !providedParams.has(keyword),
    );
    const nodeRange = getNodeRange(path[path.length - 1], document);

    return remainingParams.map(([keyword, description]) => {
        const priority = keyword === 'name' ? priorityMap.nameKeyword : priorityMap.keyword;
        const completionItem: CompletionItem = {
            label: keyword,
            kind: CompletionItemKind.Property,
            sortText: `${String(priority)}_${keyword}`,
            documentation: description,
        };
        const insertText = atEndOfLine(document, position) ? `${keyword}:` : keyword;
        if (nodeRange) {
            completionItem.textEdit = { range: nodeRange, newText: insertText };
        } else {
            completionItem.insertText = insertText;
        }
        return completionItem;
    });
}

/**
 * Converts inventory host entries into completion items.
 *
 * @param hostObjectList - Hosts and groups from the Ansible inventory.
 * @returns Completion items labeled by host or group name.
 */
function getHostCompletion(hostObjectList: HostType[]): CompletionItem[] {
    return hostObjectList.map(({ host, priority }) => ({
        label: host,
        sortText: `${String(priority)}_${host}`,
        kind: [1, 2].includes(priority) ? CompletionItemKind.Variable : CompletionItemKind.Value,
    }));
}

/**
 * Computes the LSP range for a YAML node, excluding dummy completion characters.
 *
 * @param node - YAML node whose source range is mapped.
 * @param document - Text document containing the node.
 * @returns LSP range for the visible token, or undefined when unavailable.
 */
function getNodeRange(node: Node, document: TextDocument): Range | undefined {
    const range = getOrigRange(node);
    if (range && isScalar(node) && typeof node.value === 'string') {
        const start = range[0];
        let end = range[1];
        if (node.value.includes(dummyMappingCharacter)) {
            end -= 2;
        } else {
            end -= 1;
        }
        return toLspRange([start, end], document);
    }
}

/**
 * Determines whether the cursor sits immediately before a line break.
 *
 * @param document - Text document being completed.
 * @param position - Cursor position to test.
 * @returns True when the next character is a newline.
 */
function atEndOfLine(document: TextDocument, position: Position): boolean {
    const charAfterCursor = `${document.getText()}\n`[document.offsetAt(position)];
    return charAfterCursor === '\n' || charAfterCursor === '\r';
}

/**
 * Checks whether the node range begins the first element of a YAML sequence.
 *
 * @param document - Text document containing the list.
 * @param nodeRange - Range of the node being completed.
 * @returns True when a list marker appears on the same line before the node.
 */
function firstElementOfList(document: TextDocument, nodeRange: Range | undefined): boolean {
    if (!nodeRange) return false;
    const checkRange = {
        start: { line: nodeRange.start.line, character: 0 },
        end: nodeRange.start,
    };
    return document.getText(checkRange).trim() === '-';
}

/**
 * Returns the snippet suffix to append after a completed option key.
 *
 * @param optionType - Ansible option type controlling indentation.
 * @param isFirstElement - Whether the option is the first item in a list.
 * @param isDocPlaybook - Whether the document is a playbook.
 * @returns Whitespace or newline snippet suffix for insert text.
 */
export function resolveSuffix(
    optionType: string,
    isFirstElement: boolean,
    isDocPlaybook: boolean,
): string {
    if (isDocPlaybook) {
        switch (optionType) {
            case 'list':
                return isFirstElement ? `${EOL}\t\t- ` : `${EOL}\t- `;
            case 'dict':
                return isFirstElement ? `${EOL}\t\t` : `${EOL}\t`;
            default:
                return ' ';
        }
    }
    switch (optionType) {
        case 'list':
            return `${EOL}\t- `;
        case 'dict':
            return `${EOL}\t`;
        default:
            return ' ';
    }
}
