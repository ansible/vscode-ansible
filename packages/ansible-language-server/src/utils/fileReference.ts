import * as path from "node:path";
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
  include_vars: {
    dirname: "vars",
    options: ["file", "dir"],
    freeForm: true,
    allowDirectory: true,
  },
  import_playbook: {
    dirname: "",
    options: [],
    freeForm: true,
    topLevelOnly: true,
  },
};

const BUILTIN_PREFIX = /^ansible\.(builtin|legacy)\./;

/** Upper bound for the upward walk that looks for a role root. */
const MAX_ROLE_SEARCH_DEPTH = 10;

/**
 * Whether a value contains Jinja and so cannot be resolved statically.
 * Single source of truth, shared with the definition provider.
 */
export function isTemplatedValue(value: string): boolean {
  return value.includes("{{") || value.includes("{%");
}

/**
 * Returns the file reference spec for a module name, accepting both the short
 * name (`template`) and the builtin FQCN (`ansible.builtin.template`).
 */
function getFileReferenceSpec(
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
 * `<role>/handlers/...`) returns the role directory. The walk is bounded so a
 * coincidental `tasks` directory far up the tree is never picked up.
 */
function findRoleRoot(fileDir: string): string | undefined {
  let current = fileDir;
  for (let depth = 0; depth < MAX_ROLE_SEARCH_DEPTH; depth++) {
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
  return undefined;
}

/** Whether `candidate` is `root` itself or located inside it. */
function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  if (relative === "") {
    return true;
  }
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
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
 * The directories a reference may resolve into: the role root (when inside a
 * role), the directory of the file that contains the task, and the base
 * directories supplied by the caller. Deduplicated.
 */
function getSearchRoots(documentPath: string, basedirs: string[]): string[] {
  const documentDir = path.dirname(documentPath);
  const roleRoot = findRoleRoot(documentDir);
  const roots = [roleRoot, documentDir, ...basedirs]
    .filter((p): p is string => !!p)
    .map((p) => path.resolve(p));
  return [...new Set(roots)];
}

/**
 * Builds the ordered list of locations that ansible-playbook looks at, which
 * mirrors Ansible's relative path resolution and `Task.get_search_path()`:
 * for each search root, `<root>/<dirname>/<reference>` then `<root>/<reference>`.
 *
 *  1. role directory (when inside a role)
 *  2. directory of the file that contains the task
 *  3. the playbook base directory (or workspace folder as a fallback)
 */
function getSearchCandidates(
  reference: string,
  dirname: string,
  searchRoots: string[],
): string[] {
  const candidates: string[] = [];
  // do not add the dirname when the user already spelled it, e.g. `files/a.txt`
  const alreadyHasDirname = !dirname || reference.split("/")[0] === dirname;

  for (const base of searchRoots) {
    if (!alreadyHasDirname) {
      candidates.push(path.resolve(base, dirname, reference));
    }
    candidates.push(path.resolve(base, reference));
  }
  return [...new Set(candidates)];
}

/**
 * Resolves a file reference found in a task to a file on disk, or
 * `undefined` when nothing matches, the value cannot be resolved statically
 * (e.g. Jinja templating), or the result would fall outside the allowed
 * search roots (path traversal such as `../../../etc/shadow`).
 */
export async function resolveFileReference(
  reference: string,
  dirname: string,
  documentPath: string,
  basedirs: string[] = [],
  allowDirectory = false,
): Promise<string | undefined> {
  const value = reference.trim();
  if (!value || isTemplatedValue(value)) {
    return undefined;
  }

  // home-relative paths are not expanded: they point outside the project
  if (value === "~" || value.startsWith("~/")) {
    return undefined;
  }

  const searchRoots = getSearchRoots(documentPath, basedirs);
  const candidates = path.isAbsolute(value)
    ? [path.resolve(value)]
    : getSearchCandidates(value, dirname, searchRoots);

  for (const candidate of candidates) {
    if (!searchRoots.some((root) => isWithin(root, candidate))) {
      continue;
    }
    if (await isValidPath(candidate, allowDirectory)) {
      return candidate;
    }
  }
  return undefined;
}
