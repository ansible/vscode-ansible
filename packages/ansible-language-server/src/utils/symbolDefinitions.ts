import { TextDocument } from "vscode-languageserver-textdocument";
import {
  isMap,
  isScalar,
  isSeq,
  YAMLSeq,
} from "yaml";
import { parseAllDocuments, getOrigRange } from "@src/utils/yaml.js";
import { toLspRange } from "@src/utils/misc.js";
import type { AnsibleSymbolOccurrence } from "@src/utils/ansibleSymbols.js";
import { taskSectionKeyPattern } from "@src/utils/ansible.js";
import { collectHandlerDefinitions } from "@src/utils/handlerSymbols.js";
import { setFactModules } from "@src/utils/variableSymbols.js";

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

export function collectDefinitionsFromSeq(
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
      if (taskSectionKeyPattern.test(key) && isSeq(pair.value)) {
        collectDefinitionsFromSeq(pair.value, document, uri, definitions);
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
