import { CompletionItem, CompletionItemKind } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { isScalar, Node, YAMLMap, YAMLSeq, parseDocument } from "yaml";
import { AncestryBuilder, isPlayParam } from "@src/utils/yaml.js";
import { hasOwnProperty, isObject } from "@src/utils/misc.js";
import * as pathUri from "path";
import { existsSync, readFileSync } from "fs";

type varType = { variable: string; priority: number };

const getEnumerableKeys = (value: unknown): string[] =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value)
    : [];

type VarsPromptEntry = {
  name: string;
  prompt: string;
  private?: boolean;
};

function collectVarsKeys(
  varsValue: unknown,
  varPriority: number,
  varsCompletion: varType[],
): void {
  if (Array.isArray(varsValue)) {
    varsValue.forEach((element) => {
      getEnumerableKeys(element).forEach((key) => {
        varsCompletion.push({ variable: key, priority: varPriority });
      });
    });
  } else {
    getEnumerableKeys(varsValue).forEach((key) => {
      varsCompletion.push({ variable: key, priority: varPriority });
    });
  }
}

function isVarsPromptEntry(value: unknown): value is VarsPromptEntry {
  return (
    isObject(value) &&
    hasOwnProperty(value, "name") &&
    typeof value.name === "string"
  );
}

function isVarsPromptArray(value: unknown): value is VarsPromptEntry[] {
  return Array.isArray(value) && value.every(isVarsPromptEntry);
}

function isVarsFilesArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

/**
 * A function that computes the possible variable auto-completions scope-wise for a given position
 * @param documentUri - uri of the document
 * @param path - array of nodes leading to that position
 * @returns a list of completion items
 */
export function getVarsCompletion(
  documentUri: string,
  path: Node[],
): CompletionItem[] {
  const varsCompletion: varType[] = [];
  let varPriority = 0;

  // the loop calculates and traverses till the path reaches the play level from the position where the auto-completion was asked
  while (!isPlayParam(path)) {
    varPriority = varPriority + 1;

    // handle case when it is a dict
    let parentKeyPath = new AncestryBuilder(path)
      .parent(YAMLMap)
      .parent(YAMLMap)
      .getKeyPath();
    if (parentKeyPath) {
      const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];

      if (
        isScalar(parentKeyNode) &&
        typeof parentKeyNode["value"] === "string"
      ) {
        path = parentKeyPath;
        const scopedPathNode = path.at(-3);
        if (scopedPathNode) {
          const scopedNode = scopedPathNode.toJSON() as Record<string, unknown>;
          if (hasOwnProperty(scopedNode, "vars")) {
            collectVarsKeys(scopedNode.vars, varPriority, varsCompletion);
          }
        }

        continue;
      }
    }

    // handle case when it is a list
    parentKeyPath = new AncestryBuilder(path)
      .parent(YAMLMap)
      .parent(YAMLSeq)
      .parent(YAMLMap)
      .getKeyPath();
    if (parentKeyPath) {
      const parentKeyNode = parentKeyPath[parentKeyPath.length - 1];
      if (
        isScalar(parentKeyNode) &&
        typeof parentKeyNode["value"] === "string"
      ) {
        path = parentKeyPath;
        const scopedPathNode = path.at(-3);
        if (scopedPathNode) {
          const scopedNode = scopedPathNode.toJSON() as Record<string, unknown>;
          if (hasOwnProperty(scopedNode, "vars")) {
            collectVarsKeys(scopedNode.vars, varPriority, varsCompletion);
          }
        }

        continue;
      }
    }
  }

  // At this point path is at play level
  // At play level, there are two more ways in which vars can be defined:
  // 1. vars_prompt
  // 2. vars_files

  // handling vars_prompt
  varPriority = varPriority + 1;
  const playPathNode = path.at(-3);
  const playNode = playPathNode
    ? (playPathNode.toJSON() as Record<string, unknown>)
    : undefined;
  if (playNode && hasOwnProperty(playNode, "vars_prompt")) {
    const varsPromptObject = playNode.vars_prompt;
    if (isVarsPromptArray(varsPromptObject)) {
      varsPromptObject.forEach((element) => {
        varsCompletion.push({ variable: element.name, priority: varPriority });
      });
    }
  }

  // handling vars_files
  varPriority = varPriority + 1;
  if (playNode && hasOwnProperty(playNode, "vars_files")) {
    const varsFiles = playNode.vars_files;
    if (isVarsFilesArray(varsFiles)) {
      const currentDirectory = pathUri.dirname(URI.parse(documentUri).path);
      varsFiles.forEach((element) => {
        let varFilePath;
        if (pathUri.isAbsolute(element)) {
          varFilePath = element;
        } else {
          varFilePath = URI.parse(
            pathUri.resolve(currentDirectory, element),
          ).path;
        }

        // read the vars_file and get the variables declared inside it
        if (existsSync(varFilePath)) {
          const file = readFileSync(varFilePath, {
            encoding: "utf8",
          });

          const contents = parseDocument(file).contents;
          if (contents !== null) {
            const yamlDocContent: unknown = contents.toJSON();

            // variables declared in the file should be in list format only
            if (Array.isArray(yamlDocContent)) {
              yamlDocContent.forEach((yamlElement) => {
                if (typeof yamlElement === "object") {
                  getEnumerableKeys(yamlElement).forEach((key) => {
                    varsCompletion.push({
                      variable: key,
                      priority: varPriority,
                    });
                  });
                }
              });
            }
          }
        }
      });
    }
  }

  // return the completions as completion items
  return varsCompletion.map(({ variable, priority }) => {
    const completionItem: CompletionItem = {
      label: variable,
      sortText: `${priority}_${variable}`,
      kind: CompletionItemKind.Variable,
    };
    return completionItem;
  });
}
