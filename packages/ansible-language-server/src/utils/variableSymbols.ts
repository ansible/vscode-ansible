import { Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
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
  AncestryBuilder,
  getOrigRange,
} from "@src/utils/yaml.js";
import { taskSectionKeyPattern } from "@src/utils/ansible.js";
import { escapeRegex, toLspRange } from "@src/utils/misc.js";
import type { AnsibleSymbolOccurrence } from "@src/utils/ansibleSymbols.js";

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

export { setFactModules, conditionKeys, JINJA_KEYWORDS };

export function findVariableOccurrences(
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

export function isVarsKey(path: YamlNode[]): boolean {
  const builder = new AncestryBuilder(path).parentOfKey();
  const varsMap = builder.get();
  if (!varsMap) return false;

  const parentKey = new AncestryBuilder(builder.getPath())
    .parent(YAMLMap)
    .getStringKey();
  return parentKey === "vars";
}

export function isVarsPromptName(path: YamlNode[]): boolean {
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

export function isVarsFilesEntry(path: YamlNode[]): boolean {
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

export function extractJinjaVarName(
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

export function findJinjaVarRange(
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
      if (taskSectionKeyPattern.test(key) && isSeq(pair.value)) {
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

      if (taskSectionKeyPattern.test(key) && isSeq(pair.value)) {
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
