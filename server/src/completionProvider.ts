import { CompletionItem } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Pair, Scalar, YAMLMap } from 'yaml/types';
import { formatDescription, formatOption } from './docsFormatter';
import { DocsLibrary } from './docsLibrary';
import { mayBeModule } from './utils';
import { AncestryBuilder, getPathAt } from './utils';

export function doCompletion(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary
): CompletionItem[] | null {
  let preparedText = document.getText();
  const offset = document.offsetAt(position);
  // HACK: We need to insert a dummy character, so that the YAML parser can properly recognize the scope.
  // This is particularly important when parser has nothing more than
  // indentation to determine the scope of the current line. `_:` is ok here,
  // since we expect to work on a Pair level
  preparedText = insert(preparedText, offset, '_:');
  // We need a newline at the EOF, so that the YAML parser can properly recognize the scope
  // This is for future case when we might need to avoid the dummy character
  preparedText = `${preparedText}\n`;
  const yamlDocs = parseAllDocuments(preparedText);

  // We need inclusive matching, since cursor position is the position of the character right after it
  // NOTE: Might no longer be required due to the hack above
  const path = getPathAt(document, position, yamlDocs, true);
  if (path) {
    const node = path[path.length - 1];
    if (node) {
      const modulePath = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parentKey()
        .getPath();

      if (modulePath && mayBeModule(modulePath)) {
        const moduleNode = modulePath[modulePath.length - 1] as Scalar;
        if (docsLibrary.isModule(moduleNode.value)) {
          const options = docsLibrary.getModuleOptions(moduleNode.value);

          if (options) {
            const optionMap = (new AncestryBuilder(modulePath)
              .parent(Pair)
              .get() as Pair).value as YAMLMap;
            const providedOptions = new Set(
              optionMap.items.map((pair) => {
                if (pair.key && pair.key instanceof Scalar) {
                  return pair.key.value;
                }
              })
            );
            const filteredOptions = options?.filter(
              (o) => !providedOptions.has(o.name)
            );

            return filteredOptions.map((option) => {
              return {
                label: option.name,
                documentation: formatOption(option),
                insertText: atEndOfLine(document, position)
                  ? `${option.name}: `
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

function insert(str: string, index: number, val: string) {
  return `${str.substring(0, index)}${val}${str.substring(index)}`;
}

function atEndOfLine(document: TextDocument, position: Position): boolean {
  const charAfterCursor = `${document.getText()}\n`[
    document.offsetAt(position)
  ];
  return charAfterCursor === '\n' || charAfterCursor === '\r';
}
