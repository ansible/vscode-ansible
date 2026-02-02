import * as yaml from "yaml";
import * as fs from "fs";
import {
  IAnsibleFileType,
  GenerationListEntry,
  RoleFileType,
} from "../../../interfaces/lightspeed";
import { readVarFiles } from "./readVarFiles";
import {
  tasksFileKeywords,
  tasksInPlaybookKeywords,
} from "../../../definitions/lightspeed";

export function shouldRequestInlineSuggestions(
  parsedAnsibleDocument: yaml.YAMLMap[],
  ansibleFileType: IAnsibleFileType,
): boolean {
  const lastObject = parsedAnsibleDocument[parsedAnsibleDocument.length - 1];
  if (typeof lastObject !== "object") {
    return false;
  }

  const objectKeys = Object.keys(lastObject);
  const lastParentKey = objectKeys[objectKeys.length - 1];

  // check if single-task trigger is in play context or not
  if (lastParentKey === "name" && objectKeys.includes("hosts")) {
    return false;
  }

  // check if single-task trigger is in vars context or not
  if (lastParentKey === "vars" || lastParentKey === "vars_files") {
    return false;
  }

  // for file identified as playbook, check single task trigger in task context
  if (
    ansibleFileType === "playbook" &&
    !["tasks", "pre_tasks", "post_tasks", "handlers"].some((key) =>
      objectKeys.includes(key),
    )
  ) {
    return false;
  }
  return true;
}

export function shouldTriggerMultiTaskSuggestion(
  documentContent: string,
  spacesBeforePromptStart: number,
  promptLine: number,
  ansibleFileType: IAnsibleFileType,
): boolean {
  const documentLines = documentContent.trim().split("\n");
  if (ansibleFileType === "playbook") {
    if (
      shouldTriggerMultiTaskSuggestionForPlaybook(
        documentLines,
        spacesBeforePromptStart,
      )
    ) {
      return true;
    } else {
      return false;
    }
  } else {
    if (
      shouldTriggerMultiTaskSuggestionForTaskFile(
        documentLines,
        spacesBeforePromptStart,
        promptLine,
      )
    ) {
      return true;
    } else {
      return false;
    }
  }
}

const matchLine = (
  documentLines: string[],
  indentIndex: number,
  validSuggestionTriggerIndents: number[],
) => {
  const matched = documentLines[indentIndex].match(/^\s*-\s*/);
  if (matched) {
    const indentLength = Math.max(matched[0].length - 2, 0);
    if (validSuggestionTriggerIndents[indentIndex] === -1) {
      validSuggestionTriggerIndents[indentIndex] = indentLength;
    }
    return true;
  }
  return false;
};

function shouldTriggerMultiTaskSuggestionForTaskFile(
  documentLines: string[],
  spacesBeforePromptStart: number,
  linePromptStart: number,
): boolean {
  let firstMatchKeywordIndent = -1;
  const validSuggestionTriggerIndents: number[] = [];
  let matchKeywordIndex = -1;
  for (let lineIndex = 0; lineIndex < documentLines.length; lineIndex++) {
    validSuggestionTriggerIndents.push(-1);
  }
  for (let lineIndex = documentLines.length - 1; lineIndex >= 0; lineIndex--) {
    if (matchKeyword(tasksFileKeywords, documentLines[lineIndex])) {
      const match = documentLines[lineIndex].match(/^\s*/);
      if (firstMatchKeywordIndent === -1) {
        firstMatchKeywordIndent = match ? match[0].length : -1;
      }
      matchKeywordIndex = lineIndex;
      // TODO: Calculate num of whitespaces before keyword.
      validSuggestionTriggerIndents[lineIndex] = 1;
    }
    if (matchKeywordIndex !== -1) {
      let onlyCommentsAfterKeyword = true;
      for (
        let commentIndex = matchKeywordIndex + 1;
        commentIndex < documentLines.length;
        commentIndex++
      ) {
        if (documentLines[commentIndex].trim() === "") {
          continue;
        }
        if (!documentLines[commentIndex].trim().startsWith("#")) {
          onlyCommentsAfterKeyword = false;
          break;
        }
      }
      if (onlyCommentsAfterKeyword) {
        if (spacesBeforePromptStart > firstMatchKeywordIndent) {
          return true;
        } else {
          return false;
        }
      } else {
        for (
          let indentIndex = matchKeywordIndex + 1;
          indentIndex < documentLines.length;
          indentIndex++
        ) {
          if (
            matchLine(documentLines, indentIndex, validSuggestionTriggerIndents)
          ) {
            break;
          }
        }
      }
      matchKeywordIndex = -1;
    }
  }

  let commentOnly = true;
  for (let lineIndex = 0; lineIndex < documentLines.length; lineIndex++) {
    if (
      documentLines[lineIndex].trim() === "" ||
      /^\s*---\s*$/.test(documentLines[lineIndex].trim())
    ) {
      continue;
    }
    if (commentOnly && !documentLines[lineIndex].trim().startsWith("#")) {
      commentOnly = false;
    }
    if (matchLine(documentLines, lineIndex, validSuggestionTriggerIndents)) {
      break;
    }
  }
  if (commentOnly) {
    return true;
  }

  // Check the inline position column is the same as the previous line one
  const linePrompt = linePromptStart - 1;
  const previousLinePrompt = linePrompt - 1;
  const isValidPromptLine = previousLinePrompt > -1;
  if (
    isValidPromptLine &&
    validSuggestionTriggerIndents[previousLinePrompt] ===
      spacesBeforePromptStart
  ) {
    if (previousLinePrompt === 0) {
      return true;
    }
    for (let i = previousLinePrompt - 1; i > -1; i--) {
      const indent = validSuggestionTriggerIndents[i];
      if (indent > -1) {
        if (spacesBeforePromptStart >= indent) {
          return true;
        }
      }
    }
  }

  if (
    firstMatchKeywordIndent === -1 ||
    spacesBeforePromptStart <= firstMatchKeywordIndent
  ) {
    return false;
  }
  return true;
}

function shouldTriggerMultiTaskSuggestionForPlaybook(
  documentLines: string[],
  spacesBeforePromptStart: number,
): boolean {
  let firstMatchKeywordIndent = -1;
  const validSuggestionTriggerIndents: number[] = [];
  let matchKeywordIndex = -1;
  for (let lineIndex = documentLines.length - 1; lineIndex >= 0; lineIndex--) {
    if (matchKeyword(tasksInPlaybookKeywords, documentLines[lineIndex])) {
      const match = documentLines[lineIndex].match(/^\s*/);
      if (firstMatchKeywordIndent === -1) {
        firstMatchKeywordIndent = match ? match[0].length : -1;
      }
      matchKeywordIndex = lineIndex;
    }
    if (matchKeywordIndex !== -1) {
      let onlyCommentsAfterKeyword = true;
      for (
        let commentIndex = matchKeywordIndex + 1;
        commentIndex < documentLines.length;
        commentIndex++
      ) {
        if (documentLines[commentIndex].trim() === "") {
          continue;
        }
        if (!documentLines[commentIndex].trim().startsWith("#")) {
          onlyCommentsAfterKeyword = false;
          break;
        }
      }
      if (onlyCommentsAfterKeyword) {
        if (spacesBeforePromptStart > firstMatchKeywordIndent) {
          return true;
        } else {
          return false;
        }
      } else {
        for (
          let indentIndex = matchKeywordIndex + 1;
          indentIndex < documentLines.length;
          indentIndex++
        ) {
          const matched = documentLines[indentIndex].match(/^\s*-\s*/);
          if (matched) {
            const indentLength = Math.max(matched[0].length - 2, 0);
            if (!validSuggestionTriggerIndents.includes(indentLength)) {
              validSuggestionTriggerIndents.push(indentLength);
            }
            break;
          }
        }
      }
      matchKeywordIndex = -1;
    }
  }
  if (validSuggestionTriggerIndents.length > 0) {
    if (!validSuggestionTriggerIndents.includes(spacesBeforePromptStart)) {
      return false;
    }
  } else {
    if (
      firstMatchKeywordIndent === -1 ||
      spacesBeforePromptStart <= firstMatchKeywordIndent
    ) {
      return false;
    }
  }
  return true;
}

const matchKeyword = (keywordsRegex: RegExp[], line: string) =>
  keywordsRegex.some((keywordRegex) => keywordRegex.test(line));

export async function getRoleYamlFiles(
  rolePath: string,
): Promise<GenerationListEntry[]> {
  const files = [] as GenerationListEntry[];
  const directories = ["defaults", "tasks"];
  directories.forEach(async (dir) => {
    const dirPath = `${rolePath}/${dir}`;
    if (fs.existsSync(dirPath)) {
      const yamlFiles = await fs
        .readdirSync(dirPath)
        .filter((file) => /\.(yml|yaml)$/.test(file));
      yamlFiles.forEach((file) => {
        const fileContents = readVarFiles(`${dirPath}/${file}`);
        if (fileContents) {
          files.push({
            path: `${dir}/${file}`,
            file_type: dir.slice(0, -1) as RoleFileType,
            content: fileContents,
          } as GenerationListEntry);
        }
      });
    }
  });

  return files;
}
