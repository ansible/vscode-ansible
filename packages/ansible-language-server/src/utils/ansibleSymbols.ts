import { Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { readFile } from "fs/promises";
import {
  Document,
  isScalar,
  isPair,
} from "yaml";
import {
  parseAllDocuments,
  getPathAt,
  AncestryBuilder,
  getOrigRange,
  isRoleParam,
  isTaskParam,
  isCursorInsideJinjaBrackets,
} from "@src/utils/yaml.js";
import { isTaskKeyword } from "@src/utils/ansible.js";
import { toLspRange } from "@src/utils/misc.js";
import {
  getRoleContextFromUri,
  listRoleYamlFiles,
} from "@src/utils/roleResolver.js";

// Domain modules
import {
  findHandlerOccurrences,
  isInsideHandlersSection,
  isInNotifyOrListenSeq,
} from "@src/utils/handlerSymbols.js";
import {
  findVariableOccurrences,
  isVarsKey,
  isVarsPromptName,
  isVarsFilesEntry,
  extractJinjaVarName,
  findJinjaVarRange,
} from "@src/utils/variableSymbols.js";
import {
  findModuleOccurrences,
  findRoleOccurrences,
  filePathModules,
  fileSrcModules,
  isSimpleRoleEntry,
  findParentTaskModuleName,
} from "@src/utils/moduleSymbols.js";
// --- Re-exports for backward compatibility ---
export { collectAllDefinitions } from "@src/utils/symbolDefinitions.js";
export { findParentTaskModuleName } from "@src/utils/moduleSymbols.js";

// --- Types ---

export type AnsibleSymbolKind =
  | "handler"
  | "variable"
  | "module"
  | "filePath"
  | "role";

export interface AnsibleSymbolOccurrence {
  uri: string;
  range: Range;
  isDefinition: boolean;
  name: string;
  handlerSource?: "name" | "notify" | "listen";
  handlerMapOffset?: number;
}

export interface SymbolAtPosition {
  name: string;
  kind: AnsibleSymbolKind;
  range: Range;
  handlerSource?: "name" | "notify" | "listen";
}

// ========================
// getSymbolAtPosition
// ========================

export function getSymbolAtPosition(
  document: TextDocument,
  position: Position,
  precomputedYamlDocs?: Document[],
): SymbolAtPosition | null {
  const yamlDocs = precomputedYamlDocs ?? parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (!path) return null;

  const node = path[path.length - 1];
  if (!isScalar(node) || typeof node.value !== "string") return null;

  const nodeValue = node.value;
  const origRange = getOrigRange(node);
  if (!origRange) return null;
  const range = toLspRange(origRange, document);

  // Check if cursor is inside Jinja2 brackets {{ }}
  if (isCursorInsideJinjaBrackets(document, position, path)) {
    const varName = extractJinjaVarName(document, position);
    if (varName) {
      const varRange = findJinjaVarRange(document, position, varName);
      return {
        name: varName,
        kind: "variable",
        range: varRange ?? range,
      };
    }
  }

  // Check parent key context — is this a VALUE of some key?
  const parentPairNode = path.length >= 2 ? path[path.length - 2] : null;
  if (parentPairNode && isPair(parentPairNode)) {
    const pairKey = parentPairNode.key;
    if (isScalar(pairKey) && typeof pairKey.value === "string") {
      const key = pairKey.value;

      // notify / listen → handler
      if (key === "notify") {
        return {
          name: nodeValue,
          kind: "handler",
          range,
          handlerSource: "notify",
        };
      }
      if (key === "listen") {
        return {
          name: nodeValue,
          kind: "handler",
          range,
          handlerSource: "listen",
        };
      }

      // register → variable
      if (key === "register") {
        return { name: nodeValue, kind: "variable", range };
      }

      // name in handlers section → handler
      if (key === "name" && isInsideHandlersSection(path)) {
        return {
          name: nodeValue,
          kind: "handler",
          range,
          handlerSource: "name",
        };
      }

      // include_tasks / import_tasks direct value
      if (filePathModules.has(key)) {
        return { name: nodeValue, kind: "filePath", range };
      }

      // src/file parameter of file modules
      if (key === "src" || key === "file") {
        const moduleKey = findParentTaskModuleName(path);
        if (
          moduleKey &&
          (fileSrcModules.has(moduleKey) ||
            (key === "file" && filePathModules.has(moduleKey)))
        ) {
          return { name: nodeValue, kind: "filePath", range };
        }
      }

      // role name in roles section or include_role/import_role
      if (key === "role" && isRoleParam(path)) {
        return { name: nodeValue, kind: "role", range };
      }
      if (key === "name") {
        const moduleKey = findParentTaskModuleName(path);
        if (
          moduleKey === "include_role" ||
          moduleKey === "ansible.builtin.include_role" ||
          moduleKey === "import_role" ||
          moduleKey === "ansible.builtin.import_role"
        ) {
          return { name: nodeValue, kind: "role", range };
        }
      }
    }
  }

  // Check if it's a key in a vars: block → variable definition
  if (isVarsKey(path)) {
    return { name: nodeValue, kind: "variable", range };
  }

  // Check if it's a vars_prompt name
  if (isVarsPromptName(path)) {
    return { name: nodeValue, kind: "variable", range };
  }

  // Check if it's a vars_files entry
  if (isVarsFilesEntry(path)) {
    return { name: nodeValue, kind: "filePath", range };
  }

  // Check if in a notify list (YAMLSeq under notify key)
  const notifySeqCheck = isInNotifyOrListenSeq(path);
  if (notifySeqCheck) {
    return {
      name: nodeValue,
      kind: "handler",
      range,
      handlerSource: notifySeqCheck,
    };
  }

  // Check if role name in simple roles list (roles: [rolename])
  if (isSimpleRoleEntry(path)) {
    return { name: nodeValue, kind: "role", range };
  }

  // Task key → module (must be after all keyword checks)
  if (isTaskParam(path) && !isTaskKeyword(nodeValue)) {
    const keyMap = new AncestryBuilder(path).parentOfKey().get();
    if (keyMap) {
      return { name: nodeValue, kind: "module", range };
    }
  }

  return null;
}

// ========================
// findAllOccurrences
// ========================

export function findAllOccurrences(
  document: TextDocument,
  name: string,
  kind: AnsibleSymbolKind,
  isHandlerFile = false,
): AnsibleSymbolOccurrence[] {
  const yamlDocs = parseAllDocuments(document.getText());
  const uri = document.uri;

  switch (kind) {
    case "handler":
      return findHandlerOccurrences(document, yamlDocs, name, uri, isHandlerFile);
    case "variable":
      return findVariableOccurrences(document, yamlDocs, name, uri);
    case "module":
      return findModuleOccurrences(document, yamlDocs, name, uri);
    case "role":
      return findRoleOccurrences(document, yamlDocs, name, uri);
    default:
      return [];
  }
}

// ========================
// findAllOccurrencesInRole
// ========================

export async function findAllOccurrencesInRole(
  documentUri: string,
  name: string,
  kind: AnsibleSymbolKind,
  rolesPaths?: string[],
): Promise<Map<string, AnsibleSymbolOccurrence[]>> {
  const result = new Map<string, AnsibleSymbolOccurrence[]>();
  const roleCtx = getRoleContextFromUri(documentUri, rolesPaths);

  if (!roleCtx) {
    return result;
  }

  let filePaths: string[] = [];
  let handlerFiles: Set<string> | undefined;
  if (kind === "handler") {
    const taskPaths = await listRoleYamlFiles(roleCtx.rolePath, "tasks");
    const handlerPaths = await listRoleYamlFiles(roleCtx.rolePath, "handlers");
    handlerFiles = new Set(handlerPaths);
    filePaths = [...taskPaths, ...handlerPaths];
  } else if (kind === "variable") {
    const taskFiles = await listRoleYamlFiles(roleCtx.rolePath, "tasks");
    const defaultsFile = `${roleCtx.rolePath}/defaults/main.yml`;
    const varsFile = `${roleCtx.rolePath}/vars/main.yml`;
    filePaths = [...taskFiles, defaultsFile, varsFile];
  } else {
    return result;
  }

  for (const filePath of filePaths) {
    let content: string;
    try {
      content = await readFile(filePath, { encoding: "utf8" });
    } catch {
      continue;
    }
    const fileUri = URI.file(filePath).toString();
    const doc = TextDocument.create(fileUri, "yaml", 0, content);
    const isHandlerFile = handlerFiles?.has(filePath) ?? false;
    const occurrences = findAllOccurrences(doc, name, kind, isHandlerFile);

    if (occurrences.length > 0) {
      result.set(fileUri, occurrences);
    }
  }

  return result;
}

// ========================
// getOccurrencesWithRoleContext
// ========================

export async function getOccurrencesWithRoleContext(
  documentUri: string,
  document: TextDocument | undefined,
  name: string,
  kind: AnsibleSymbolKind,
  rolesPaths?: string[],
): Promise<AnsibleSymbolOccurrence[]> {
  const roleCtx = getRoleContextFromUri(documentUri, rolesPaths);
  if (roleCtx && (kind === "handler" || kind === "variable")) {
    const occurrenceMap = await findAllOccurrencesInRole(documentUri, name, kind, rolesPaths);
    const result: AnsibleSymbolOccurrence[] = [];
    for (const [, occs] of occurrenceMap) {
      result.push(...occs);
    }
    return result;
  }
  if (document) {
    return findAllOccurrences(document, name, kind);
  }
  return [];
}
