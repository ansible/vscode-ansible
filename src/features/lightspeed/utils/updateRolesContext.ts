import * as path from "path";
import * as fs from "fs";

import {
  IVarsContext,
  IWorkSpaceRolesContext,
  VarType,
} from "@src/interfaces/lightspeed";
import { readVarFiles } from "@src/features/lightspeed/utils/readVarFiles";

async function getVarsFromRoles(
  rolePath: string,
  varType: VarType,
): Promise<IVarsContext | undefined> {
  const varsRootPath = path.join(rolePath, varType);
  let dirContent: string[];
  try {
    dirContent = await fs.promises.readdir(varsRootPath);
  } catch {
    return;
  }

  const varsFiles = dirContent
    .filter((name) => [".yml", ".yaml"].includes(path.extname(name)))
    .map((name) => path.join(varsRootPath, name));
  for (const varsFile of varsFiles) {
    try {
      const varsContext: IVarsContext = {};
      const varsFileName = path.basename(varsFile);
      const varsFileContent = await readVarFiles(varsFile);
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

export async function updateRolesContext(
  ansibleRolesCache: IWorkSpaceRolesContext,
  rolesRootPath: string,
  workSpaceRoot: string,
): Promise<IWorkSpaceRolesContext | undefined> {
  if (!rolesRootPath.endsWith("roles")) {
    return;
  }
  let dirContent: string[];
  try {
    dirContent = await fs.promises.readdir(rolesRootPath);
  } catch (error) {
    console.error(`Cannot read the directory: ${error}`);
    return;
  }

  for (const name of dirContent) {
    try {
      const stat = await fs.promises.stat(path.join(rolesRootPath, name));
      if (stat.isDirectory()) {
        const rolePath = path.join(rolesRootPath, name);
        await updateRoleContext(ansibleRolesCache, rolePath, workSpaceRoot);
      }
    } catch {
      // skip entries that can't be stat'd
    }
  }
}

export async function updateRoleContext(
  ansibleRolesCache: IWorkSpaceRolesContext,
  rolePath: string,
  workSpaceRoot: string,
): Promise<void> {
  if (!ansibleRolesCache[workSpaceRoot]) {
    ansibleRolesCache[workSpaceRoot] = {};
  }
  const rolesContext = ansibleRolesCache[workSpaceRoot];
  rolesContext[rolePath] = {
    name: rolePath.split(path.sep).pop(),
  };

  // Get all the task files in the tasks directory
  const tasksPath = path.join(rolePath, "tasks");
  try {
    const dirContent = await fs.promises.readdir(tasksPath);
    const taskNames = dirContent
      .filter((name) => [".yml", ".yaml"].includes(path.extname(name)))
      .map((name) => path.basename(name, path.extname(name)));
    rolesContext[rolePath]["tasks"] = taskNames;
  } catch {
    // tasks directory doesn't exist or can't be read
  }

  rolesContext[rolePath]["roleVars"] = {
    defaults: (await getVarsFromRoles(rolePath, "defaults")) || {},
    vars: (await getVarsFromRoles(rolePath, "vars")) || {},
  };
}
