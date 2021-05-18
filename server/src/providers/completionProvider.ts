import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Pair, Scalar, YAMLMap } from 'yaml/types';
import { DocsLibrary, IOption } from '../services/docsLibrary';
import { isTaskKeyword } from '../utils/ansible';
import { formatOption, getDetails } from '../utils/docsFormatter';
import { AncestryBuilder, getPathAt, mayBeModule } from '../utils/yaml';

export async function doCompletion(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary
): Promise<CompletionItem[] | null> {
  let preparedText = document.getText();
  const offset = document.offsetAt(position);
  // HACK: We need to insert a dummy mapping, so that the YAML parser can properly recognize the scope.
  // This is particularly important when parser has nothing more than
  // indentation to determine the scope of the current line. `_:` is ok here,
  // since we expect to work on a Pair level
  preparedText = insert(preparedText, offset, '_:');
  // We need a newline at the EOF, so that the YAML parser can properly recognize the scope
  // This is for future case when we might need to avoid the dummy mapping
  preparedText = `${preparedText}\n`;
  const yamlDocs = parseAllDocuments(preparedText);

  // We need inclusive matching, since cursor position is the position of the character right after it
  // NOTE: Might no longer be required due to the hack above
  const path = getPathAt(document, position, yamlDocs, true);
  if (path) {
    const node = path[path.length - 1];
    if (node) {
      // First check if we're looking for module options
      // In that case, the module name is a key of a map
      let modulePath = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parentKey()
        .getPath();

      if (modulePath && mayBeModule(modulePath)) {
        const moduleNode = modulePath[modulePath.length - 1] as Scalar;
        const module = await docsLibrary.findModule(
          moduleNode.value,
          modulePath,
          document
        );
        if (module && module.documentation) {
          const moduleOptions = module.documentation.options;

          const optionMap = (
            new AncestryBuilder(modulePath).parent(Pair).get() as Pair
          ).value as YAMLMap;

          // find options that have been already provided by the user
          const providedOptions = new Set(
            optionMap.items.map((pair) => {
              if (pair.key && pair.key instanceof Scalar) {
                return pair.key.value;
              }
            })
          );

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
      if (modulePath && mayBeModule(modulePath)) {
        const taskParameterMap = new AncestryBuilder(modulePath)
          .parent(YAMLMap)
          .get() as YAMLMap;

        // find task parameters that have been already provided by the user
        const providedParameters = new Set(
          taskParameterMap.items.map((pair) => {
            if (pair.key && pair.key instanceof Scalar) {
              return pair.key.value;
            }
          })
        );
        // should usually be 0 or 1
        const providedModuleNames = [...providedParameters].filter(
          (x) => !x || !isTaskKeyword(x)
        );

        // check if the module has already been provided
        let moduleAlreadyProvided = false;
        for (const m of providedModuleNames) {
          // incidentally, the hack mentioned above prevents finding a module in
          // case the cursor is on it
          if (await docsLibrary.findModule(m, path, document)) {
            moduleAlreadyProvided = true;
            break;
          }
        }
        if (!moduleAlreadyProvided)
          return Array.from(docsLibrary.moduleFqcns).map((moduleFqcn) => {
            const [namespace, collection, name] = moduleFqcn.split('.');
            return {
              label: name,
              kind: CompletionItemKind.Method,
              detail: `${namespace}.${collection}`,
              filterText: moduleFqcn,
            };
          });
      }
    }
  }
  return null;
}

function isAlias(option: { name: string; data: IOption }): boolean {
  return option.name !== option.data.name;
}

function insert(str: string, index: number, val: string) {
  return `${str.substring(0, index)}${val}${str.substring(index)}`;
}

function atEndOfLine(document: TextDocument, position: Position): boolean {
  const charAfterCursor = `${document.getText()}\n`[
    document.offsetAt(position)
  ];
  return charAfterCursor === '\n' || charAfterCursor === '\r';
}
