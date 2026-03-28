import * as path from "path";
import { existsSync } from "fs";
import { readFile, readdir } from "fs/promises";
import { URI } from "vscode-uri";
import { parseDocument } from "yaml";
import { IDescription, IOption } from "@src/interfaces/module.js";

const ROLE_MARKER_DIRS = ["tasks", "handlers", "defaults", "vars", "meta"];

export interface RoleVariableInfo {
  name: string;
  option?: IOption;
}

export interface RoleEntryPointInfo {
  shortDescription?: string;
  options: Map<string, IOption>;
}

/**
 * Resolves the filesystem path for a role by name.
 * Search order:
 *   1. ./roles/<name>/ relative to document
 *   2. DEFAULT_ROLES_PATH from ansible-config dump
 *   3. ~/.ansible/roles/
 *   4. /etc/ansible/roles/ (fallback)
 */
export function resolveRolePath(
  roleName: string,
  documentUri: string,
  rolesPaths?: string[],
): string | null {
  const docPath = URI.parse(documentUri).path;
  const docDir = path.dirname(docPath);

  // 1. Relative to document: ./roles/<name>/
  const localRolePath = path.resolve(docDir, "roles", roleName);
  if (existsSync(localRolePath)) {
    return localRolePath;
  }

  // 2. DEFAULT_ROLES_PATH
  if (rolesPaths) {
    for (const rolesDir of rolesPaths) {
      const candidate = path.join(rolesDir, roleName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  // 3. ~/.ansible/roles/
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeRolePath = path.join(homeDir, ".ansible", "roles", roleName);
  if (existsSync(homeRolePath)) {
    return homeRolePath;
  }

  // 4. /etc/ansible/roles/
  const etcRolePath = path.join("/etc", "ansible", "roles", roleName);
  if (existsSync(etcRolePath)) {
    return etcRolePath;
  }

  return null;
}

/**
 * Determines if a file is inside a role directory.
 * Returns role name and path, or null.
 */
export function getRoleContextFromUri(
  fileUri: string,
  rolesPaths?: string[],
): { roleName: string; rolePath: string } | null {
  const filePath = URI.parse(fileUri).path;

  // 1. Check against rolesPaths (precise — handles nested dirs like ./roles/vendor/role_name/)
  if (rolesPaths) {
    for (const rolesDir of rolesPaths) {
      const normalizedDir = rolesDir.endsWith("/") ? rolesDir : rolesDir + "/";
      if (!filePath.startsWith(normalizedDir)) continue;
      const relative = filePath.substring(normalizedDir.length);
      const slashIdx = relative.indexOf("/");
      if (slashIdx === -1) continue;
      const roleName = relative.substring(0, slashIdx);
      const rolePath = path.join(rolesDir, roleName);
      if (ROLE_MARKER_DIRS.some((dir) => existsSync(path.join(rolePath, dir)))) {
        return { roleName, rolePath };
      }
    }
  }

  // 2. Fallback: detect /roles/ segment in path (no config needed)
  const rolesIdx = filePath.lastIndexOf("/roles/");
  if (rolesIdx === -1) {
    return null;
  }
  const afterRoles = filePath.substring(rolesIdx + "/roles/".length);
  const slashIdx = afterRoles.indexOf("/");
  if (slashIdx === -1) {
    return null;
  }
  const roleName = afterRoles.substring(0, slashIdx);
  const rolePath = filePath.substring(0, rolesIdx + "/roles/".length + roleName.length);

  // Validate: at least one standard role subdirectory must exist
  const isValidRole = ROLE_MARKER_DIRS.some((dir) =>
    existsSync(path.join(rolePath, dir)),
  );
  if (!isValidRole) return null;

  return { roleName, rolePath };
}

/**
 * Extracts role variables.
 * isExternalContext=true (playbook):
 *   argument_specs.yml[entryPoint].options -> defaults/main.yml fallback
 * isExternalContext=false (inside role):
 *   defaults/main.yml + vars/main.yml, enriched with docs from argument_specs (all entry points)
 */
export async function getRoleVariables(
  rolePath: string,
  isExternalContext: boolean,
  entryPoint: string = "main",
): Promise<RoleVariableInfo[]> {
  const argSpecs = await parseArgumentSpecs(rolePath);
  const defaultsVars = await readYamlVarFile(
    path.join(rolePath, "defaults", "main.yml"),
  );
  const varsVars = await readYamlVarFile(path.join(rolePath, "vars", "main.yml"));

  if (isExternalContext) {
    // Playbook context: argument_specs options first, defaults as fallback
    const entryPointInfo = argSpecs.get(entryPoint);
    if (entryPointInfo && entryPointInfo.options.size > 0) {
      const result: RoleVariableInfo[] = [];
      for (const [name, option] of entryPointInfo.options) {
        result.push({ name, option });
      }
      // Add defaults not covered by argument_specs
      for (const name of defaultsVars) {
        if (!entryPointInfo.options.has(name)) {
          result.push({ name });
        }
      }
      return result;
    }
    // No argument_specs — fallback to defaults only
    return defaultsVars.map((name) => ({ name }));
  }

  // Inside role context: defaults + vars, enriched with argument_specs docs
  const allVarNames = new Set([...defaultsVars, ...varsVars]);
  const result: RoleVariableInfo[] = [];
  for (const name of allVarNames) {
    const option = findOptionInAllEntryPoints(name, argSpecs);
    result.push({ name, option: option ?? undefined });
  }
  return result;
}

/**
 * Gets the short_description for a role entry point from argument_specs.
 */
export async function getRoleEntryPointDescription(
  rolePath: string,
  entryPoint: string = "main",
): Promise<string | undefined> {
  const argSpecs = await parseArgumentSpecs(rolePath);
  return argSpecs.get(entryPoint)?.shortDescription;
}

/**
 * Resolves a file path for modules like template/copy/script,
 * considering role context.
 */
export function resolveModuleFilePath(
  filePath: string,
  moduleName: string,
  documentUri: string,
): string | null {
  const docPath = URI.parse(documentUri).path;
  const docDir = path.dirname(docPath);
  const roleCtx = getRoleContextFromUri(documentUri);

  if (roleCtx) {
    // Inside a role: resolve relative to role subdirectories
    let roleSubdir: string | null = null;
    if (moduleName === "template" || moduleName === "ansible.builtin.template") {
      roleSubdir = "templates";
    } else if (
      moduleName === "copy" ||
      moduleName === "ansible.builtin.copy" ||
      moduleName === "script" ||
      moduleName === "ansible.builtin.script"
    ) {
      roleSubdir = "files";
    }

    if (roleSubdir) {
      const roleFilePath = path.join(roleCtx.rolePath, roleSubdir, filePath);
      if (existsSync(roleFilePath)) {
        return roleFilePath;
      }
    }

    // include_tasks / import_tasks inside role: try <role>/tasks/<path>
    if (
      moduleName === "include_tasks" ||
      moduleName === "ansible.builtin.include_tasks" ||
      moduleName === "import_tasks" ||
      moduleName === "ansible.builtin.import_tasks"
    ) {
      const roleTaskPath = path.join(roleCtx.rolePath, "tasks", filePath);
      if (existsSync(roleTaskPath)) {
        return roleTaskPath;
      }
    }
  }

  // Default: resolve relative to document
  const resolvedPath = path.resolve(docDir, filePath);
  if (existsSync(resolvedPath)) {
    return resolvedPath;
  }

  return null;
}

/**
 * Lists YAML files matching a glob-like pattern within a role directory.
 * Supports simple patterns like "tasks" -> tasks/**\/*.yml
 */
export async function listRoleYamlFiles(
  rolePath: string,
  subdir: string,
): Promise<string[]> {
  const dir = path.join(rolePath, subdir);
  if (!existsSync(dir)) {
    return [];
  }
  return collectYamlFiles(dir);
}

// --- Internal helpers ---

async function collectYamlFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await collectYamlFiles(fullPath)));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
      ) {
        result.push(fullPath);
      }
    }
  } catch {
    // Directory not readable
  }
  return result;
}

async function readYamlVarFile(filePath: string): Promise<string[]> {
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const content = await readFile(filePath, { encoding: "utf8" });
    const doc = parseDocument(content);
    const json = doc.toJSON();
    if (json && typeof json === "object" && !Array.isArray(json)) {
      return Object.keys(json);
    }
  } catch {
    // Invalid YAML
  }
  return [];
}

async function parseArgumentSpecs(
  rolePath: string,
): Promise<Map<string, RoleEntryPointInfo>> {
  const result = new Map<string, RoleEntryPointInfo>();
  const specPath = path.join(rolePath, "meta", "argument_specs.yml");
  if (!existsSync(specPath)) {
    return result;
  }

  try {
    const content = await readFile(specPath, { encoding: "utf8" });
    const doc = parseDocument(content);
    const json = doc.toJSON();
    if (!json || typeof json !== "object") {
      return result;
    }

    const argSpecs = (json as Record<string, unknown>).argument_specs;
    if (!argSpecs || typeof argSpecs !== "object") {
      return result;
    }

    for (const [entryPoint, epValue] of Object.entries(
      argSpecs as Record<string, unknown>,
    )) {
      if (!epValue || typeof epValue !== "object") {
        continue;
      }
      const epObj = epValue as Record<string, unknown>;
      const shortDescription = typeof epObj.short_description === "string"
        ? epObj.short_description
        : undefined;

      const options = new Map<string, IOption>();
      if (epObj.options && typeof epObj.options === "object") {
        for (const [optName, optValue] of Object.entries(
          epObj.options as Record<string, unknown>,
        )) {
          if (optValue && typeof optValue === "object") {
            options.set(optName, parseOption(optName, optValue as Record<string, unknown>));
          }
        }
      }

      result.set(entryPoint, { shortDescription, options });
    }
  } catch {
    // Invalid YAML
  }
  return result;
}

function parseOption(
  name: string,
  raw: Record<string, unknown>,
): IOption {
  let description: IDescription | undefined;
  if (typeof raw.description === "string") {
    description = raw.description;
  } else if (Array.isArray(raw.description)) {
    description = raw.description as Array<unknown>;
  }

  return {
    name,
    description,
    required: raw.required === true,
    default: raw.default,
    choices: Array.isArray(raw.choices) ? raw.choices : undefined,
    type: typeof raw.type === "string" ? raw.type : undefined,
    elements: typeof raw.elements === "string" ? raw.elements : undefined,
    aliases: Array.isArray(raw.aliases)
      ? (raw.aliases as Array<string>)
      : undefined,
  };
}

function findOptionInAllEntryPoints(
  varName: string,
  argSpecs: Map<string, RoleEntryPointInfo>,
): IOption | null {
  for (const [, epInfo] of argSpecs) {
    const option = epInfo.options.get(varName);
    if (option) {
      return option;
    }
  }
  return null;
}
