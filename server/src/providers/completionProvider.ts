import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Pair, Scalar, YAMLMap } from 'yaml/types';
import { IOption } from '../services/docsLibrary';
import { WorkspaceFolderContext } from '../services/workspaceManager';
import { isTaskKeyword } from '../utils/ansible';
import { formatModule, formatOption, getDetails } from '../utils/docsFormatter';
import { insert } from '../utils/misc';
import {
  AncestryBuilder,
  getDeclaredCollections,
  getPathAt,
  getYamlMapKeys,
  isTaskParameter,
} from '../utils/yaml';

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
      // First check if we're looking for module options
      // In that case, the module name is a key of a map
      let modulePath = new AncestryBuilder(path)
        .parentOfKey()
        .parent(YAMLMap)
        .getKeyPath();

      if (modulePath && isTaskParameter(modulePath)) {
        const moduleNode = modulePath[modulePath.length - 1] as Scalar;
        const module = await docsLibrary.findModule(
          moduleNode.value,
          modulePath,
          document.uri
        );
        if (module && module.documentation) {
          const moduleOptions = module.documentation.options;

          const optionMap = (
            new AncestryBuilder(modulePath).parent(Pair).get() as Pair
          ).value as YAMLMap;

          // find options that have been already provided by the user
          const providedOptions = new Set(getYamlMapKeys(optionMap));

          const remainingOptions = [...moduleOptions.entries()].filter(
            (o) => !providedOptions.has(o[1].name)
          );
          return remainingOptions
            .map((entry) => {
              return {
                name: entry[0],
                data: entry[1],
              };
            })
            .sort((a, b) => {
              // make required options appear on the top
              if (a.data.required && !b.data.required) {
                return -1;
              } else if (!a.data.required && b.data.required) {
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
              const details = getDetails(option.data);
              return {
                label: option.name,
                detail: details,
                sortText: index.toString().padStart(3),
                kind: isAlias(option)
                  ? CompletionItemKind.Reference
                  : CompletionItemKind.Property,
                documentation: formatOption(option.data),
                insertText: atEndOfLine(document, position)
                  ? `${option.name}: `
                  : undefined,
              };
            });
        }
      }
      modulePath = path;
      if (modulePath && isTaskParameter(modulePath)) {
        const taskParameterMap = new AncestryBuilder(modulePath)
          .parent(YAMLMap)
          .get() as YAMLMap;

        // find task parameters that have been already provided by the user
        const providedParameters = new Set(getYamlMapKeys(taskParameterMap));
        // should usually be 0 or 1
        const providedModuleNames = [...providedParameters].filter(
          (x) => !x || !isTaskKeyword(x)
        );

        // check if the module has already been provided
        let moduleAlreadyProvided = false;
        for (const m of providedModuleNames) {
          // incidentally, the hack mentioned above prevents finding a module in
          // case the cursor is on it
          if (await docsLibrary.findModule(m, path, document.uri)) {
            moduleAlreadyProvided = true;
            break;
          }
        }
        if (!moduleAlreadyProvided)
          return Array.from(docsLibrary.moduleFqcns).map((moduleFqcn) => {
            const [namespace, collection, name] = moduleFqcn.split('.');
            return {
              label: name,
              kind: CompletionItemKind.Class,
              detail: `${namespace}.${collection}`,
              filterText: moduleFqcn,
              data: {
                documentUri: document.uri, // preserve document URI for completion request
                moduleFqcn: moduleFqcn,
                inlineCollections: getDeclaredCollections(modulePath),
              },
              insertText: atEndOfLine(document, position)
                ? `${moduleFqcn}: `
                : moduleFqcn,
            };
          });
      }
    }
  }
  return null;
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
        completionItem.insertText = completionItem.insertText?.endsWith(': ')
          ? `${insertName}: `
          : insertName;

        completionItem.documentation = formatModule(module.documentation);
      }
    }
  }
  return completionItem;
}

function isAlias(option: { name: string; data: IOption }): boolean {
  return option.name !== option.data.name;
}

function atEndOfLine(document: TextDocument, position: Position): boolean {
  const charAfterCursor = `${document.getText()}\n`[
    document.offsetAt(position)
  ];
  return charAfterCursor === '\n' || charAfterCursor === '\r';
}
