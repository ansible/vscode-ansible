import {
  CompletionItem,
  CompletionItemKind,
  MarkupContent,
} from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Node, Pair, Scalar, YAMLMap } from 'yaml/types';
import { IOption } from '../services/docsLibrary';
import { WorkspaceFolderContext } from '../services/workspaceManager';
import {
  blockKeywords,
  playKeywords,
  playWithoutTaskKeywords,
  roleKeywords,
  taskKeywords,
} from '../utils/ansible';
import { formatModule, formatOption, getDetails } from '../utils/docsFormatter';
import { insert } from '../utils/misc';
import {
  AncestryBuilder,
  findProvidedModule,
  getDeclaredCollections,
  getPathAt,
  getYamlMapKeys,
  isBlockParam,
  isPlayParam,
  isRoleParam,
  isTaskParam,
} from '../utils/yaml';

const priorityMap = {
  nameKeyword: 1,
  moduleName: 2,
  keyword: 3,
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
  preparedText = insert(preparedText, offset, '_:');
  const yamlDocs = parseAllDocuments(preparedText);

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
              new Map([['block', blockKeywords.get('block') as string]])
            )
          );

          // offer modules
          const moduleCompletionItems = [...docsLibrary.moduleFqcns].map(
            (moduleFqcn) => {
              const [namespace, collection, name] = moduleFqcn.split('.');
              return {
                label: name,
                kind: CompletionItemKind.Class,
                detail: `${namespace}.${collection}`,
                sortText: `${priorityMap.moduleName}_${name}`,
                filterText: moduleFqcn,
                data: {
                  documentUri: document.uri, // preserve document URI for completion request
                  moduleFqcn: moduleFqcn,
                  inlineCollections: getDeclaredCollections(path),
                },
                insertText: atEndOfLine(document, position)
                  ? `${moduleFqcn}:`
                  : moduleFqcn,
              };
            }
          );
          completionItems.push(...moduleCompletionItems);
        }
        return completionItems;
      }

      // Finally, check if we're looking for module options
      // In that case, the module name is a key of a map
      const parentKeyPath = new AncestryBuilder(path)
        .parentOfKey()
        .parent(YAMLMap)
        .getKeyPath();

      if (parentKeyPath && isTaskParam(parentKeyPath)) {
        const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
        if (parentKeyNode instanceof Scalar) {
          let module;
          if (parentKeyNode.value === 'args') {
            module = await findProvidedModule(
              parentKeyPath,
              document,
              docsLibrary
            );
          } else {
            module = await docsLibrary.findModule(
              parentKeyNode.value,
              parentKeyPath,
              document.uri
            );
          }
          if (module && module.documentation) {
            const moduleOptions = module.documentation.options;

            const optionMap = (
              new AncestryBuilder(parentKeyPath).parent(Pair).get() as Pair
            ).value as YAMLMap;

            // find options that have been already provided by the user
            const providedOptions = new Set(getYamlMapKeys(optionMap));

            const remainingOptions = [...moduleOptions.entries()].filter(
              ([, specs]) => !providedOptions.has(specs.name)
            );
            return remainingOptions
              .map(([option, specs]) => {
                return {
                  name: option,
                  specs: specs,
                };
              })
              .sort((a, b) => {
                // make required options appear on the top
                if (a.specs.required && !b.specs.required) {
                  return -1;
                } else if (!a.specs.required && b.specs.required) {
                  return 1;
                } else {
                  return 0;
                }
              })
              .sort((a, b) => {
                // push all aliases to the bottom
                if (isAlias(a) && !isAlias(b)) {
                  return 1;
                } else if (!isAlias(a) && isAlias(b)) {
                  return -1;
                } else {
                  return 0;
                }
              })
              .map((option, index) => {
                // translate option documentation to CompletionItem
                const details = getDetails(option.specs);
                return {
                  label: option.name,
                  detail: details,
                  sortText: index.toString().padStart(3),
                  kind: isAlias(option)
                    ? CompletionItemKind.Reference
                    : CompletionItemKind.Property,
                  documentation: formatOption(option.specs),
                  insertText: atEndOfLine(document, position)
                    ? `${option.name}:`
                    : undefined,
                };
              });
          }
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
  return remainingParams.map(([keyword, description]) => {
    const priority =
      keyword === 'name' ? priorityMap.nameKeyword : priorityMap.keyword;
    return {
      label: keyword,
      kind: CompletionItemKind.Property,
      sortText: `${priority}_${keyword}`,
      documentation: description,
      insertText: atEndOfLine(document, position) ? `${keyword}:` : undefined,
    };
  });
}

export async function doCompletionResolve(
  completionItem: CompletionItem,
  context: WorkspaceFolderContext
): Promise<CompletionItem> {
  if (completionItem.kind === CompletionItemKind.Class) {
    // resolve completion for a module

    if (completionItem.data?.moduleFqcn && completionItem.data?.documentUri) {
      const module = await (
        await context.docsLibrary
      ).findModule(completionItem.data.moduleFqcn);

      if (module && module.documentation) {
        const [namespace, collection, name] =
          completionItem.data.moduleFqcn.split('.');

        let useFqcn = (
          await context.documentSettings.get(completionItem.data.documentUri)
        ).ansible.useFullyQualifiedCollectionNames;

        if (!useFqcn) {
          // determine if the short name can really be used

          const declaredCollections: Array<string> =
            completionItem.data?.inlineCollections || [];
          declaredCollections.push('ansible.builtin');

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
        completionItem.insertText = completionItem.insertText?.endsWith(':')
          ? `${insertName}:`
          : insertName;

        completionItem.documentation = formatModule(module.documentation);
      }
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
  return charAfterCursor === '\n' || charAfterCursor === '\r';
}
