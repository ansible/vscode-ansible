import * as path from "node:path";
import { homedir } from "node:os";
import { stat } from "node:fs/promises";

/**
 * Describes how a module option that points to a local file is resolved by
 * ansible-playbook.
 *
 * `dirname` is the conventional sub-directory (`templates`, `files`, ...) that
 * Ansible also searches, in addition to the plain relative path.
 */
interface FileReferenceSpec {
  dirname: string;
  /** Option names (e.g. `src`) that hold the file reference. */
  options: string[];
  /** Whether the free-form value (`module: some/file`) is a file reference. */
  freeForm?: boolean;
  allowDirectory?: boolean;
  remoteByDefault?: boolean;
  topLevelOnly?: boolean;
}

/**
 * Only options that are *read from the controller* are listed here. Options
 * like `path` or `dest` refer to locations on the managed host, so resolving
 * them against the project would be misleading.
 */
const FILE_REFERENCE_MODULES: Record<string, FileReferenceSpec> = {
  template: { dirname: "templates", options: ["src"] },
  copy: { dirname: "files", options: ["src"], allowDirectory: true },
  unarchive: { dirname: "files", options: ["src"] },
  assemble: {
    dirname: "files",
    options: ["src"],
    allowDirectory: true,
    remoteByDefault: true,
  },
  include_tasks: { dirname: "tasks", options: ["file"], freeForm: true },
  import_tasks: { dirname: "tasks", options: ["file"], freeForm: true },
  include_vars: { dirname: "vars", options: ["file"], freeForm: true },
  import_playbook: {
    dirname: "",
    options: [],
    freeForm: true,
    topLevelOnly: true,
  },
};

const BUILTIN_PREFIX = /^ansible\.(builtin|legacy)\./;

/**
 * Returns the file reference spec for a module name, accepting both the short
 * name (`template`) and the builtin FQCN (`ansible.builtin.template`).
 */
export function getFileReferenceSpec(
  moduleName: string,
): FileReferenceSpec | undefined {
  const shortName = moduleName.replace(BUILTIN_PREFIX, "");
  // names that still contain a dot belong to other collections
  if (shortName.includes(".")) {
    return undefined;
  }
  return Object.hasOwn(FILE_REFERENCE_MODULES, shortName)
    ? FILE_REFERENCE_MODULES[shortName]
    : undefined;
}

/**
 * Whether the option `optionName` of module `moduleName` references a file.
 * Pass `undefined` as `optionName` for the free-form value of the module.
 */
export function isFileReference(
  moduleName: string,
  optionName: string | undefined,
): FileReferenceSpec | undefined {
  const spec = getFileReferenceSpec(moduleName);
  if (!spec) {
    return undefined;
  }
  if (optionName === undefined) {
    return spec.freeForm ? spec : undefined;
  }
  return spec.options.includes(optionName) ? spec : undefined;
}

/**
 * When the file is part of a role (`<role>/tasks/...` or
 * `<role>/handlers/...`) returns the role directory.
 */
export function findRoleRoot(fileDir: string): string | undefined {
  let current = fileDir;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    const base = path.basename(current);
    if (base === "tasks" || base === "handlers") {
      return parent;
    }
    current = parent;
  }
}

async function isValidPath(
  candidate: string,
  allowDirectory: boolean,
): Promise<boolean> {
  try {
    const stats = await stat(candidate);
    return stats.isFile() || (allowDirectory && stats.isDirectory());
  } catch {
    return false;
  }
}

/**
 * Builds the ordered list of locations that ansible-playbook looks at, which
 * mirrors `DataLoader.path_dwim_relative_stack()` and
 * `Task.get_search_path()`:
 *
 *  1. role directory (when inside a role): `<role>/<dirname>/<src>`, `<role>/<src>`
 *  2. directory of the file that contains the task, same two patterns
 *  3. the playbook base directory (or workspace folder as a fallback)
 */
export function getSearchCandidates(
  reference: string,
  dirname: string,
  documentPath: string,
  basedirs: string[] = [],
): string[] {
  const candidates: string[] = [];
  const documentDir = path.dirname(documentPath);
  const roleRoot = findRoleRoot(documentDir);
  const searchPaths = [roleRoot, documentDir, ...basedirs].filter(
    (p): p is string => !!p,
  );
  // do not add the dirname when the user already spelled it, e.g. `files/a.txt`
  const alreadyHasDirname = !dirname || reference.split("/")[0] === dirname;

  for (const base of searchPaths) {
    if (!alreadyHasDirname) {
      candidates.push(path.resolve(base, dirname, reference));
    }
    candidates.push(path.resolve(base, reference));
  }
  return [...new Set(candidates)];
}

/**
 * Resolves a file reference found in a task to a file on disk, or
 * `undefined` when nothing matches or the value cannot be resolved
 * statically (e.g. it uses Jinja templating).
 */
export async function resolveFileReference(
  reference: string,
  dirname: string,
  documentPath: string,
  basedirs: string[] = [],
  allowDirectory = false,
): Promise<string | undefined> {
  const value = reference.trim();
  if (!value || value.includes("{{") || value.includes("{%")) {
    return undefined;
  }

  // absolute and home-relative paths do not use the search path
  if (value.startsWith("/") || value === "~" || value.startsWith("~/")) {
    const absolute = value.startsWith("~")
      ? path.join(homedir(), value.slice(1))
      : value;
    return (await isValidPath(absolute, allowDirectory)) ? absolute : undefined;
  }

  for (const candidate of getSearchCandidates(
    value,
    dirname,
    documentPath,
    basedirs,
  )) {
    if (await isValidPath(candidate, allowDirectory)) {
      return candidate;
    }
  }
  return undefined;
}
