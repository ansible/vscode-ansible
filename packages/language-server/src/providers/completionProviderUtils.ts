import { CompletionItem, CompletionItemKind } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { isScalar, Node, YAMLMap, YAMLSeq, parseDocument } from "yaml";
import { AncestryBuilder, isPlayParam } from "../utils/yaml";
import * as pathUri from "path";
import { existsSync, readFileSync } from "fs";

type VarEntry = { variable: string; priority: number };

interface VarsPromptEntry {
  name: string;
  prompt: string;
  private?: boolean;
}

export function getVarsCompletion(
  documentUri: string,
  path: Node[],
): CompletionItem[] {
  const varsCompletion: VarEntry[] = [];
  let varPriority = 0;

  while (!isPlayParam(path)) {
    varPriority++;

    let parentKeyPath = new AncestryBuilder(path)
      .parent(YAMLMap)
      .parent(YAMLMap)
      .getKeyPath();
    if (parentKeyPath) {
      const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
      if (
        isScalar(parentKeyNode) &&
        typeof parentKeyNode.value === "string"
      ) {
        path = parentKeyPath;
        const scopedNode = path[path.length - 3].toJSON();
        if (Object.prototype.hasOwnProperty.call(scopedNode, "vars")) {
          collectVars(scopedNode.vars, varsCompletion, varPriority);
        }
        continue;
      }
    }

    parentKeyPath = new AncestryBuilder(path)
      .parent(YAMLMap)
      .parent(YAMLSeq)
      .parent(YAMLMap)
      .getKeyPath();
    if (parentKeyPath) {
      const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
      if (
        isScalar(parentKeyNode) &&
        typeof parentKeyNode.value === "string"
      ) {
        path = parentKeyPath;
        const scopedNode = path[path.length - 3].toJSON();
        if (Object.prototype.hasOwnProperty.call(scopedNode, "vars")) {
          collectVars(scopedNode.vars, varsCompletion, varPriority);
        }
        continue;
      }
    }

    break;
  }

  varPriority++;
  const playNode = path[path.length - 3]?.toJSON();
  if (playNode && Object.prototype.hasOwnProperty.call(playNode, "vars_prompt")) {
    const varsPrompt: VarsPromptEntry[] = playNode.vars_prompt;
    for (const entry of varsPrompt) {
      varsCompletion.push({ variable: entry.name, priority: varPriority });
    }
  }

  varPriority++;
  if (playNode && Object.prototype.hasOwnProperty.call(playNode, "vars_files")) {
    const varsFiles: string[] = playNode.vars_files;
    const currentDirectory = pathUri.dirname(URI.parse(documentUri).path);

    for (const element of varsFiles) {
      const varFilePath = pathUri.isAbsolute(element)
        ? element
        : URI.parse(pathUri.resolve(currentDirectory, element)).path;

      if (existsSync(varFilePath)) {
        const file = readFileSync(varFilePath, { encoding: "utf8" });
        const contents = parseDocument(file).contents;
        if (contents) {
          const yamlDocContent = contents.toJSON();
          if (Array.isArray(yamlDocContent)) {
            for (const item of yamlDocContent) {
              if (typeof item === "object" && item !== null) {
                for (const key of Object.keys(item)) {
                  varsCompletion.push({ variable: key, priority: varPriority });
                }
              }
            }
          }
        }
      }
    }
  }

  return varsCompletion.map(({ variable, priority }) => ({
    label: variable,
    sortText: `${priority}_${variable}`,
    kind: CompletionItemKind.Variable,
  }));
}

function collectVars(
  varsObject: unknown,
  result: VarEntry[],
  priority: number,
): void {
  if (Array.isArray(varsObject)) {
    for (const element of varsObject) {
      if (typeof element === "object" && element !== null) {
        for (const key of Object.keys(element)) {
          result.push({ variable: key, priority });
        }
      }
    }
  } else if (typeof varsObject === "object" && varsObject !== null) {
    for (const key of Object.keys(varsObject)) {
      result.push({ variable: key, priority });
    }
  }
}
