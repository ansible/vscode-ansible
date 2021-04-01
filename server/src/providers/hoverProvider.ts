import { Hover } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Scalar, YAMLMap } from 'yaml/types';
import { DocsLibrary } from '../services/docsLibrary';
import { formatModule, formatOption } from '../utils/docsFormatter';
import { toLspRange } from '../utils/misc';
import { AncestryBuilder, getPathAt, mayBeModule } from '../utils/yaml';

export async function doHover(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary
): Promise<Hover | null> {
  const yamlDocs = parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const node = path[path.length - 1];
    if (
      node instanceof Scalar &&
      new AncestryBuilder(path).parentKey(node.value).get() === node // ensure we look at a key, not value of a Pair
    ) {
      if (mayBeModule(path)) {
        const module = await docsLibrary.findModule(node.value, document);
        if (module && module.documentation) {
          return {
            contents: formatModule(module.documentation),
            range: node.range ? toLspRange(node.range, document) : undefined,
          };
        }
      }

      const modulePath = new AncestryBuilder(path)
        .parent(YAMLMap)
        .parentKey()
        .getPath();

      if (modulePath && mayBeModule(modulePath)) {
        const moduleNode = modulePath[modulePath.length - 1] as Scalar;
        const module = await docsLibrary.findModule(moduleNode.value, document);
        if (module && module.documentation) {
          const option = module.documentation.options.get(node.value);
          if (option) {
            return {
              contents: formatOption(option, true),
            };
          }
        }
      }
    }
  }
  return null;
}
