import { Hover } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Node, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml/types';
import { formatDescription, formatOption } from './docsFormatter';
import { DocsLibrary } from './docsLibrary';
import { mayBeModule } from './utils';
import { AncestryBuilder, getPathAt } from './utils';

export function doHover(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary
): Hover | null {
  const yamlDocs = parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const node = path[path.length - 1];
    if (
      node instanceof Scalar &&
      new AncestryBuilder(path).parentKey(node.value).get() === node // ensure we look at a key, not value of a Pair
    ) {
      if (mayBeModule(path)) {
        const description = docsLibrary.getModuleDescription(node.value);
        if (description) {
          return {
            contents: formatDescription(description),
          };
        }
      }

      const modulePath = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parentKey()
        .getPath();

      if (modulePath && mayBeModule(modulePath)) {
        const moduleNode = modulePath[modulePath.length - 1] as Scalar;
        if (docsLibrary.isModule(moduleNode.value)) {
          const option = docsLibrary.getModuleOption(
            moduleNode.value,
            node.value
          );
          if (option) {
            return {
              contents: formatOption(option),
            };
          }
        }
      }
    }
  }
  return null;
}
