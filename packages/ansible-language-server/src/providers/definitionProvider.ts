import { DefinitionLink, Range } from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { isScalar, Node, YAMLMap, YAMLSeq } from "yaml";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import {
  isFileReference,
  resolveFileReference,
} from "@src/utils/fileReference.js";
import { toLspRange } from "@src/utils/misc.js";
import {
  AncestryBuilder,
  getOrigRange,
  getPathAt,
  isTaskParam,
  parseAllDocuments,
} from "@src/utils/yaml.js";

/**
 * Handles Go to Definition on the *value* of a task option that references a
 * local file, e.g. `src: myfile.txt.j2` for the template module.
 */
async function getFileDefinition(
  document: TextDocument,
  path: Node[],
  basedirs: string[],
  onUnresolvedReference?: (reference: string) => void,
): Promise<DefinitionLink[] | null> {
  const node = path[path.length - 1];
  if (!isScalar(node) || typeof node.value !== "string") {
    return null;
  }

  // The value must be the value of a Pair, never a key or a sequence item.
  const owner = new AncestryBuilder(path).parent(YAMLMap);
  const ownerKey = owner.getStringKey();
  const ownerValue = owner.getValue();
  if (!ownerKey || ownerValue !== node) {
    return null;
  }

  let moduleName: string | null;
  let optionName: string | undefined;
  let taskKeyPath: Node[] | null;
  let moduleOptions: YAMLMap | null = null;

  const parentMap = owner.get();
  const grandParent = new AncestryBuilder(path).parent(YAMLMap).parent(YAMLMap);
  const moduleKey = grandParent.getStringKey();
  if (parentMap && moduleKey && grandParent.get()) {
    // `template: { src: x }`: the value belongs to an option of the module
    moduleName = moduleKey;
    optionName = ownerKey;
    taskKeyPath = grandParent.getKeyPath();
    moduleOptions = parentMap;
  } else {
    // `include_tasks: x`: the value belongs to the task itself (free-form)
    moduleName = ownerKey;
    optionName = undefined;
    taskKeyPath = new AncestryBuilder(path).parent(YAMLMap).getKeyPath();
  }

  if (!moduleName || !taskKeyPath) {
    return null;
  }
  const spec = isFileReference(moduleName, optionName);
  if (!spec) {
    return null;
  }
  const isTopLevelImportPlaybook =
    spec.topLevelOnly &&
    new AncestryBuilder(taskKeyPath).parentOfKey().parent(YAMLSeq).getPath()
      ?.length === 1;
  if (
    spec.topLevelOnly ? !isTopLevelImportPlaybook : !isTaskParam(taskKeyPath)
  ) {
    return null;
  }

  const remoteSrcNode = moduleOptions?.get("remote_src", true);
  const remoteSrcValue = isScalar(remoteSrcNode)
    ? remoteSrcNode.value
    : undefined;
  const hasRemoteSrcOption = !!remoteSrcNode;
  const remoteSrc =
    remoteSrcValue === true ||
    (typeof remoteSrcValue === "string" &&
      ["true", "yes", "on"].includes(remoteSrcValue.toLowerCase()))
      ? true
      : remoteSrcValue === false ||
          (typeof remoteSrcValue === "string" &&
            ["false", "no", "off"].includes(remoteSrcValue.toLowerCase()))
        ? false
        : undefined;
  if (
    remoteSrc === true ||
    (hasRemoteSrcOption && remoteSrc === undefined) ||
    (spec.remoteByDefault && remoteSrc !== false)
  ) {
    return null;
  }

  const target = await resolveFileReference(
    node.value,
    spec.dirname,
    URI.parse(document.uri).fsPath,
    basedirs,
    spec.allowDirectory,
  );
  if (!target) {
    const reference = node.value.trim();
    if (reference && !reference.includes("{{") && !reference.includes("{%")) {
      onUnresolvedReference?.(reference);
    }
    return null;
  }

  const range = getOrigRange(node);
  const start = Range.create(0, 0, 0, 0);
  return [
    {
      targetUri: URI.file(target).toString(),
      originSelectionRange: range ? toLspRange(range, document) : undefined,
      targetRange: start,
      targetSelectionRange: start,
    },
  ];
}

export async function getDefinition(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary,
  basedirs: string[] = [],
  onUnresolvedReference?: (reference: string) => void,
): Promise<DefinitionLink[] | null> {
  const yamlDocs = parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const fileDefinition = await getFileDefinition(
      document,
      path,
      basedirs,
      onUnresolvedReference,
    );
    if (fileDefinition) {
      return fileDefinition;
    }
    const node = path[path.length - 1];
    if (
      isScalar(node) &&
      new AncestryBuilder(path).parentOfKey().get() // ensure we look at a key, not value of a Pair
    ) {
      if (isTaskParam(path)) {
        const [module] = await docsLibrary.findModule(
          node.value as string,
          path,
          document.uri,
        );
        if (module) {
          const range = getOrigRange(node);
          return [
            {
              targetUri: URI.file(module.source).toString(),
              originSelectionRange: range
                ? toLspRange(range, document)
                : undefined,
              targetRange: Range.create(
                module.sourceLineRange[0],
                0,
                module.sourceLineRange[1],
                0,
              ),
              targetSelectionRange: Range.create(
                module.sourceLineRange[0],
                0,
                module.sourceLineRange[1],
                0,
              ),
            },
          ];
        }
      }
    }
  }
  return null;
}
