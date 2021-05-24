import { Hover } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { parseAllDocuments } from 'yaml';
import { Scalar, YAMLMap } from 'yaml/types';
import { DocsLibrary } from '../services/docsLibrary';
import { formatModule, formatOption } from '../utils/docsFormatter';
import { toLspRange } from '../utils/misc';
import { AncestryBuilder, getPathAt, isTaskParameter } from '../utils/yaml';

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
      new AncestryBuilder(path).parentOfKey().get() // ensure we look at a key, not value of a Pair
    ) {
      // hovering over a module name
      if (isTaskParameter(path)) {
        const module = await docsLibrary.findModule(
          node.value,
          path,
          document.uri
        );
        if (module && module.documentation) {
          return {
            contents: formatModule(module.documentation),
            range: node.range ? toLspRange(node.range, document) : undefined,
          };
        }
      }

      // hovering over a module parameter
      const modulePath = new AncestryBuilder(path)
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
