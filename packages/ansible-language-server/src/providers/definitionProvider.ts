import { DefinitionLink, Range } from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { isScalar, Node, YAMLMap, YAMLSeq } from "yaml";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import { isTaskKeyword } from "@src/utils/ansible.js";
import {
  isFileReference,
  isTemplatedValue,
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

type FileRefSpec = NonNullable<ReturnType<typeof isFileReference>>;

interface FileRefContext {
  moduleName: string;
  optionName: string | undefined;
  taskKeyPath: Node[];
  moduleOptions: YAMLMap | null;
  taskArgs: YAMLMap | null;
}

function parseBooleanLike(value: unknown): boolean | undefined {
  if (value === true || value === false) {
    return value;
  }
  if (value === 0 || value === 1) {
    return value === 1;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const lower = value.toLowerCase();
  if (["true", "yes", "on", "1"].includes(lower)) {
    return true;
  }
  if (["false", "no", "off", "0"].includes(lower)) {
    return false;
  }
  return undefined;
}

function isRemoteSource(
  moduleOptions: YAMLMap | null,
  taskArgs: YAMLMap | null,
  remoteByDefault: boolean | undefined,
): boolean {
  const remoteSrcNode =
    moduleOptions?.get("remote_src", true) ?? taskArgs?.get("remote_src", true);
  const remoteSrcValue = isScalar(remoteSrcNode)
    ? remoteSrcNode.value
    : undefined;
  const hasRemoteSrcOption = !!remoteSrcNode;
  const remoteSrc = parseBooleanLike(remoteSrcValue);
  return (
    remoteSrc === true ||
    (hasRemoteSrcOption && remoteSrc === undefined) ||
    (!!remoteByDefault && remoteSrc !== false)
  );
}

function getFileRefContext(path: Node[], node: Node): FileRefContext | null {
  // The value must be the value of a Pair, never a key or a sequence item.
  const owner = new AncestryBuilder(path).parent(YAMLMap);
  const ownerKey = owner.getStringKey();
  if (!ownerKey || owner.getValue() !== node) {
    return null;
  }

  const parentMap = owner.get();
  const grandParent = new AncestryBuilder(path).parent(YAMLMap).parent(YAMLMap);
  const moduleKey = grandParent.getStringKey();

  if (parentMap && moduleKey === "args") {
    const taskMap = grandParent.get();
    const taskKeyPath = grandParent.getPath();
    if (!taskMap || !taskKeyPath) {
      return null;
    }
    const modulePair = taskMap.items.find(
      (pair) =>
        isScalar(pair.key) &&
        typeof pair.key.value === "string" &&
        pair.key.value !== "args" &&
        !isTaskKeyword(pair.key.value),
    );
    if (!modulePair || !isScalar(modulePair.key)) {
      return null;
    }
    const moduleName = String(modulePair.key.value);
    const moduleOptionsNode = taskMap.get(moduleName, true);
    return {
      moduleName,
      optionName: ownerKey,
      taskKeyPath: [
        ...taskKeyPath,
        modulePair as unknown as Node,
        modulePair.key,
      ],
      moduleOptions:
        moduleOptionsNode instanceof YAMLMap ? moduleOptionsNode : null,
      taskArgs: parentMap,
    };
  }

  const taskMap = grandParent.get();
  if (parentMap && moduleKey && taskMap) {
    // `template: { src: x }`: the value belongs to an option of the module
    const taskKeyPath = grandParent.getKeyPath();
    if (!taskKeyPath) {
      return null;
    }
    const taskArgsNode = taskMap.get("args", true);
    return {
      moduleName: moduleKey,
      optionName: ownerKey,
      taskKeyPath,
      moduleOptions: parentMap,
      taskArgs: taskArgsNode instanceof YAMLMap ? taskArgsNode : null,
    };
  }

  // `include_tasks: x`: the value belongs to the task itself (free-form)
  const taskKeyPath = new AncestryBuilder(path).parent(YAMLMap).getKeyPath();
  if (!taskKeyPath) {
    return null;
  }
  return {
    moduleName: ownerKey,
    optionName: undefined,
    taskKeyPath,
    moduleOptions: null,
    taskArgs: null,
  };
}

function isValidTaskPosition(spec: FileRefSpec, taskKeyPath: Node[]): boolean {
  if (spec.topLevelOnly) {
    return (
      new AncestryBuilder(taskKeyPath).parentOfKey().parent(YAMLSeq).getPath()
        ?.length === 1
    );
  }
  return isTaskParam(taskKeyPath);
}

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
  const node = path.at(-1);
  if (!isScalar(node) || typeof node.value !== "string") {
    return null;
  }

  const context = getFileRefContext(path, node);
  if (!context) {
    return null;
  }

  const spec = isFileReference(context.moduleName, context.optionName);
  if (!spec || !isValidTaskPosition(spec, context.taskKeyPath)) {
    return null;
  }

  if (
    isRemoteSource(
      context.moduleOptions,
      context.taskArgs,
      spec.remoteByDefault,
    )
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
    if (reference && !isTemplatedValue(reference)) {
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
