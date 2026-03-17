import { Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { readFileSync } from "fs";
import {
  Document,
  isMap,
  isPair,
  isScalar,
  isSeq,
  Node as YamlNode,
  Scalar,
  YAMLMap,
  YAMLSeq,
} from "yaml";
import {
  parseAllDocuments,
  getPathAt,
  AncestryBuilder,
  getOrigRange,
  isRoleParam,
  isTaskParam,
  isCursorInsideJinjaBrackets,
  getYamlMapKeys,
} from "@src/utils/yaml.js";
import { isTaskKeyword } from "@src/utils/ansible.js";
import { toLspRange } from "@src/utils/misc.js";
import {
  getRoleContextFromUri,
  listRoleYamlFiles,
} from "@src/utils/roleResolver.js";

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

// --- Pattern for tasks section keys ---
const tasksKeyPattern =
  /^(tasks|pre_tasks|post_tasks|handlers|block|rescue|always)$/;

// --- Modules that reference files ---
const filePathModules = new Set([
  "include_tasks",
  "ansible.builtin.include_tasks",
  "import_tasks",
  "ansible.builtin.import_tasks",
  "include_vars",
  "ansible.builtin.include_vars",
]);

const fileSrcModules = new Set([
  "template",
  "ansible.builtin.template",
  "copy",
  "ansible.builtin.copy",
  "script",
  "ansible.builtin.script",
  "unarchive",
  "ansible.builtin.unarchive",
]);

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
): AnsibleSymbolOccurrence[] {
  const yamlDocs = parseAllDocuments(document.getText());
  const uri = document.uri;

  switch (kind) {
    case "handler":
      return findHandlerOccurrences(document, yamlDocs, name, uri);
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

export function findAllOccurrencesInRole(
  documentUri: string,
  name: string,
  kind: AnsibleSymbolKind,
): Map<string, AnsibleSymbolOccurrence[]> {
  const result = new Map<string, AnsibleSymbolOccurrence[]>();
  const roleCtx = getRoleContextFromUri(documentUri);

  if (!roleCtx) {
    return result;
  }

  let filePaths: string[] = [];
  if (kind === "handler") {
    filePaths = [
      ...listRoleYamlFiles(roleCtx.rolePath, "tasks"),
      ...listRoleYamlFiles(roleCtx.rolePath, "handlers"),
    ];
  } else if (kind === "variable") {
    const taskFiles = listRoleYamlFiles(roleCtx.rolePath, "tasks");
    const defaultsFile = `${roleCtx.rolePath}/defaults/main.yml`;
    const varsFile = `${roleCtx.rolePath}/vars/main.yml`;
    filePaths = [...taskFiles, defaultsFile, varsFile];
  } else {
    return result;
  }

  // TODO: migrate to async fs when the broader codebase adopts async I/O
  for (const filePath of filePaths) {
    let content: string;
    try {
      content = readFileSync(filePath, { encoding: "utf8" });
    } catch {
      continue;
    }
    const fileUri = URI.file(filePath).toString();
    const doc = TextDocument.create(fileUri, "yaml", 0, content);
    const occurrences = findAllOccurrences(doc, name, kind);

    if (occurrences.length > 0) {
      result.set(fileUri, occurrences);
    }
  }

  return result;
}

// ========================
// getOccurrencesWithRoleContext
// ========================

export function getOccurrencesWithRoleContext(
  documentUri: string,
  document: TextDocument | undefined,
  name: string,
  kind: AnsibleSymbolKind,
): AnsibleSymbolOccurrence[] {
  const roleCtx = getRoleContextFromUri(documentUri);
  if (roleCtx && (kind === "handler" || kind === "variable")) {
    const occurrenceMap = findAllOccurrencesInRole(documentUri, name, kind);
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

// --- set_fact module name variants ---
const setFactModules = new Set([
  "set_fact",
  "ansible.builtin.set_fact",
]);

// --- Keys that contain condition/loop expressions with bare variable names ---
const conditionKeys = new Set([
  "when",
  "loop",
  "until",
  "changed_when",
  "failed_when",
]);

// --- Jinja2 keywords to exclude when extracting variable names from {{ }} ---
const JINJA_KEYWORDS = new Set([
  "true", "false", "none",
  "and", "or", "not", "in", "is", "if", "else",
  "loop", "super", "self", "varargs", "kwargs",
  "import", "recursive", "block", "filter",
]);

/**
 * Collects all symbol definitions in a document (without filtering by name).
 * Used by workspace/symbol to enumerate all definitions.
 */
export function collectAllDefinitions(
  document: TextDocument,
  isHandlerFile = false,
): AnsibleSymbolOccurrence[] {
  const yamlDocs = parseAllDocuments(document.getText());
  const uri = document.uri;
  const definitions: AnsibleSymbolOccurrence[] = [];

  for (const doc of yamlDocs) {
    if (!doc.contents || !isSeq(doc.contents)) continue;
    if (isHandlerFile) {
      // In role handler files, top-level items are handler definitions
      collectHandlerDefinitions(doc.contents, document, uri, definitions);
    } else {
      collectDefinitionsFromSeq(doc.contents, document, uri, definitions);
    }
  }

  // For var files (defaults/main.yml, vars/main.yml) — top-level keys
  for (const doc of yamlDocs) {
    if (!doc.contents || !isMap(doc.contents)) continue;
    for (const pair of doc.contents.items) {
      if (isScalar(pair.key) && typeof pair.key.value === "string") {
        const origRange = getOrigRange(pair.key);
        if (origRange) {
          definitions.push({
            uri,
            range: toLspRange(origRange, document),
            isDefinition: true,
            name: pair.key.value,
          });
        }
      }
    }
  }

  return definitions;
}

function collectDefinitionsFromSeq(
  seq: YAMLSeq,
  document: TextDocument,
  uri: string,
  definitions: AnsibleSymbolOccurrence[],
): void {
  for (const item of seq.items) {
    if (!isMap(item)) continue;

    for (const pair of item.items) {
      if (!isScalar(pair.key)) continue;
      const key = String(pair.key.value);

      // Handler name definition (in handlers section)
      // handlers section — collect handler names
      if (key === "handlers" && isSeq(pair.value)) {
        collectHandlerDefinitions(pair.value, document, uri, definitions);
      }

      // register: <var>
      if (key === "register" && isScalar(pair.value) && typeof pair.value.value === "string") {
        const origRange = getOrigRange(pair.value);
        if (origRange) {
          definitions.push({
            uri,
            range: toLspRange(origRange, document),
            isDefinition: true,
            name: pair.value.value,
          });
        }
      }

      // vars: block — keys are variable definitions
      if (key === "vars" && isMap(pair.value)) {
        for (const varPair of pair.value.items) {
          if (isScalar(varPair.key) && typeof varPair.key.value === "string") {
            const origRange = getOrigRange(varPair.key);
            if (origRange) {
              definitions.push({
                uri,
                range: toLspRange(origRange, document),
                isDefinition: true,
                name: varPair.key.value,
              });
            }
          }
        }
      }

      // vars_prompt: [{name: <var>}]
      if (key === "vars_prompt" && isSeq(pair.value)) {
        for (const promptItem of pair.value.items) {
          if (!isMap(promptItem)) continue;
          for (const promptPair of promptItem.items) {
            if (
              isScalar(promptPair.key) &&
              String(promptPair.key.value) === "name" &&
              isScalar(promptPair.value) &&
              typeof promptPair.value.value === "string"
            ) {
              const origRange = getOrigRange(promptPair.value);
              if (origRange) {
                definitions.push({
                  uri,
                  range: toLspRange(origRange, document),
                  isDefinition: true,
                  name: promptPair.value.value,
                });
              }
            }
          }
        }
      }

      // set_fact / ansible.builtin.set_fact — keys are variable definitions
      if (setFactModules.has(key) && isMap(pair.value)) {
        for (const factPair of pair.value.items) {
          if (isScalar(factPair.key) && typeof factPair.key.value === "string") {
            // Skip "cacheable" which is a set_fact parameter, not a variable
            if (factPair.key.value === "cacheable") continue;
            const origRange = getOrigRange(factPair.key);
            if (origRange) {
              definitions.push({
                uri,
                range: toLspRange(origRange, document),
                isDefinition: true,
                name: factPair.key.value,
              });
            }
          }
        }
      }

      // roles: section — collect role names
      if (key === "roles" && isSeq(pair.value)) {
        collectRoleDefinitions(pair.value, document, uri, definitions);
      }

      // include_role / import_role
      if (
        (key === "include_role" ||
          key === "ansible.builtin.include_role" ||
          key === "import_role" ||
          key === "ansible.builtin.import_role") &&
        isMap(pair.value)
      ) {
        for (const rolePair of pair.value.items) {
          if (
            isScalar(rolePair.key) &&
            String(rolePair.key.value) === "name" &&
            isScalar(rolePair.value) &&
            typeof rolePair.value.value === "string"
          ) {
            const origRange = getOrigRange(rolePair.value);
            if (origRange) {
              definitions.push({
                uri,
                range: toLspRange(origRange, document),
                isDefinition: false,
                name: rolePair.value.value,
              });
            }
          }
        }
      }

      // Recurse into task sections
      if (tasksKeyPattern.test(key) && isSeq(pair.value)) {
        collectDefinitionsFromSeq(pair.value, document, uri, definitions);
      }
    }
  }
}

function collectHandlerDefinitions(
  seq: YAMLSeq,
  document: TextDocument,
  uri: string,
  definitions: AnsibleSymbolOccurrence[],
): void {
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    for (const pair of item.items) {
      if (!isScalar(pair.key)) continue;
      const key = String(pair.key.value);

      if (key === "name" && isScalar(pair.value) && typeof pair.value.value === "string") {
        const origRange = getOrigRange(pair.value);
        if (origRange) {
          definitions.push({
            uri,
            range: toLspRange(origRange, document),
            isDefinition: true,
            name: pair.value.value,
            handlerSource: "name",
          });
        }
      }

      // Recurse into nested blocks within handlers
      if (tasksKeyPattern.test(key) && isSeq(pair.value)) {
        collectHandlerDefinitions(pair.value, document, uri, definitions);
      }
    }
  }
}

function collectRoleDefinitions(
  seq: YAMLSeq,
  document: TextDocument,
  uri: string,
  definitions: AnsibleSymbolOccurrence[],
): void {
  for (const roleItem of seq.items) {
    if (isScalar(roleItem) && typeof roleItem.value === "string") {
      const origRange = getOrigRange(roleItem);
      if (origRange) {
        definitions.push({
          uri,
          range: toLspRange(origRange, document),
          isDefinition: false,
          name: roleItem.value,
        });
      }
    } else if (isMap(roleItem)) {
      for (const rolePair of roleItem.items) {
        if (
          isScalar(rolePair.key) &&
          String(rolePair.key.value) === "role" &&
          isScalar(rolePair.value) &&
          typeof rolePair.value.value === "string"
        ) {
          const origRange = getOrigRange(rolePair.value);
          if (origRange) {
            definitions.push({
              uri,
              range: toLspRange(origRange, document),
              isDefinition: false,
              name: rolePair.value.value,
            });
          }
        }
      }
    }
  }
}

// ========================
// Handler occurrences
// ========================

function findHandlerOccurrences(
  document: TextDocument,
  yamlDocs: Document[],
  name: string,
  uri: string,
): AnsibleSymbolOccurrence[] {
  const occurrences: AnsibleSymbolOccurrence[] = [];
  for (const doc of yamlDocs) {
    if (!doc.contents || !isSeq(doc.contents)) continue;
    walkHandlers(doc.contents, document, name, uri, occurrences);
  }
  return occurrences;
}

function walkHandlers(
  seq: YAMLSeq,
  document: TextDocument,
  name: string,
  uri: string,
  occurrences: AnsibleSymbolOccurrence[],
): void {
  for (const item of seq.items) {
    if (!isMap(item)) continue;

    const mapOffset = getOrigRange(item)?.[0];

    for (const pair of item.items) {
      if (!isScalar(pair.key)) continue;
      const key = String(pair.key.value);

      if (key === "notify") {
        collectScalarOrSeqOccurrences(
          pair.value as YamlNode | null,
          document,
          name,
          uri,
          "notify",
          false,
          occurrences,
          mapOffset,
        );
      } else if (key === "listen") {
        collectScalarOrSeqOccurrences(
          pair.value as YamlNode | null,
          document,
          name,
          uri,
          "listen",
          false,
          occurrences,
          mapOffset,
        );
      } else if (key === "name") {
        if (isScalar(pair.value) && String(pair.value.value) === name) {
          const origRange = getOrigRange(pair.value);
          if (origRange) {
            occurrences.push({
              uri,
              range: toLspRange(origRange, document),
              isDefinition: true,
              name,
              handlerSource: "name",
              handlerMapOffset: mapOffset,
            });
          }
        }
      } else if (tasksKeyPattern.test(key) && isSeq(pair.value)) {
        walkHandlers(pair.value, document, name, uri, occurrences);
      }
    }
  }
}

function collectScalarOrSeqOccurrences(
  node: YamlNode | null,
  document: TextDocument,
  name: string,
  uri: string,
  handlerSource: "notify" | "listen",
  isDefinition: boolean,
  occurrences: AnsibleSymbolOccurrence[],
  handlerMapOffset?: number,
): void {
  if (!node) return;
  if (isScalar(node) && String(node.value) === name) {
    const origRange = getOrigRange(node);
    if (origRange) {
      occurrences.push({
        uri,
        range: toLspRange(origRange, document),
        isDefinition,
        name,
        handlerSource,
        handlerMapOffset,
      });
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      if (isScalar(item) && String(item.value) === name) {
        const origRange = getOrigRange(item);
        if (origRange) {
          occurrences.push({
            uri,
            range: toLspRange(origRange, document),
            isDefinition,
            name,
            handlerSource,
            handlerMapOffset,
          });
        }
      }
    }
  }
}

// ========================
// Variable occurrences
// ========================

function findVariableOccurrences(
  document: TextDocument,
  yamlDocs: Document[],
  name: string,
  uri: string,
): AnsibleSymbolOccurrence[] {
  const occurrences: AnsibleSymbolOccurrence[] = [];
  const seen = new Set<string>();

  for (const doc of yamlDocs) {
    if (!doc.contents) continue;
    // Walk task sequences (playbooks, task files)
    if (isSeq(doc.contents)) {
      walkVariables(doc.contents, document, name, uri, occurrences);
    }
    // Walk top-level map keys (var files: defaults/main.yml, vars/main.yml)
    if (isMap(doc.contents)) {
      for (const pair of doc.contents.items) {
        if (isScalar(pair.key) && String(pair.key.value) === name) {
          const origRange = getOrigRange(pair.key);
          if (origRange) {
            occurrences.push({
              uri,
              range: toLspRange(origRange, document),
              isDefinition: true,
              name,
            });
          }
        }
      }
    }
  }

  // Record positions already found to avoid duplicates
  for (const o of occurrences) {
    seen.add(`${o.range.start.line}:${o.range.start.character}`);
  }

  // Scan for Jinja2 usages: find {{ ... }} blocks, then extract variable identifiers
  const text = document.getText();
  const jinjaBlockPattern = /\{\{-?([\s\S]*?)-?\}\}/g;
  let blockMatch;
  while ((blockMatch = jinjaBlockPattern.exec(text)) !== null) {
    const blockContent = blockMatch[1];
    const blockStart = blockMatch.index + blockMatch[0].indexOf(blockContent);
    // Find identifiers inside the block, skipping filters (after |) and attributes (after .)
    const identPattern = /(?<![.|])\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let identMatch;
    while ((identMatch = identPattern.exec(blockContent)) !== null) {
      if (identMatch[1] !== name) continue;
      if (JINJA_KEYWORDS.has(identMatch[1])) continue;
      const varStart = blockStart + identMatch.index;
      const varEnd = varStart + identMatch[1].length;
      const startPos = document.positionAt(varStart);
      const endPos = document.positionAt(varEnd);
      const key = `${startPos.line}:${startPos.character}`;
      if (!seen.has(key)) {
        seen.add(key);
        occurrences.push({
          uri,
          range: Range.create(startPos, endPos),
          isDefinition: false,
          name,
        });
      }
    }
  }

  // Scan when/loop/with_* values for bare variable names
  scanConditionExpressions(document, yamlDocs, name, uri, occurrences, seen);

  return occurrences;
}

function walkVariables(
  seq: YAMLSeq,
  document: TextDocument,
  name: string,
  uri: string,
  occurrences: AnsibleSymbolOccurrence[],
): void {
  for (const item of seq.items) {
    if (!isMap(item)) continue;

    for (const pair of item.items) {
      if (!isScalar(pair.key)) continue;
      const key = String(pair.key.value);

      // register: <name>
      if (key === "register" && isScalar(pair.value)) {
        if (String(pair.value.value) === name) {
          const origRange = getOrigRange(pair.value);
          if (origRange) {
            occurrences.push({
              uri,
              range: toLspRange(origRange, document),
              isDefinition: true,
              name,
            });
          }
        }
      }

      // vars: block — keys are definitions
      if (key === "vars" && isMap(pair.value)) {
        for (const varPair of pair.value.items) {
          if (isScalar(varPair.key) && String(varPair.key.value) === name) {
            const origRange = getOrigRange(varPair.key);
            if (origRange) {
              occurrences.push({
                uri,
                range: toLspRange(origRange, document),
                isDefinition: true,
                name,
              });
            }
          }
        }
      }

      // vars_prompt: [{name: <name>}]
      if (key === "vars_prompt" && isSeq(pair.value)) {
        for (const promptItem of pair.value.items) {
          if (!isMap(promptItem)) continue;
          for (const promptPair of promptItem.items) {
            if (
              isScalar(promptPair.key) &&
              String(promptPair.key.value) === "name" &&
              isScalar(promptPair.value) &&
              String(promptPair.value.value) === name
            ) {
              const origRange = getOrigRange(promptPair.value);
              if (origRange) {
                occurrences.push({
                  uri,
                  range: toLspRange(origRange, document),
                  isDefinition: true,
                  name,
                });
              }
            }
          }
        }
      }

      // Recurse into task sections
      if (tasksKeyPattern.test(key) && isSeq(pair.value)) {
        walkVariables(pair.value, document, name, uri, occurrences);
      }
    }
  }
}

function scanConditionExpressions(
  document: TextDocument,
  yamlDocs: Document[],
  name: string,
  uri: string,
  occurrences: AnsibleSymbolOccurrence[],
  seen: Set<string>,
): void {
  for (const doc of yamlDocs) {
    if (!doc.contents || !isSeq(doc.contents)) continue;
    walkConditions(doc.contents, document, name, uri, occurrences, seen);
  }
}

function walkConditions(
  seq: YAMLSeq,
  document: TextDocument,
  name: string,
  uri: string,
  occurrences: AnsibleSymbolOccurrence[],
  seen: Set<string>,
): void {
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    for (const pair of item.items) {
      if (!isScalar(pair.key)) continue;
      const key = String(pair.key.value);

      if (conditionKeys.has(key) || key.startsWith("with_")) {
        if (isScalar(pair.value)) {
          findBareVarInExpression(
            pair.value, document, name, uri, occurrences, seen,
          );
        } else if (isSeq(pair.value)) {
          for (const seqItem of pair.value.items) {
            if (isScalar(seqItem)) {
              findBareVarInExpression(
                seqItem, document, name, uri, occurrences, seen,
              );
            }
          }
        }
      }

      if (tasksKeyPattern.test(key) && isSeq(pair.value)) {
        walkConditions(pair.value, document, name, uri, occurrences, seen);
      }
    }
  }
}

function findBareVarInExpression(
  node: Scalar,
  document: TextDocument,
  name: string,
  uri: string,
  occurrences: AnsibleSymbolOccurrence[],
  seen: Set<string>,
): void {
  const value = String(node.value);
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, "g");
  const origRange = getOrigRange(node);
  if (!origRange) return;

  // For quoted scalars, origRange[0] includes the opening quote character
  const quoteOffset =
    node.type === Scalar.QUOTE_SINGLE || node.type === Scalar.QUOTE_DOUBLE
      ? 1
      : 0;

  let match;
  while ((match = pattern.exec(value)) !== null) {
    const absStart = origRange[0] + quoteOffset + match.index;
    const absEnd = absStart + name.length;
    const startPos = document.positionAt(absStart);
    const endPos = document.positionAt(absEnd);
    const key = `${startPos.line}:${startPos.character}`;

    if (!seen.has(key)) {
      seen.add(key);
      occurrences.push({
        uri,
        range: Range.create(startPos, endPos),
        isDefinition: false,
        name,
      });
    }
  }
}

// ========================
// Module occurrences
// ========================

function findModuleOccurrences(
  document: TextDocument,
  yamlDocs: Document[],
  name: string,
  uri: string,
): AnsibleSymbolOccurrence[] {
  const occurrences: AnsibleSymbolOccurrence[] = [];
  for (const doc of yamlDocs) {
    if (!doc.contents || !isSeq(doc.contents)) continue;
    walkModules(doc.contents, document, name, uri, occurrences);
  }
  return occurrences;
}

function walkModules(
  seq: YAMLSeq,
  document: TextDocument,
  name: string,
  uri: string,
  occurrences: AnsibleSymbolOccurrence[],
): void {
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    for (const pair of item.items) {
      if (!isScalar(pair.key)) continue;
      const key = String(pair.key.value);

      if (key === name) {
        const origRange = getOrigRange(pair.key);
        if (origRange) {
          occurrences.push({
            uri,
            range: toLspRange(origRange, document),
            isDefinition: false,
            name,
          });
        }
      }

      if (tasksKeyPattern.test(key) && isSeq(pair.value)) {
        walkModules(pair.value, document, name, uri, occurrences);
      }
    }
  }
}

// ========================
// Role occurrences
// ========================

function findRoleOccurrences(
  document: TextDocument,
  yamlDocs: Document[],
  name: string,
  uri: string,
): AnsibleSymbolOccurrence[] {
  const occurrences: AnsibleSymbolOccurrence[] = [];
  for (const doc of yamlDocs) {
    if (!doc.contents || !isSeq(doc.contents)) continue;
    walkRoles(doc.contents, document, name, uri, occurrences);
  }
  return occurrences;
}

function walkRoles(
  seq: YAMLSeq,
  document: TextDocument,
  name: string,
  uri: string,
  occurrences: AnsibleSymbolOccurrence[],
): void {
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    for (const pair of item.items) {
      if (!isScalar(pair.key)) continue;
      const key = String(pair.key.value);

      // roles: section
      if (key === "roles" && isSeq(pair.value)) {
        for (const roleItem of pair.value.items) {
          if (isScalar(roleItem) && String(roleItem.value) === name) {
            const origRange = getOrigRange(roleItem);
            if (origRange) {
              occurrences.push({
                uri,
                range: toLspRange(origRange, document),
                isDefinition: false,
                name,
              });
            }
          } else if (isMap(roleItem)) {
            for (const rolePair of roleItem.items) {
              if (
                isScalar(rolePair.key) &&
                String(rolePair.key.value) === "role" &&
                isScalar(rolePair.value) &&
                String(rolePair.value.value) === name
              ) {
                const origRange = getOrigRange(rolePair.value);
                if (origRange) {
                  occurrences.push({
                    uri,
                    range: toLspRange(origRange, document),
                    isDefinition: false,
                    name,
                  });
                }
              }
            }
          }
        }
      }

      // include_role / import_role
      if (
        (key === "include_role" ||
          key === "ansible.builtin.include_role" ||
          key === "import_role" ||
          key === "ansible.builtin.import_role") &&
        isMap(pair.value)
      ) {
        for (const rolePair of pair.value.items) {
          if (
            isScalar(rolePair.key) &&
            String(rolePair.key.value) === "name" &&
            isScalar(rolePair.value) &&
            String(rolePair.value.value) === name
          ) {
            const origRange = getOrigRange(rolePair.value);
            if (origRange) {
              occurrences.push({
                uri,
                range: toLspRange(origRange, document),
                isDefinition: false,
                name,
              });
            }
          }
        }
      }

      // Recurse into task sections
      if (tasksKeyPattern.test(key) && isSeq(pair.value)) {
        walkRoles(pair.value, document, name, uri, occurrences);
      }
    }
  }
}

// ========================
// Helpers
// ========================

function isInsideHandlersSection(path: YamlNode[]): boolean {
  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i];
    if (isSeq(node) && i > 0) {
      const parent = path[i - 1];
      if (isPair(parent) && isScalar(parent.key)) {
        if (String(parent.key.value) === "handlers") {
          return true;
        }
      }
    }
  }
  return false;
}

function isVarsKey(path: YamlNode[]): boolean {
  const builder = new AncestryBuilder(path).parentOfKey();
  const varsMap = builder.get();
  if (!varsMap) return false;

  const parentKey = new AncestryBuilder(builder.getPath())
    .parent(YAMLMap)
    .getStringKey();
  return parentKey === "vars";
}

function isVarsPromptName(path: YamlNode[]): boolean {
  const node = path[path.length - 1];
  if (!isScalar(node)) return false;

  const parentNode = path.length >= 2 ? path[path.length - 2] : null;
  if (!parentNode || !isPair(parentNode)) return false;
  if (!isScalar(parentNode.key) || String(parentNode.key.value) !== "name")
    return false;

  // Go up: Pair -> Map -> Seq -> Pair(vars_prompt)
  for (let i = path.length - 3; i >= 0; i--) {
    if (isSeq(path[i]) && i > 0) {
      const parentPairNode = path[i - 1];
      if (
        isPair(parentPairNode) &&
        isScalar(parentPairNode.key) &&
        String(parentPairNode.key.value) === "vars_prompt"
      ) {
        return true;
      }
    }
  }
  return false;
}

function isVarsFilesEntry(path: YamlNode[]): boolean {
  const node = path[path.length - 1];
  if (!isScalar(node)) return false;

  for (let i = path.length - 2; i >= 0; i--) {
    if (isSeq(path[i]) && i > 0) {
      const parentPairNode = path[i - 1];
      if (
        isPair(parentPairNode) &&
        isScalar(parentPairNode.key) &&
        String(parentPairNode.key.value) === "vars_files"
      ) {
        return true;
      }
    }
  }
  return false;
}

function isInNotifyOrListenSeq(
  path: YamlNode[],
): "notify" | "listen" | null {
  const node = path[path.length - 1];
  if (!isScalar(node)) return null;

  for (let i = path.length - 2; i >= 0; i--) {
    if (isSeq(path[i]) && i > 0) {
      const parentPairNode = path[i - 1];
      if (isPair(parentPairNode) && isScalar(parentPairNode.key)) {
        const keyVal = String(parentPairNode.key.value);
        if (keyVal === "notify") return "notify";
        if (keyVal === "listen") return "listen";
      }
    }
  }
  return null;
}

function isSimpleRoleEntry(path: YamlNode[]): boolean {
  const node = path[path.length - 1];
  if (!isScalar(node)) return false;

  for (let i = path.length - 2; i >= 0; i--) {
    if (isSeq(path[i]) && i > 0) {
      const parentPairNode = path[i - 1];
      if (
        isPair(parentPairNode) &&
        isScalar(parentPairNode.key) &&
        String(parentPairNode.key.value) === "roles"
      ) {
        return true;
      }
    }
  }
  return false;
}

export function findParentTaskModuleName(path: YamlNode[]): string | null {
  // Walk up from current position looking for the task-level Map.
  // A task-level Map is one that has at least one task keyword key
  // (name, register, when, notify, etc.) — this distinguishes it
  // from module parameter Maps (which only have param keys like src, dest).
  for (let i = path.length - 1; i >= 0; i--) {
    if (isMap(path[i])) {
      const map = path[i] as YAMLMap;
      const keys = getYamlMapKeys(map);
      const hasTaskKeyword = keys.some((k) => isTaskKeyword(k));
      if (hasTaskKeyword) {
        for (const k of keys) {
          if (!isTaskKeyword(k)) {
            return k;
          }
        }
      }
    }
  }
  return null;
}

function extractJinjaVarName(
  document: TextDocument,
  position: Position,
): string | null {
  const line = document.getText(
    Range.create(position.line, 0, position.line + 1, 0),
  );
  const col = position.character;

  const varPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let match;
  while ((match = varPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[1].length;
    if (col >= start && col <= end) {
      return match[1];
    }
  }
  return null;
}

function findJinjaVarRange(
  document: TextDocument,
  position: Position,
  varName: string,
): Range | null {
  const line = document.getText(
    Range.create(position.line, 0, position.line + 1, 0),
  );
  const col = position.character;

  const varPattern = new RegExp(`\\b${escapeRegex(varName)}\\b`, "g");
  let match;
  while ((match = varPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + varName.length;
    if (col >= start && col <= end) {
      return Range.create(position.line, start, position.line, end);
    }
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
