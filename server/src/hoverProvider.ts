import { Hover } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Pair, Scalar } from 'yaml/types';
import { formatDescription, formatOption } from './docsFormatter';
import { DocsLibrary } from './docsLibrary';
import { getPathAt } from './utils';

export function doHover(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary
): Hover | null {
  const yamlDocs = parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const node = path[path.length - 1];
    if (node instanceof Scalar) {
      // Check if options first
      const parent_pair = path[path.length - 4]; //Pair[module_name, Map{Pair[option_name, ...], ...}]
      if (
        parent_pair instanceof Pair &&
        parent_pair.key instanceof Scalar &&
        docsLibrary.isModule(parent_pair.key.value)
      ) {
        const option = docsLibrary.getModuleOption(
          parent_pair.key.value,
          node.value
        );
        if (option) {
          return {
            contents: formatOption(option),
          };
        }
      }
      // Check if module
      const description = docsLibrary.getModuleDescription(node.value);
      if (description) {
        return {
          contents: formatDescription(description),
        };
      }
    }
  }
  return null;
}
