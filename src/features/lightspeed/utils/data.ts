import * as yaml from "yaml";
import * as fs from "fs";
import {
  IAnsibleFileType,
  GenerationListEntry,
  RoleFileType,
} from "@src/interfaces/lightspeed";
import { readVarFiles } from "@src/features/lightspeed/utils/readVarFiles";
import {
  tasksFileKeywords,
  tasksInPlaybookKeywords,
} from "@src/definitions/lightspeed";

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

/**
 * True if every line after `fromIndex` is blank or a comment.
 */
function hasOnlyCommentsAfter(
  documentLines: string[],
  fromIndex: number,
): boolean {
  for (
    let commentIndex = fromIndex + 1;
    commentIndex < documentLines.length;
    commentIndex++
  ) {
    const trimmed = documentLines[commentIndex].trim();
    if (trimmed === "") {
      continue;
    }
    if (!trimmed.startsWith("#")) {
      return false;
    }
  }
  return true;
}

/**
 * Scan forward from `fromIndex` until the first list item line and record its
 * indent into the per-line `validSuggestionTriggerIndents` map (via matchLine).
 */
function populateIndentsUntilFirstListItem(
  documentLines: string[],
  fromIndex: number,
  validSuggestionTriggerIndents: number[],
): void {
  for (
    let indentIndex = fromIndex + 1;
    indentIndex < documentLines.length;
    indentIndex++
  ) {
    if (matchLine(documentLines, indentIndex, validSuggestionTriggerIndents)) {
      break;
    }
  }
}

/**
 * Backward scan over a task file: locate task-file keywords, record the first
 * keyword indent, mark keyword lines, and populate trigger indents. Returns an
 * early decision for the "only comments after the keyword" case, else null.
 */
function scanTaskFileKeywordsBackward(
  documentLines: string[],
  spacesBeforePromptStart: number,
  validSuggestionTriggerIndents: number[],
): { earlyResult: boolean | null; firstMatchKeywordIndent: number } {
  let firstMatchKeywordIndent = -1;
  let matchKeywordIndex = -1;
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
      if (hasOnlyCommentsAfter(documentLines, matchKeywordIndex)) {
        return {
          earlyResult: spacesBeforePromptStart > firstMatchKeywordIndent,
          firstMatchKeywordIndent,
        };
      }
      populateIndentsUntilFirstListItem(
        documentLines,
        matchKeywordIndex,
        validSuggestionTriggerIndents,
      );
      matchKeywordIndex = -1;
    }
  }
  return { earlyResult: null, firstMatchKeywordIndent };
}

/**
 * True if the document contains only comments (ignoring blanks and "---"),
 * while populating trigger indents up to the first list item.
 */
function isCommentOnlyDocument(
  documentLines: string[],
  validSuggestionTriggerIndents: number[],
): boolean {
  let commentOnly = true;
  for (let lineIndex = 0; lineIndex < documentLines.length; lineIndex++) {
    const trimmed = documentLines[lineIndex].trim();
    if (trimmed === "" || /^\s*---\s*$/.test(trimmed)) {
      continue;
    }
    if (commentOnly && !trimmed.startsWith("#")) {
      commentOnly = false;
    }
    if (matchLine(documentLines, lineIndex, validSuggestionTriggerIndents)) {
      break;
    }
  }
  return commentOnly;
}

/**
 * True if the prompt column lines up with the previous line's recorded indent
 * (or an earlier line whose indent the prompt is at least as deep as).
 */
function matchesPreviousLineColumn(
  validSuggestionTriggerIndents: number[],
  spacesBeforePromptStart: number,
  linePromptStart: number,
): boolean {
  const linePrompt = linePromptStart - 1;
  const previousLinePrompt = linePrompt - 1;
  if (
    previousLinePrompt <= -1 ||
    validSuggestionTriggerIndents[previousLinePrompt] !==
      spacesBeforePromptStart
  ) {
    return false;
  }
  if (previousLinePrompt === 0) {
    return true;
  }
  for (let i = previousLinePrompt - 1; i > -1; i--) {
    const indent = validSuggestionTriggerIndents[i];
    if (indent > -1 && spacesBeforePromptStart >= indent) {
      return true;
    }
  }
  return false;
}

function shouldTriggerMultiTaskSuggestionForTaskFile(
  documentLines: string[],
  spacesBeforePromptStart: number,
  linePromptStart: number,
): boolean {
  const validSuggestionTriggerIndents: number[] = Array.from(
    { length: documentLines.length },
    () => -1,
  );

  const { earlyResult, firstMatchKeywordIndent } = scanTaskFileKeywordsBackward(
    documentLines,
    spacesBeforePromptStart,
    validSuggestionTriggerIndents,
  );
  if (earlyResult !== null) {
    return earlyResult;
  }

  if (isCommentOnlyDocument(documentLines, validSuggestionTriggerIndents)) {
    return true;
  }

  // Check the inline position column is the same as the previous line one
  if (
    matchesPreviousLineColumn(
      validSuggestionTriggerIndents,
      spacesBeforePromptStart,
      linePromptStart,
    )
  ) {
    return true;
  }

  return !(
    firstMatchKeywordIndent === -1 ||
    spacesBeforePromptStart <= firstMatchKeywordIndent
  );
}

/**
 * Scan forward from `fromIndex` for the first list item and record its (unique)
 * indent length into `validSuggestionTriggerIndents`.
 */
function collectFirstListItemIndent(
  documentLines: string[],
  fromIndex: number,
  validSuggestionTriggerIndents: number[],
): void {
  for (
    let indentIndex = fromIndex + 1;
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

/**
 * Backward scan over a playbook: locate in-playbook task keywords, record the
 * first keyword indent, and collect trigger indents. Returns an early decision
 * for the "only comments after the keyword" case, else null.
 */
function scanPlaybookKeywordsBackward(
  documentLines: string[],
  spacesBeforePromptStart: number,
  validSuggestionTriggerIndents: number[],
): { earlyResult: boolean | null; firstMatchKeywordIndent: number } {
  let firstMatchKeywordIndent = -1;
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
      if (hasOnlyCommentsAfter(documentLines, matchKeywordIndex)) {
        return {
          earlyResult: spacesBeforePromptStart > firstMatchKeywordIndent,
          firstMatchKeywordIndent,
        };
      }
      collectFirstListItemIndent(
        documentLines,
        matchKeywordIndex,
        validSuggestionTriggerIndents,
      );
      matchKeywordIndex = -1;
    }
  }
  return { earlyResult: null, firstMatchKeywordIndent };
}

function shouldTriggerMultiTaskSuggestionForPlaybook(
  documentLines: string[],
  spacesBeforePromptStart: number,
): boolean {
  const validSuggestionTriggerIndents: number[] = [];
  const { earlyResult, firstMatchKeywordIndent } = scanPlaybookKeywordsBackward(
    documentLines,
    spacesBeforePromptStart,
    validSuggestionTriggerIndents,
  );
  if (earlyResult !== null) {
    return earlyResult;
  }

  if (validSuggestionTriggerIndents.length > 0) {
    return validSuggestionTriggerIndents.includes(spacesBeforePromptStart);
  }
  return (
    firstMatchKeywordIndent !== -1 &&
    spacesBeforePromptStart > firstMatchKeywordIndent
  );
}

const matchKeyword = (keywordsRegex: RegExp[], line: string) =>
  keywordsRegex.some((keywordRegex) => keywordRegex.test(line));

export async function getRoleYamlFiles(
  rolePath: string,
): Promise<GenerationListEntry[]> {
  const files = [] as GenerationListEntry[];
  const directories = ["defaults", "tasks"];
  for (const dir of directories) {
    const dirPath = `${rolePath}/${dir}`;
    if (fs.existsSync(dirPath)) {
      const yamlFiles = (await fs.promises.readdir(dirPath)).filter((file) =>
        /\.(yml|yaml)$/.test(file),
      );
      for (const file of yamlFiles) {
        const fileContents = readVarFiles(`${dirPath}/${file}`);
        if (fileContents) {
          files.push({
            path: `${dir}/${file}`,
            file_type: dir.slice(0, -1) as RoleFileType,
            content: fileContents,
          });
        }
      }
    }
  }

  return files;
}
