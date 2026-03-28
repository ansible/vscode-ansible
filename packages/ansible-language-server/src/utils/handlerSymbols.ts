import { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  Document,
  isMap,
  isPair,
  isScalar,
  isSeq,
  Node as YamlNode,
  YAMLMap,
  YAMLSeq,
} from "yaml";
import { getOrigRange } from "@src/utils/yaml.js";
import { taskSectionKeyPattern } from "@src/utils/ansible.js";
import { toLspRange } from "@src/utils/misc.js";
import type { AnsibleSymbolOccurrence } from "@src/utils/ansibleSymbols.js";

export function findHandlerOccurrences(
  document: TextDocument,
  yamlDocs: Document[],
  name: string,
  uri: string,
  isHandlerFile = false,
): AnsibleSymbolOccurrence[] {
  const occurrences: AnsibleSymbolOccurrence[] = [];
  for (const doc of yamlDocs) {
    if (!doc.contents || !isSeq(doc.contents)) continue;
    walkHandlers(doc.contents, document, name, uri, occurrences, isHandlerFile);
  }
  return occurrences;
}

export function collectHandlerDefinitions(
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
      if (taskSectionKeyPattern.test(key) && isSeq(pair.value)) {
        collectHandlerDefinitions(pair.value, document, uri, definitions);
      }
    }
  }
}

export function isInsideHandlersSection(path: YamlNode[]): boolean {
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

export function isInNotifyOrListenSeq(
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

function walkHandlers(
  seq: YAMLSeq,
  document: TextDocument,
  name: string,
  uri: string,
  occurrences: AnsibleSymbolOccurrence[],
  inHandlersSection = false,
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
      } else if (key === "name" && inHandlersSection) {
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
      } else if (key === "handlers" && isSeq(pair.value)) {
        walkHandlers(pair.value, document, name, uri, occurrences, true);
      } else if (taskSectionKeyPattern.test(key) && isSeq(pair.value)) {
        walkHandlers(pair.value, document, name, uri, occurrences, false);
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
