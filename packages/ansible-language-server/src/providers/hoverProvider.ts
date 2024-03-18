import { Hover, MarkupContent, MarkupKind } from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { isScalar, Scalar } from "yaml";
import { DocsLibrary } from "../services/docsLibrary";
import {
  blockKeywords,
  isTaskKeyword,
  playKeywords,
  roleKeywords,
  taskKeywords,
} from "../utils/ansible";
import {
  formatModule,
  formatOption,
  formatTombstone,
} from "../utils/docsFormatter";
import { toLspRange } from "../utils/misc";
import {
  AncestryBuilder,
  getOrigRange,
  getPathAt,
  getPossibleOptionsForPath,
  isBlockParam,
  isPlayParam,
  isRoleParam,
  isTaskParam,
  parseAllDocuments,
} from "../utils/yaml";

export async function doHover(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary,
): Promise<Hover | null> {
  const yamlDocs = parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const node = path[path.length - 1];
    if (
      isScalar(node) &&
      new AncestryBuilder(path).parentOfKey().get() // ensure we look at a key, not value of a Pair
    ) {
      if (isPlayParam(path)) {
        return getKeywordHover(document, node, playKeywords);
      }

      if (isBlockParam(path)) {
        return getKeywordHover(document, node, blockKeywords);
      }

      if (isRoleParam(path)) {
        return getKeywordHover(document, node, roleKeywords);
      }

      if (isTaskParam(path)) {
        if (isTaskKeyword(node.value as string)) {
          return getKeywordHover(document, node, taskKeywords);
        } else {
          const [module, hitFqcn] = await docsLibrary.findModule(
            node.value as string,
            path,
            document.uri,
          );
          const range = getOrigRange(node);
          if (module && module.documentation) {
            return {
              contents: formatModule(
                module.documentation,
                docsLibrary.getModuleRoute(hitFqcn || (node.value as string)),
              ),
              range: range ? toLspRange(range, document) : undefined,
            };
          } else if (hitFqcn) {
            // check for tombstones
            const route = docsLibrary.getModuleRoute(hitFqcn);
            if (route) {
              return {
                contents: formatTombstone(route),
                range: range ? toLspRange(range, document) : undefined,
              };
            }
          }
        }
      }

      // hovering over a module option or sub-option
      const options = await getPossibleOptionsForPath(
        path,
        document,
        docsLibrary,
      );

      if (options) {
        const option = options.get(node.value as string);
        if (option) {
          return {
            contents: formatOption(option, true),
          };
        }
      }
    }
  }
  return null;
}

function getKeywordHover(
  document: TextDocument,
  node: Scalar,
  keywords: Map<string, string | MarkupContent>,
): Hover | null {
  const keywordDocumentation = keywords.get(node.value as string);
  const markupDoc =
    typeof keywordDocumentation === "string"
      ? {
          kind: MarkupKind.Markdown,
          value: keywordDocumentation,
        }
      : keywordDocumentation;
  if (markupDoc) {
    const range = getOrigRange(node);
    return {
      contents: markupDoc,
      range: range ? toLspRange(range, document) : undefined,
    };
  } else return null;
}
