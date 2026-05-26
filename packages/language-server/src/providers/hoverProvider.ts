import { Hover, MarkupContent, MarkupKind } from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { isScalar, Scalar } from "yaml";
import {
  blockKeywords,
  isTaskKeyword,
  playKeywords,
  roleKeywords,
  taskKeywords,
} from "../utils/ansible";
import { formatModule, formatOption } from "../utils/docsFormatter";
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
import { CollectionsService } from "@ansible/core/out/services/CollectionsService";

export async function doHover(
  document: TextDocument,
  position: Position,
  collectionsService: CollectionsService,
): Promise<Hover | null> {
  const yamlDocs = parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (!path) return null;

  const node = path[path.length - 1];
  if (
    !isScalar(node) ||
    !new AncestryBuilder(path).parentOfKey().get()
  ) {
    return null;
  }

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
    }

    const moduleName = node.value as string;
    const fqcn = resolveFqcn(moduleName);
    const pluginData = await collectionsService.getPluginDocumentation(
      fqcn,
      "module",
    );
    if (pluginData?.doc) {
      const range = getOrigRange(node);
      return {
        contents: formatModule(pluginData.doc),
        range: range ? toLspRange(range, document) : undefined,
      };
    }
  }

  const options = await getPossibleOptionsForPath(
    path,
    document,
    collectionsService,
  );

  if (options) {
    const optionName = node.value as string;
    const option = options[optionName];
    if (option) {
      return {
        contents: formatOption(option, optionName, true),
      };
    }
  }

  return null;
}

function resolveFqcn(name: string): string {
  const dotCount = (name.match(/\./g) || []).length;
  if (dotCount >= 2) {
    return name;
  }
  return `ansible.builtin.${name}`;
}

function getKeywordHover(
  document: TextDocument,
  node: Scalar,
  keywords: Map<string, string | MarkupContent>,
): Hover | null {
  const keywordDocumentation = keywords.get(node.value as string);
  const markupDoc: MarkupContent | undefined =
    typeof keywordDocumentation === "string"
      ? { kind: MarkupKind.Markdown, value: keywordDocumentation }
      : keywordDocumentation;

  if (markupDoc) {
    const range = getOrigRange(node);
    return {
      contents: markupDoc,
      range: range ? toLspRange(range, document) : undefined,
    };
  }
  return null;
}
