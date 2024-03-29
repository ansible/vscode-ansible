import { WorkspaceFolder } from "vscode";
import * as yaml from "yaml";
import {
  IAdditionalContext,
  IAnsibleFileType,
  IPlaybookContext,
  IRoleContext,
  IRolesContext,
  IStandaloneTaskContext,
} from "../../../interfaces/lightspeed";
import {
  getVarsFilesContext,
  getRelativePath,
  getRolePathFromPathWithinRole,
  getIncludeVarsContext,
} from "../utils/data";
import { lightSpeedManager } from "../../../extension";
import { getCustomRolePaths } from "../../utils/ansible";
import { watchRolesDirectory } from "../utils/watchers";

export function getAdditionalContext(
  parsedAnsibleDocument: yaml.YAMLMap[],
  documentDirPath: string,
  documentFilePath: string,
  ansibleFileType: IAnsibleFileType,
  workspaceFolders: readonly WorkspaceFolder[] | undefined,
): IAdditionalContext {
  let workSpaceRoot = undefined;
  const playbookContext: IPlaybookContext = {};
  let roleContext: IRoleContext = {};
  const standaloneTaskContext: IStandaloneTaskContext = {};
  if (workspaceFolders) {
    workSpaceRoot = workspaceFolders[0].uri.fsPath;
  }
  if (ansibleFileType === "playbook") {
    const varsFilesContext = getVarsFilesContext(
      lightSpeedManager,
      parsedAnsibleDocument,
      documentDirPath,
    );
    playbookContext["varInfiles"] = varsFilesContext || {};
    const rolesCache: IRolesContext = {};
    if (workSpaceRoot) {
      // check if roles are installed in the workspace
      if (!(workSpaceRoot in lightSpeedManager.ansibleRolesCache)) {
        const rolesPath = getCustomRolePaths(workSpaceRoot);
        for (const rolePath of rolesPath) {
          watchRolesDirectory(lightSpeedManager, rolePath, workSpaceRoot);
        }
      }
      // if roles are installed in the workspace, then get the relative path w.r.t. the workspace root
      if (workSpaceRoot in lightSpeedManager.ansibleRolesCache) {
        const workspaceRolesCache =
          lightSpeedManager.ansibleRolesCache[workSpaceRoot];
        for (const absRolePath in workspaceRolesCache) {
          const relativeRolePath = getRelativePath(
            documentDirPath,
            workSpaceRoot,
            absRolePath,
          );
          rolesCache[relativeRolePath] = workspaceRolesCache[absRolePath];
        }
      }
    }
    if ("common" in lightSpeedManager.ansibleRolesCache) {
      for (const commonRolePath in lightSpeedManager.ansibleRolesCache) {
        rolesCache[commonRolePath] =
          lightSpeedManager.ansibleRolesCache["common"][commonRolePath];
      }
    }
    playbookContext["roles"] = rolesCache;
  } else if (ansibleFileType === "tasks_in_role") {
    const roleCache = lightSpeedManager.ansibleRolesCache;
    const absRolePath = getRolePathFromPathWithinRole(documentFilePath);
    if (
      workSpaceRoot &&
      workSpaceRoot in roleCache &&
      absRolePath in roleCache[workSpaceRoot]
    ) {
      roleContext = roleCache[workSpaceRoot][absRolePath];
    }
  }
  const includeVarsContext =
    getIncludeVarsContext(
      lightSpeedManager,
      parsedAnsibleDocument,
      documentDirPath,
      ansibleFileType,
    ) || {};

  if (ansibleFileType === "playbook") {
    playbookContext.includeVars = includeVarsContext;
  } else if (ansibleFileType === "tasks_in_role") {
    roleContext.includeVars = includeVarsContext;
  } else if (ansibleFileType === "tasks") {
    standaloneTaskContext.includeVars = includeVarsContext;
  }

  const additionalContext: IAdditionalContext = {
    playbookContext: playbookContext,
    roleContext: roleContext,
    standaloneTaskContext: standaloneTaskContext,
  };
  return additionalContext;
}
