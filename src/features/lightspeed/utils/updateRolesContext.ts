import * as path from "path";
import * as fs from "fs";

import {
  IVarsContext,
  IWorkSpaceRolesContext,
} from "../../../interfaces/lightspeed";
import { readVarFiles } from "./readVarFiles";
import { VarType } from "../../../interfaces/lightspeed";

function getVarsFromRoles(
  rolePath: string,
  varType: VarType,
): IVarsContext | undefined {
  const varsRootPath = path.join(rolePath, varType);
  if (!fs.existsSync(varsRootPath)) {
    return;
  }
  let dirContent;
  try {
    dirContent = fs.readdirSync(varsRootPath);
  } catch (err) {
    console.error(`Failed to read a var directory with error ${err}`);
    return;
  }

  const varsFiles =
    dirContent
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

export function updateRolesContext(
  ansibleRolesCache: IWorkSpaceRolesContext,
  rolesRootPath: string,
  workSpaceRoot: string,
): IWorkSpaceRolesContext | undefined {
  if (!fs.existsSync(rolesRootPath) || !rolesRootPath.endsWith("roles")) {
    return;
  }
  let dirContent;
  try {
    dirContent = fs.readdirSync(rolesRootPath);
  } catch (error) {
    console.error(`Cannot read the directory: ${error}`);
    return;
  }

  const roleNames = dirContent.filter((name) =>
    fs.statSync(path.join(rolesRootPath, name)).isDirectory(),
  );
  for (const roleName of roleNames) {
    const rolePath = path.join(rolesRootPath, roleName);
    updateRoleContext(ansibleRolesCache, rolePath, workSpaceRoot);
  }
}
export function updateRoleContext(
  ansibleRolesCache: IWorkSpaceRolesContext,
  rolePath: string,
  workSpaceRoot: string,
) {
  if (!ansibleRolesCache[workSpaceRoot]) {
    ansibleRolesCache[workSpaceRoot] = {};
  }
  const rolesContext = ansibleRolesCache[workSpaceRoot];
  rolesContext[rolePath] = {
    name: rolePath.split(path.sep).pop(),
  };

  // Get all the task files in the tasks directory
  const tasksPath = path.join(rolePath, "tasks");
  if (fs.existsSync(tasksPath)) {
    try {
      const dirContent = fs.readdirSync(tasksPath);

      const taskNames = dirContent
        .filter((name) => [".yml", ".yaml"].includes(path.extname(name)))
        .map((name) => path.basename(name, path.extname(name)));
      rolesContext[rolePath]["tasks"] = taskNames;
    } catch (err) {
      console.error(`Failed to read "tasks" directory with error ${err}`);
    }
  }

  rolesContext[rolePath]["roleVars"] = {
    defaults: getVarsFromRoles(rolePath, "defaults") || {},
    vars: getVarsFromRoles(rolePath, "vars") || {},
  };
}
