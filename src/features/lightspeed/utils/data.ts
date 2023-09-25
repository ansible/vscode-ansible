import * as vscode from "vscode";
import * as yaml from "yaml";
import * as path from "path";
import * as fs from "fs";
import { getExpandedPath } from "../../../utils/fileUtils";
import { IParsedYaml } from "../../../interfaces/yaml";
import {
  IVarsFileContext,
  IWorkSpaceRolesContext,
  IVarsContext,
  IIncludeVarsContext,
  IAnsibleFileType,
} from "../../../interfaces/lightspeed";
import { watchAnsibleFile } from "./watchers";
import { LightSpeedManager } from "../base";
import { VarType } from "../../../interfaces/lightspeed";
import {
  IncludeVarValidTaskName,
  StandardRolePaths,
} from "../../../definitions/constants";
import {
  tasksFileKeywords,
  tasksInPlaybookKeywords,
} from "../../../definitions/lightspeed";

export function shouldRequestInlineSuggestions(
  parsedAnsibleDocument: yaml.YAMLMap[]
): boolean {
  const lastObject = parsedAnsibleDocument[parsedAnsibleDocument.length - 1];
  if (typeof lastObject !== "object") {
    return false;
  }
  // for the last entry in list check if the inline suggestion
  // triggered is in Ansible play context by checking for "hosts" keyword.
  const objectKeys = Object.keys(lastObject);
  if (
    objectKeys[objectKeys.length - 1] === "name" &&
    objectKeys.includes("hosts")
  ) {
    return false;
  }

  return true;
}

export function getVarsFilesContext(
  lightSpeedManager: LightSpeedManager,
  parsedAnsibleDocument: yaml.YAMLMap[],
  basePath: string
): IVarsFileContext | undefined {
  const varFilesContext: IVarsFileContext = {};
  // Check if the last play in parsedAnsibleDocument has a vars_files key
  const lastObject = parsedAnsibleDocument[parsedAnsibleDocument.length - 1];
  if (!("vars_files" in lastObject)) {
    return undefined;
  }
  // Extract the contents of the files specified in the vars_files key
  let varsFiles: string[] | string = <string[] | string>(
    lastObject["vars_files"]
  );
  if (!Array.isArray(varsFiles)) {
    varsFiles = [varsFiles];
  }
  for (const varFile of varsFiles) {
    let expandedVarFilePath = varFile;
    if (!path.isAbsolute(varFile)) {
      expandedVarFilePath = path.join(basePath, varFile);
    }
    expandedVarFilePath = getExpandedPath(expandedVarFilePath);
    if (!fs.existsSync(expandedVarFilePath)) {
      console.debug(`File ${expandedVarFilePath} does not exist.`);
      if (expandedVarFilePath in lightSpeedManager.ansibleVarFilesCache) {
        delete lightSpeedManager.ansibleVarFilesCache[expandedVarFilePath];
      }
      continue;
    }
    if (expandedVarFilePath in lightSpeedManager.ansibleVarFilesCache) {
      varFilesContext[varFile] =
        lightSpeedManager.ansibleVarFilesCache[expandedVarFilePath];
    } else {
      try {
        const updatedFileContents = readVarFiles(expandedVarFilePath);
        if (!updatedFileContents) {
          return;
        }
        lightSpeedManager.ansibleVarFilesCache[expandedVarFilePath] =
          updatedFileContents;
        varFilesContext[varFile] = updatedFileContents;
        watchAnsibleFile(lightSpeedManager, expandedVarFilePath, "vars_files");
      } catch (err) {
        console.error(`Failed to parse ${varFile} with error ${err}`);
      }
    }
  }
  return varFilesContext;
}

export function getIncludeVarsContext(
  lightSpeedManager: LightSpeedManager,
  parsedAnsibleDocument: yaml.YAMLMap[],
  basePath: string,
  ansibleFileType: string
): IIncludeVarsContext | undefined {
  let tasksLists: [] = [];
  const includeVarsContext: IIncludeVarsContext = {};
  if (ansibleFileType === "playbook") {
    // Check if the last play in parsedAnsibleDocument has a vars_files key
    const lastObject = parsedAnsibleDocument[parsedAnsibleDocument.length - 1];
    if (!("tasks" in lastObject)) {
      return undefined;
    }
    // Extract the contents of the files specified in the vars_files key
    tasksLists = <[]>lastObject["tasks"];
  } else if (
    ansibleFileType === "tasks_in_role" ||
    ansibleFileType === "tasks"
  ) {
    tasksLists = <[]>parsedAnsibleDocument;
  }
  if (!Array.isArray(tasksLists)) {
    return undefined;
  }
  for (const task of tasksLists) {
    const matchingKey = Object.keys(task).find((key) =>
      IncludeVarValidTaskName.includes(key)
    );
    if (!matchingKey) {
      continue;
    }
    const includeVarsTask = task[matchingKey];
    let includeVarsFiles = [];
    if ("file" in includeVarsTask) {
      if (Array.isArray(includeVarsTask["file"])) {
        includeVarsFiles.push(...(<[]>includeVarsTask["file"]));
      } else {
        includeVarsFiles.push(includeVarsTask["file"]);
      }
    } else if ("dir" in includeVarsTask) {
      const dirs = Array.isArray(includeVarsTask["dir"])
        ? includeVarsTask["dir"]
        : [includeVarsTask["dir"]];
      for (const dir of dirs) {
        let dirPath = <string>dir;
        if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) {
          continue;
        }
        if (!path.isAbsolute(dirPath)) {
          if (ansibleFileType === "tasks_in_role") {
            dirPath = path.join(basePath, "vars", dir);
          } else {
            dirPath = path.join(basePath, dir);
          }
        }
        const files = fs
          .readdirSync(dirPath)
          .filter((file) => {
            return file.endsWith(".yml") || file.endsWith(".yaml");
          })
          .slice(0, 10);

        if ("files_matching" in task) {
          const matchingFiles = files.filter((file) => {
            return path.basename(file) === task["files_matching"];
          });
          includeVarsFiles.push(
            ...matchingFiles.map((file) => path.join(dirPath, file))
          );
        } else {
          includeVarsFiles.push(
            ...files.map((file) => path.join(dirPath, file))
          );
        }
      }
    }
    if ("ignore_files" in task) {
      const ignoreFiles = Array.isArray(task["ignore_files"])
        ? task["ignore_files"]
        : [task["ignore_files"]];
      includeVarsFiles = includeVarsFiles.filter((file) => {
        const fileName = path.basename(file);
        return !ignoreFiles.includes(<never>fileName);
      });
    }
    for (const includeVarsFile of includeVarsFiles) {
      let absVarsFilePath = includeVarsFile;
      if (!path.isAbsolute(includeVarsFile)) {
        absVarsFilePath = path.join(basePath, includeVarsFile);
      }

      if (absVarsFilePath in includeVarsContext) {
        continue;
      }
      let varData = readVarFiles(absVarsFilePath);
      if (varData) {
        if ("name" in includeVarsTask) {
          const varTopLevel = includeVarsTask["name"];
          try {
            const parsedVarData = yaml.parse(varData, {
              keepSourceTokens: true,
            });
            varData = <string>yaml.stringify({ [varTopLevel]: parsedVarData });
          } catch (err) {
            console.error(
              `Failed to add ${varTopLevel} to ${varData} with error ${err}`
            );
          }
        }
        includeVarsContext[absVarsFilePath] = varData;
      }
    }
  }

  return includeVarsContext;
}

export function readVarFiles(varFile: string): string | undefined {
  try {
    if (!fs.existsSync(varFile)) {
      return undefined;
    }
    const contents = fs.readFileSync(varFile, "utf8");
    const parsedAnsibleVars = yaml.parse(contents, {
      keepSourceTokens: true,
    });
    removeVarsValues(parsedAnsibleVars);
    const updatedFileContents = yaml.stringify(parsedAnsibleVars);
    return updatedFileContents;
  } catch (err) {
    console.error(`Failed to read ${varFile} with error ${err}`);
    return undefined;
  }
}
function removeVarsValues(parsedYaml: IParsedYaml[] | IParsedYaml | "") {
  if (Array.isArray(parsedYaml)) {
    for (const item of parsedYaml) {
      removeVarsValues(item);
    }
  } else if (typeof parsedYaml === "object" && parsedYaml !== null) {
    for (const key in parsedYaml) {
      if (Object.prototype.hasOwnProperty.call(parsedYaml, key)) {
        parsedYaml[key] = removeVarsValues(parsedYaml[key]);
      }
    }
  } else {
    parsedYaml = "";
  }

  return parsedYaml;
}

export function updateRolesCache(
  uri: vscode.Uri,
  lightSpeedManager: LightSpeedManager
) {
  let dirPath = uri.fsPath;
  const stats = fs.statSync(dirPath);
  if (stats.isFile()) {
    dirPath = path.dirname(dirPath);
  }
  if (dirPath in StandardRolePaths) {
    updateRolesContext(lightSpeedManager, dirPath, "common");
  } else {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const workspaceFolder = workspaceFolders[0].uri.fsPath;
      updateRolesContext(lightSpeedManager, dirPath, workspaceFolder);
    }
  }
}

export function updateRolesContext(
  lightSpeedManager: LightSpeedManager,
  rolesRootPath: string,
  workSpaceRoot: string
): IWorkSpaceRolesContext | undefined {
  if (!fs.existsSync(rolesRootPath) || !rolesRootPath.endsWith("roles")) {
    return;
  }
  const roleNames = fs
    .readdirSync(rolesRootPath)
    .filter((name) =>
      fs.statSync(path.join(rolesRootPath, name)).isDirectory()
    );
  for (const roleName of roleNames) {
    const rolePath = path.join(rolesRootPath, roleName);
    updateRoleContext(lightSpeedManager, rolePath, workSpaceRoot);
  }
}
export function updateRoleContext(
  lightSpeedManager: LightSpeedManager,
  rolePath: string,
  workSpaceRoot: string
) {
  if (!lightSpeedManager.ansibleRolesCache[workSpaceRoot]) {
    lightSpeedManager.ansibleRolesCache[workSpaceRoot] = {};
  }
  const rolesContext = lightSpeedManager.ansibleRolesCache[workSpaceRoot];
  rolesContext[rolePath] = {
    name: rolePath.split(path.sep).pop(),
  };

  // Get all the task files in the tasks directory
  const tasksPath = path.join(rolePath, "tasks");
  if (fs.existsSync(tasksPath)) {
    const taskNames = fs
      .readdirSync(tasksPath)
      .filter((name) => [".yml", ".yaml"].includes(path.extname(name)))
      .map((name) => path.basename(name, path.extname(name)));
    rolesContext[rolePath]["tasks"] = taskNames;
  }

  rolesContext[rolePath]["roleVars"] = {
    defaults: getVarsFromRoles(rolePath, "defaults") || {},
    vars: getVarsFromRoles(rolePath, "vars") || {},
  };
}

export function getRelativePath(
  documentDir: string,
  workSpaceRoot: string,
  absPath: string
): string {
  let relativePath = documentDir;
  if (documentDir && documentDir.startsWith(workSpaceRoot)) {
    relativePath = path.relative(documentDir, absPath);
  }
  return relativePath;
}

function getVarsFromRoles(
  rolePath: string,
  varType: VarType
): IVarsContext | undefined {
  const varsRootPath = path.join(rolePath, varType);
  if (!fs.existsSync(varsRootPath)) {
    return;
  }
  const varsFiles =
    fs
      .readdirSync(varsRootPath)
      .filter((name) => [".yml", ".yaml"].includes(path.extname(name)))
      .map((name) => name)
      .map((name) => path.join(varsRootPath, name)) || [];
  for (const varsFile of varsFiles) {
    if (!fs.existsSync(varsFile)) {
      continue;
    }

    try {
      const varsContext: IVarsContext = {};
      const varsFileName = path.basename(varsFile);
      const varsFileContent = readVarFiles(varsFile);
      if (varsFileContent) {
        varsContext[varsFileName] = varsFileContent;
        return varsContext;
      }
    } catch (err) {
      console.error(`Failed to read ${varsFile} with error ${err}`);
    }
  }

  return;
}

export function getRolePathFromPathWithinRole(roleFilePath: string): string {
  const pathSep = path.sep;
  const rolesIndex =
    roleFilePath.indexOf(`${pathSep}roles${pathSep}`) +
    `${path.sep}roles${path.sep}`.length;
  const roleNamePath = roleFilePath.substring(
    0,
    roleFilePath.indexOf(path.sep, rolesIndex)
  );
  return roleNamePath;
}

export function shouldTriggerMultiTaskSuggestion(
  documentContent: string,
  spacesBeforePromptStart: number,
  ansibleFileType: IAnsibleFileType
): boolean {
  const documentLines = documentContent.trim().split("\n");
  if (ansibleFileType === "playbook") {
    if (
      shouldTriggerMultiTaskSuggestionForPlaybook(
        documentLines,
        spacesBeforePromptStart
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
        spacesBeforePromptStart
      )
    ) {
      return true;
    } else {
      return false;
    }
  }
}

function shouldTriggerMultiTaskSuggestionForTaskFile(
  documentLines: string[],
  spacesBeforePromptStart: number
): boolean {
  let firstMatchKeywordIndent = -1;
  const validSuggestionTriggerIndents: number[] = [];
  let matchKeywordIndex = -1;
  for (let lineIndex = documentLines.length - 1; lineIndex >= 0; lineIndex--) {
    if (matchKeyword(tasksFileKeywords, documentLines[lineIndex])) {
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
    const matched = documentLines[lineIndex].match(/^\s*-\s*/);
    if (matched) {
      const indentLength = Math.max(matched[0].length - 2, 0);
      if (!validSuggestionTriggerIndents.includes(indentLength)) {
        validSuggestionTriggerIndents.push(indentLength);
      }
      break;
    }
  }
  if (commentOnly) {
    return true;
  }
  if (validSuggestionTriggerIndents.length > 0) {
    if (!validSuggestionTriggerIndents.includes(spacesBeforePromptStart)) {
      return false;
    } else {
      return true;
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
  spacesBeforePromptStart: number
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

export const matchKeyword = (keywordsRegex: RegExp[], line: string) =>
  keywordsRegex.some((keywordRegex) => keywordRegex.test(line));
