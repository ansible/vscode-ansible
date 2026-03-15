import {
  DocumentSymbol,
  SymbolInformation,
  SymbolKind,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { isMap, isScalar, isSeq, Node, Scalar, YAMLMap, YAMLSeq } from "yaml";
import { playExclusiveKeywords, isTaskKeyword } from "@src/utils/ansible.js";
import {
  getOrigRange,
  getYamlMapKeys,
  parseAllDocuments,
} from "@src/utils/yaml.js";
import { toLspRange } from "@src/utils/misc.js";

const taskSectionKeys =
  /^(tasks|pre_tasks|post_tasks|handlers|block|rescue|always)$/;

export function getDocumentSymbols(
  document: TextDocument,
): DocumentSymbol[] | null {
  const yamlDocs = parseAllDocuments(document.getText());
  if (yamlDocs.length === 0) return null;

  const doc = yamlDocs[0];
  if (!doc.contents || !isSeq(doc.contents)) return null;

  return processRootSequence(doc.contents, document);
}

export function flattenSymbols(
  symbols: DocumentSymbol[],
  uri: string,
): SymbolInformation[] {
  const result: SymbolInformation[] = [];
  for (const s of symbols) {
    result.push({
      name: s.name,
      kind: s.kind,
      location: { uri, range: s.range },
    });
    if (s.children) {
      result.push(...flattenSymbols(s.children, uri));
    }
  }
  return result;
}

function processRootSequence(
  seq: YAMLSeq,
  document: TextDocument,
): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    const keys = getYamlMapKeys(item);
    const isPlay = keys.some((k) => playExclusiveKeywords.has(k));
    if (isPlay) {
      const symbol = createPlaySymbol(item, document);
      if (symbol) symbols.push(symbol);
    } else {
      const symbol = createTaskSymbol(item, document);
      if (symbol) symbols.push(symbol);
    }
  }
  return symbols.length > 0 ? symbols : (null as unknown as DocumentSymbol[]);
}

function createPlaySymbol(
  map: YAMLMap,
  document: TextDocument,
): DocumentSymbol | null {
  const range = nodeToRange(map, document);
  if (!range) return null;

  const name = getScalarValue(map, "name") ?? getPlayFallbackName(map);
  const selectionRange = getKeyRange(map, "name", document) ?? range;

  const children: DocumentSymbol[] = [];

  for (const pair of map.items) {
    if (!isScalar(pair.key)) continue;
    const key = String(pair.key.value);

    if (key === "roles" && isSeq(pair.value)) {
      const sectionSymbol = createSectionSymbol(
        key,
        pair.key,
        pair.value,
        document,
        processRoles,
      );
      if (sectionSymbol) children.push(sectionSymbol);
    } else if (taskSectionKeys.test(key) && isSeq(pair.value)) {
      const sectionSymbol = createSectionSymbol(
        key,
        pair.key,
        pair.value,
        document,
        processTaskList,
      );
      if (sectionSymbol) children.push(sectionSymbol);
    }
  }

  return DocumentSymbol.create(
    name,
    undefined,
    SymbolKind.Struct,
    range,
    selectionRange,
    children.length > 0 ? children : undefined,
  );
}

function createSectionSymbol(
  name: string,
  keyNode: Scalar,
  valueNode: YAMLSeq,
  document: TextDocument,
  processor: (seq: YAMLSeq, document: TextDocument) => DocumentSymbol[],
): DocumentSymbol | null {
  const valueRange = nodeToRange(valueNode, document);
  const keyRange = nodeToRange(keyNode, document);
  if (!valueRange || !keyRange) return null;

  // Section range spans from key to end of value
  const sectionRange = { start: keyRange.start, end: valueRange.end };
  const sectionChildren = processor(valueNode, document);

  return DocumentSymbol.create(
    name,
    undefined,
    SymbolKind.Field,
    sectionRange,
    keyRange,
    sectionChildren.length > 0 ? sectionChildren : undefined,
  );
}

function processTaskList(
  seq: YAMLSeq,
  document: TextDocument,
): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    const symbol = createTaskSymbol(item, document);
    if (symbol) symbols.push(symbol);
  }
  return symbols;
}

function createTaskSymbol(
  map: YAMLMap,
  document: TextDocument,
): DocumentSymbol | null {
  const range = nodeToRange(map, document);
  if (!range) return null;

  const keys = getYamlMapKeys(map);
  const isBlock = keys.includes("block");

  if (isBlock) {
    return createBlockSymbol(map, document, range);
  }

  const name = getScalarValue(map, "name") ?? getTaskModuleName(map) ?? "Task";
  const selectionRange = getKeyRange(map, "name", document) ?? range;

  return DocumentSymbol.create(
    name,
    undefined,
    SymbolKind.Function,
    range,
    selectionRange,
  );
}

function createBlockSymbol(
  map: YAMLMap,
  document: TextDocument,
  range: ReturnType<typeof toLspRange>,
): DocumentSymbol {
  const blockName = getScalarValue(map, "name");
  const name = blockName ? `block: ${blockName}` : "block";
  const selectionRange =
    getKeyRange(map, "name", document) ??
    getKeyRange(map, "block", document) ??
    range;

  const children: DocumentSymbol[] = [];
  for (const pair of map.items) {
    if (!isScalar(pair.key)) continue;
    const key = String(pair.key.value);
    if (/^(block|rescue|always)$/.test(key) && isSeq(pair.value)) {
      const sectionSymbol = createSectionSymbol(
        key,
        pair.key,
        pair.value,
        document,
        processTaskList,
      );
      if (sectionSymbol) children.push(sectionSymbol);
    }
  }

  return DocumentSymbol.create(
    name,
    undefined,
    SymbolKind.Namespace,
    range,
    selectionRange,
    children.length > 0 ? children : undefined,
  );
}

function processRoles(seq: YAMLSeq, document: TextDocument): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  for (const item of seq.items) {
    if (isScalar(item)) {
      // Simple role reference: `- role_name`
      const range = nodeToRange(item, document);
      if (range) {
        symbols.push(
          DocumentSymbol.create(
            String(item.value),
            undefined,
            SymbolKind.Package,
            range,
            range,
          ),
        );
      }
    } else if (isMap(item)) {
      // Role with params: `- role: role_name`
      const range = nodeToRange(item, document);
      if (!range) continue;
      const roleName =
        getScalarValue(item, "role") ?? getScalarValue(item, "name") ?? "Role";
      const selectionRange =
        getKeyRange(item, "role", document) ??
        getKeyRange(item, "name", document) ??
        range;
      symbols.push(
        DocumentSymbol.create(
          roleName,
          undefined,
          SymbolKind.Package,
          range,
          selectionRange,
        ),
      );
    }
  }
  return symbols;
}

function getTaskModuleName(map: YAMLMap): string | null {
  for (const pair of map.items) {
    if (!isScalar(pair.key)) continue;
    const key = String(pair.key.value);
    if (!isTaskKeyword(key)) {
      return key;
    }
  }
  return null;
}

function getScalarValue(map: YAMLMap, key: string): string | null {
  for (const pair of map.items) {
    if (isScalar(pair.key) && pair.key.value === key && isScalar(pair.value)) {
      return String(pair.value.value);
    }
  }
  return null;
}

function getPlayFallbackName(map: YAMLMap): string {
  const hosts = getScalarValue(map, "hosts");
  return hosts ? `Play [hosts: ${hosts}]` : "Play";
}

function nodeToRange(node: Node, document: TextDocument) {
  const range = getOrigRange(node);
  if (!range) return null;
  return toLspRange(range, document);
}

function getKeyRange(map: YAMLMap, key: string, document: TextDocument) {
  for (const pair of map.items) {
    if (isScalar(pair.key) && pair.key.value === key) {
      // Use the value node range for selection if available
      if (isScalar(pair.value)) {
        return nodeToRange(pair.value, document);
      }
      return nodeToRange(pair.key, document);
    }
  }
  return null;
}
