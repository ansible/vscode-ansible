import { EOL } from "os";
import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupContent,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { Node, Scalar, YAMLMap } from "yaml/types";
import { IOption } from "../interfaces/module";
import { WorkspaceFolderContext } from "../services/workspaceManager";
import {
  blockKeywords,
  playKeywords,
  playWithoutTaskKeywords,
  roleKeywords,
  taskKeywords,
} from "../utils/ansible";
import { formatModule, formatOption, getDetails } from "../utils/docsFormatter";
import { insert, toLspRange } from "../utils/misc";
import {
  AncestryBuilder,
  findProvidedModule,
  getDeclaredCollections,
  getPathAt,
  getOrigRange,
  getYamlMapKeys,
  isBlockParam,
  isPlayParam,
  isRoleParam,
  isTaskParam,
  parseAllDocuments,
  getPossibleOptionsForPath,
} from "../utils/yaml";

const priorityMap = {
  nameKeyword: 1,
  moduleName: 2,
  redirectedModuleName: 3,
  keyword: 4,
  // options
  requiredOption: 1,
  option: 2,
  aliasOption: 3,
  // choices
  defaultChoice: 1,
  choice: 2,
};

export async function doCompletion(
  document: TextDocument,
  position: Position,
  context: WorkspaceFolderContext
): Promise<CompletionItem[] | null> {
  let preparedText = document.getText();
  const offset = document.offsetAt(position);
  // HACK: We need to insert a dummy mapping, so that the YAML parser can properly recognize the scope.
  // This is particularly important when parser has nothing more than
  // indentation to determine the scope of the current line. `_:` is ok here,
  // since we expect to work on a Pair level
  preparedText = insert(preparedText, offset, "_:");
  const yamlDocs = parseAllDocuments(preparedText);

  const useFqcn = (await context.documentSettings.get(document.uri)).ansible
    .useFullyQualifiedCollectionNames;
  const provideRedirectModulesCompletion = (
    await context.documentSettings.get(document.uri)
  ).completion.provideRedirectModules;
  const provideModuleOptionAliasesCompletion = (
    await context.documentSettings.get(document.uri)
  ).completion.provideModuleOptionAliases;

  // We need inclusive matching, since cursor position is the position of the character right after it
  // NOTE: Might no longer be required due to the hack above
  const path = getPathAt(document, position, yamlDocs, true);
  if (path) {
    const node = path[path.length - 1];
    if (node) {
      const docsLibrary = await context.docsLibrary;

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
        // offer basic task keywords
        const completionItems = getKeywordCompletion(
          document,
          position,
          path,
          taskKeywords
        );
        if (isPlay === undefined) {
          // this can still turn into a play, so we should offer those keywords too
          completionItems.push(
            ...getKeywordCompletion(
              document,
              position,
              path,
              playWithoutTaskKeywords
            )
          );
        }

        // incidentally, the hack mentioned above prevents finding a module in
        // case the cursor is on it
        const module = await findProvidedModule(path, document, docsLibrary);
        if (!module) {
          // offer the 'block' keyword (as it is not one of taskKeywords)
          completionItems.push(
            ...getKeywordCompletion(
              document,
              position,
              path,
              new Map([["block", blockKeywords.get("block") as string]])
            )
          );

          const inlineCollections = getDeclaredCollections(path);
          const cursorAtEndOfLine = atEndOfLine(document, position);

          let textEdit: TextEdit | undefined;
          const nodeRange = getNodeRange(node, document);
          if (nodeRange) {
            textEdit = {
              range: nodeRange,
              newText: "", // placeholder
            };
          }
          const cursorAtFirstElementOfList = firstElementOfList(
            document,
            nodeRange
          );

          // offer modules
          const moduleCompletionItems = [...docsLibrary.moduleFqcns]
            .filter(
              (moduleFqcn) =>
                provideRedirectModulesCompletion ||
                !docsLibrary.getModuleRoute(moduleFqcn)?.redirect
            )
            .map((moduleFqcn): CompletionItem => {
              let priority, kind;
              if (docsLibrary.getModuleRoute(moduleFqcn)?.redirect) {
                priority = priorityMap.redirectedModuleName;
                kind = CompletionItemKind.Reference;
              } else {
                priority = priorityMap.moduleName;
                kind = CompletionItemKind.Class;
              }
              const [namespace, collection, name] = moduleFqcn.split(".");
              const insertName = useFqcn ? moduleFqcn : name;
              const insertText = cursorAtEndOfLine
                ? `${insertName}:${resolveSuffix(
                    "dict", // since a module is always a dictionary
                    cursorAtFirstElementOfList
                  )}`
                : insertName;
              return {
                label: useFqcn ? moduleFqcn : name,
                kind: kind,
                detail: `${namespace}.${collection}`,
                sortText: useFqcn
                  ? `${priority}_${moduleFqcn}`
                  : `${priority}_${name}`,
                filterText: useFqcn
                  ? `${name} ${moduleFqcn} ${collection} ${namespace}` // name should have highest priority (in case of FQCN)
                  : `${name} ${moduleFqcn}`, // name should have priority (in case of no FQCN)
                data: {
                  documentUri: document.uri, // preserve document URI for completion request
                  moduleFqcn: moduleFqcn,
                  inlineCollections: inlineCollections,
                  atEndOfLine: cursorAtEndOfLine,
                  firstElementOfList: cursorAtFirstElementOfList,
                },
                textEdit: {
                  ...textEdit,
                  newText: insertText,
                },
              };
            });
          completionItems.push(...moduleCompletionItems);
        }
        return completionItems;
      }

      // Check if we're looking for module options or sub-options
      const options = await getPossibleOptionsForPath(
        path,
        document,
        docsLibrary
      );

      if (options) {
        const optionMap = new AncestryBuilder(path)
          .parentOfKey()
          .get() as YAMLMap;

        // find options that have been already provided by the user
        const providedOptions = new Set(getYamlMapKeys(optionMap));

        const remainingOptions = [...options.entries()].filter(
          ([, specs]) => !providedOptions.has(specs.name)
        );

        const nodeRange = getNodeRange(node, document);

        const cursorAtFirstElementOfList = firstElementOfList(
          document,
          nodeRange
        );

        const cursorAtEndOfLine = atEndOfLine(document, position);

        return remainingOptions
          .map(([option, specs]) => {
            return {
              name: option,
              specs: specs,
            };
          })
          .filter(
            (option) => provideModuleOptionAliasesCompletion || !isAlias(option)
          )
          .map((option, index) => {
            // translate option documentation to CompletionItem
            const details = getDetails(option.specs);
            let priority;
            if (isAlias(option)) {
              priority = priorityMap.aliasOption;
            } else if (option.specs.required) {
              priority = priorityMap.requiredOption;
            } else {
              priority = priorityMap.option;
            }
            const completionItem: CompletionItem = {
              label: option.name,
              detail: details,
              // using index preserves order from the specification
              // except when overridden by the priority
              sortText: priority.toString() + index.toString().padStart(3),
              kind: isAlias(option)
                ? CompletionItemKind.Reference
                : CompletionItemKind.Property,
              documentation: formatOption(option.specs),
              data: {
                documentUri: document.uri, // preserve document URI for completion request
                type: option.specs.type,
                range: nodeRange,
                atEndOfLine: cursorAtEndOfLine,
                firstElementOfList: cursorAtFirstElementOfList,
              },
            };
            const insertText = atEndOfLine(document, position)
              ? `${option.name}:`
              : option.name;
            if (nodeRange) {
              completionItem.textEdit = {
                range: nodeRange,
                newText: insertText,
              };
            } else {
              completionItem.insertText = insertText;
            }
            return completionItem;
          });
      }

      // Now check if we're looking for option/sub-option values
      let keyPath: Node[] | null;
      // establish path for the key (option/sub-option name)
      if (new AncestryBuilder(path).parent(YAMLMap).getValue() === null) {
        keyPath = new AncestryBuilder(path)
          .parent(YAMLMap) // compensates for `_:`
          .parent(YAMLMap)
          .getKeyPath();
      } else {
        // in this case there is a character immediately after `_:`, which
        // prevents formation of nested map
        keyPath = new AncestryBuilder(path).parent(YAMLMap).getKeyPath();
      }
      if (keyPath) {
        const keyNode = keyPath[keyPath.length - 1];
        const keyOptions = await getPossibleOptionsForPath(
          keyPath,
          document,
          docsLibrary
        );
        if (
          keyOptions &&
          keyNode instanceof Scalar &&
          keyOptions.has(keyNode.value)
        ) {
          const nodeRange = getNodeRange(node, document);

          const option = keyOptions.get(keyNode.value);
          const choices = [];
          let defaultChoice = option.default;
          if (option.type === "bool" && typeof option.default === "string") {
            // the YAML parser does not recognize values such as 'Yes'/'no' as booleans
            defaultChoice =
              option.default.toLowerCase() === "yes" ? true : false;
          }
          if (option.choices) {
            choices.push(...option.choices);
          } else if (option.type === "bool") {
            choices.push(true);
            choices.push(false);
          } else if (defaultChoice !== undefined) {
            choices.push(defaultChoice);
          }
          return choices.map((choice, index) => {
            let priority;
            if (choice === defaultChoice) {
              priority = priorityMap.defaultChoice;
            } else {
              priority = priorityMap.choice;
            }
            const insertValue = new String(choice).toString();
            const completionItem: CompletionItem = {
              label: insertValue,
              detail: choice === defaultChoice ? "default" : undefined,
              // using index preserves order from the specification
              // except when overridden by the priority
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
    }
  }
  return null;
}

function getKeywordCompletion(
  document: TextDocument,
  position: Position,
  path: Node[],
  keywords: Map<string, string | MarkupContent>
): CompletionItem[] {
  const parameterMap = new AncestryBuilder(path)
    .parent(YAMLMap)
    .get() as YAMLMap;
  // find options that have been already provided by the user
  const providedParams = new Set(getYamlMapKeys(parameterMap));

  const remainingParams = [...keywords.entries()].filter(
    ([keyword]) => !providedParams.has(keyword)
  );
  const nodeRange = getNodeRange(path[path.length - 1], document);
  return remainingParams.map(([keyword, description]) => {
    const priority =
      keyword === "name" ? priorityMap.nameKeyword : priorityMap.keyword;
    const completionItem: CompletionItem = {
      label: keyword,
      kind: CompletionItemKind.Property,
      sortText: `${priority}_${keyword}`,
      documentation: description,
    };
    const insertText = atEndOfLine(document, position)
      ? `${keyword}:`
      : keyword;
    if (nodeRange) {
      completionItem.textEdit = {
        range: nodeRange,
        newText: insertText,
      };
    } else {
      completionItem.insertText = insertText;
    }
    return completionItem;
  });
}

/**
 * Returns an LSP formatted range compensating for the `_:` hack, provided that
 * the node has range information and is a string scalar.
 */
function getNodeRange(node: Node, document: TextDocument): Range | undefined {
  const range = getOrigRange(node);
  if (range && node instanceof Scalar && typeof node.value === "string") {
    const start = range[0];
    let end = range[1];
    // compensate for `_:`
    if (node.value.includes("_:")) {
      end -= 2;
    } else {
      // colon, being at the end of the line, was excluded from the node
      end -= 1;
    }
    return toLspRange([start, end], document);
  }
}

export async function doCompletionResolve(
  completionItem: CompletionItem,
  context: WorkspaceFolderContext
): Promise<CompletionItem> {
  if (completionItem.data?.moduleFqcn && completionItem.data?.documentUri) {
    // resolve completion for a module

    const docsLibrary = await context.docsLibrary;
    const [module] = await docsLibrary.findModule(
      completionItem.data.moduleFqcn
    );

    if (module && module.documentation) {
      const [namespace, collection, name] =
        completionItem.data.moduleFqcn.split(".");

      let useFqcn = (
        await context.documentSettings.get(completionItem.data.documentUri)
      ).ansible.useFullyQualifiedCollectionNames;

      if (!useFqcn) {
        // determine if the short name can really be used

        const declaredCollections: Array<string> =
          completionItem.data?.inlineCollections || [];
        declaredCollections.push("ansible.builtin");

        const metadata = await context.documentMetadata.get(
          completionItem.data.documentUri
        );
        if (metadata) {
          declaredCollections.push(...metadata.collections);
        }

        const canUseShortName = declaredCollections.some(
          (c) => c === `${namespace}.${collection}`
        );
        if (!canUseShortName) {
          // not an Ansible built-in module, and not part of the declared
          // collections
          useFqcn = true;
        }
      }

      const insertName = useFqcn ? completionItem.data.moduleFqcn : name;
      const insertText = completionItem.data.atEndOfLine
        ? `${insertName}:${resolveSuffix(
            "dict", // since a module is always a dictionary
            completionItem.data.firstElementOfList
          )}`
        : insertName;

      if (completionItem.textEdit) {
        completionItem.textEdit.newText = insertText;
        completionItem.insertTextFormat = InsertTextFormat.Snippet;
      } else {
        completionItem.insertText = insertText;
        completionItem.insertTextFormat = InsertTextFormat.PlainText;
      }

      completionItem.documentation = formatModule(
        module.documentation,
        docsLibrary.getModuleRoute(completionItem.data.moduleFqcn)
      );
    }
  }

  if (completionItem.data?.type) {
    // resolve completion for a module option or sub-option

    const insertText = completionItem.data.atEndOfLine
      ? `${completionItem.label}:${resolveSuffix(
          completionItem.data.type,
          completionItem.data.firstElementOfList
        )}`
      : `${completionItem.label}`;

    if (completionItem.textEdit) {
      completionItem.textEdit.newText = insertText;
    } else {
      completionItem.insertText = insertText;
    }
  }
  return completionItem;
}

function isAlias(option: { name: string; specs: IOption }): boolean {
  return option.name !== option.specs.name;
}

function atEndOfLine(document: TextDocument, position: Position): boolean {
  const charAfterCursor = `${document.getText()}\n`[
    document.offsetAt(position)
  ];
  return charAfterCursor === "\n" || charAfterCursor === "\r";
}

/**
 * A utility function to check if the item is the first element of a list or not
 * @param document current document
 * @param nodeRange range of the keyword in the document
 * @returns {boolean} true if the key is the first element of the list, else false
 */
function firstElementOfList(document: TextDocument, nodeRange: Range): boolean {
  const checkNodeRange = {
    start: { line: nodeRange.start.line, character: 0 },
    end: nodeRange.start,
  };
  const elementsBeforeKey = document.getText(checkNodeRange).trim();

  return elementsBeforeKey === "-";
}

function resolveSuffix(optionType: string, firstElementOfList: boolean) {
  let returnSuffix: string;

  switch (optionType) {
    case "list":
      returnSuffix = firstElementOfList ? `${EOL}\t\t- ` : `${EOL}\t- `;
      break;
    case "dict":
      returnSuffix = firstElementOfList ? `${EOL}\t\t` : `${EOL}\t`;
      break;
    default:
      returnSuffix = " ";
      break;
  }

  return returnSuffix;
}
