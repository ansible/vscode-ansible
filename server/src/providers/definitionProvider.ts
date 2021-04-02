import { DefinitionLink, Range } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Scalar } from 'yaml/types';
import { DocsLibrary } from '../services/docsLibrary';
import { toLspRange } from '../utils/misc';
import { AncestryBuilder, getPathAt, mayBeModule } from '../utils/yaml';

export async function getDefinition(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary
): Promise<DefinitionLink[] | null> {
  const yamlDocs = parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const node = path[path.length - 1];
    if (
      node instanceof Scalar &&
      new AncestryBuilder(path).parentKey(node.value).get() === node // ensure we look at a key, not value of a Pair
    ) {
      if (mayBeModule(path)) {
        const module = await docsLibrary.findModule(node.value, path, document);
        if (module) {
          return [
            {
              targetUri: module.source,
              originSelectionRange: node.range
                ? toLspRange(node.range, document)
                : undefined,
              targetRange: Range.create(
                module.sourceLineRange[0],
                0,
                module.sourceLineRange[1],
                0
              ),
              targetSelectionRange: Range.create(
                module.sourceLineRange[0],
                0,
                module.sourceLineRange[1],
                0
              ),
            },
          ];
        }
      }
    }
  }
  return null;
}
