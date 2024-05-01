import { CompletionItem, CompletionItemKind } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { isScalar, Node, YAMLMap, YAMLSeq } from "yaml";
import { AncestryBuilder, isPlayParam } from "../utils/yaml";
import * as pathUri from "path";
import { existsSync, readFileSync } from "fs";
import { parseDocument } from "yaml";

type varType = { variable: string; priority: number };

type varsPromptType = {
  name: string;
  prompt: string;
  private?: boolean;
};

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
        const scopedNode = path[path.length - 3].toJSON();
        if (Object.prototype.hasOwnProperty.call(scopedNode, "vars")) {
          const varsObject = scopedNode["vars"];

          if (Array.isArray(varsObject)) {
            varsObject.forEach((element) => {
              Object.keys(element).forEach((key) => {
                varsCompletion.push({ variable: key, priority: varPriority });
              });
            });
          } else {
            Object.keys(varsObject).forEach((key) => {
              varsCompletion.push({ variable: key, priority: varPriority });
            });
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
        const scopedNode = path[path.length - 3].toJSON();
        if (Object.prototype.hasOwnProperty.call(scopedNode, "vars")) {
          const varsObject = scopedNode["vars"];

          if (Array.isArray(varsObject)) {
            varsObject.forEach((element) => {
              Object.keys(element).forEach((key) => {
                varsCompletion.push({ variable: key, priority: varPriority });
              });
            });
          } else {
            Object.keys(varsObject).forEach((key) => {
              varsCompletion.push({ variable: key, priority: varPriority });
            });
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
  const playNode = path[path.length - 3].toJSON();
  if (Object.prototype.hasOwnProperty.call(playNode, "vars_prompt")) {
    const varsPromptObject: varsPromptType[] = playNode["vars_prompt"];

    varsPromptObject.forEach((element) => {
      varsCompletion.push({ variable: element["name"], priority: varPriority });
    });
  }

  // handling vars_files
  varPriority = varPriority + 1;
  if (Object.prototype.hasOwnProperty.call(playNode, "vars_files")) {
    const varsPromptObject: string[] = playNode["vars_files"];

    const currentDirectory = pathUri.dirname(URI.parse(documentUri).path);
    varsPromptObject.forEach((element) => {
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
          const yamlDocContent = contents.toJSON();

          // variables declared in the file should be in list format only
          if (Array.isArray(yamlDocContent)) {
            yamlDocContent.forEach((element) => {
              if (typeof element === "object") {
                Object.keys(element).forEach((key) => {
                  varsCompletion.push({ variable: key, priority: varPriority });
                });
              }
            });
          }
        }
      }
    });
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
