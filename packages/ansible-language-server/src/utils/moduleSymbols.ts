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
import { getOrigRange, getYamlMapKeys } from "@src/utils/yaml.js";
import { isTaskKeyword, taskSectionKeyPattern } from "@src/utils/ansible.js";
import { toLspRange } from "@src/utils/misc.js";
import type { AnsibleSymbolOccurrence } from "@src/utils/ansibleSymbols.js";

// --- Modules that reference files ---
export const filePathModules = new Set([
  "include_tasks",
  "ansible.builtin.include_tasks",
  "import_tasks",
  "ansible.builtin.import_tasks",
  "include_vars",
  "ansible.builtin.include_vars",
]);

export const fileSrcModules = new Set([
  "template",
  "ansible.builtin.template",
  "copy",
  "ansible.builtin.copy",
  "script",
  "ansible.builtin.script",
  "unarchive",
  "ansible.builtin.unarchive",
]);

export function findModuleOccurrences(
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

export function findRoleOccurrences(
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

export function isSimpleRoleEntry(path: YamlNode[]): boolean {
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

      if (taskSectionKeyPattern.test(key) && isSeq(pair.value)) {
        walkModules(pair.value, document, name, uri, occurrences);
      }
    }
  }
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
      if (taskSectionKeyPattern.test(key) && isSeq(pair.value)) {
        walkRoles(pair.value, document, name, uri, occurrences);
      }
    }
  }
}
