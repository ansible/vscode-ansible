import { DefinitionLink, Range } from "vscode-languageserver";
import { Position, TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { isPair, isScalar, Node } from "yaml";
import { DocsLibrary } from "@src/services/docsLibrary.js";
import { fileExists, toLspRange } from "@src/utils/misc.js";
import {
  AncestryBuilder,
  getOrigRange,
  getPathAt,
  isTaskParam,
  parseAllDocuments,
} from "@src/utils/yaml.js";
import * as nodePath from "node:path";

/**
 * Module + parameter combinations whose values reference local files.
 *
 * Keys are short or FQCN module names; values are Sets of parameter keys
 * that hold file paths for that module.  Only modules whose parameters
 * genuinely reference files on the Ansible controller are listed.
 */
const MODULE_FILE_PARAMS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["ansible.builtin.copy", new Set(["src"])],
  ["copy", new Set(["src"])],
  ["ansible.builtin.template", new Set(["src"])],
  ["template", new Set(["src"])],
  ["ansible.builtin.unarchive", new Set(["src"])],
  ["unarchive", new Set(["src"])],
  ["ansible.builtin.assemble", new Set(["src"])],
  ["assemble", new Set(["src"])],
  ["ansible.builtin.script", new Set(["cmd"])],
  ["script", new Set(["cmd"])],
  ["ansible.builtin.stat", new Set(["path"])],
  ["stat", new Set(["path"])],
  ["ansible.builtin.file", new Set(["path", "src"])],
  ["file", new Set(["path", "src"])],
  ["ansible.builtin.include_vars", new Set(["file"])],
  ["include_vars", new Set(["file"])],
  ["ansible.builtin.lineinfile", new Set(["path"])],
  ["lineinfile", new Set(["path"])],
  ["ansible.builtin.blockinfile", new Set(["path"])],
  ["blockinfile", new Set(["path"])],
  ["ansible.builtin.patch", new Set(["src"])],
  ["patch", new Set(["src"])],
]);

/**
 * Module names (short and FQCN) whose free-form argument is a file path.
 * These modules accept a file path as the direct value of the module key.
 */
const FILE_MODULE_NAMES = new Set([
  "include_tasks",
  "import_tasks",
  "include_playbook",
  "import_playbook",
  "include_vars",
  "include",
  "ansible.builtin.include_tasks",
  "ansible.builtin.import_tasks",
  "ansible.builtin.include_playbook",
  "ansible.builtin.import_playbook",
  "ansible.builtin.include_vars",
  "ansible.builtin.include",
]);

export async function getDefinition(
  document: TextDocument,
  position: Position,
  docsLibrary: DocsLibrary,
  workspaceFolderUri?: string,
): Promise<DefinitionLink[] | null> {
  const yamlDocs = parseAllDocuments(document.getText());
  const path = getPathAt(document, position, yamlDocs);
  if (path) {
    const node = path[path.length - 1];
    if (isScalar(node)) {
      // Existing: Go-to-definition for module names (task parameter keys)
      if (new AncestryBuilder(path).parentOfKey().get()) {
        if (isTaskParam(path)) {
          const [module] = await docsLibrary.findModule(
            node.value as string,
            path,
            document.uri,
          );
          if (module) {
            const range = getOrigRange(node);
            return [
              {
                targetUri: URI.file(module.source).toString(),
                originSelectionRange: range
                  ? toLspRange(range, document)
                  : undefined,
                targetRange: Range.create(
                  module.sourceLineRange[0],
                  0,
                  module.sourceLineRange[1],
                  0,
                ),
                targetSelectionRange: Range.create(
                  module.sourceLineRange[0],
                  0,
                  module.sourceLineRange[1],
                  0,
                ),
              },
            ];
          }
        }
      }

      // Go-to-definition for file references in task parameter values
      const fileRef = getFileReferenceValue(path);
      if (fileRef) {
        const resolvedPath = await resolveAnsibleFilePath(
          fileRef,
          document.uri,
          workspaceFolderUri,
        );
        if (resolvedPath) {
          const range = getOrigRange(node);
          return [
            {
              targetUri: URI.file(resolvedPath).toString(),
              originSelectionRange: range
                ? toLspRange(range, document)
                : undefined,
              targetRange: Range.create(0, 0, 0, 0),
              targetSelectionRange: Range.create(0, 0, 0, 0),
            },
          ];
        }
      }
    }
  }
  return null;
}

/**
 * Checks whether the current path points at a scalar value that is a file
 * reference. Returns the file path string, or undefined.
 *
 * Handles two patterns:
 * 1. `copy:\n    src: myfile.txt` — value of a known file-ref param for a
 *    specific module (scoped via MODULE_FILE_PARAMS).
 * 2. `include_tasks: tasks/other.yml` — free-form value of a file-ref module.
 */
function getFileReferenceValue(path: Node[]): string | undefined {
  const node = path[path.length - 1];
  if (!isScalar(node) || typeof node.value !== "string") return undefined;
  const value = (node.value as string).trim();
  if (!value) return undefined;

  // Skip Jinja2 expressions — they're not static file references
  if (value.includes("{{")) return undefined;

  // Verify that the node is the value side of a Pair
  const parentPairIndex = path.length - 2;
  if (parentPairIndex < 0) return undefined;
  const parentPair = path[parentPairIndex];
  if (!isPair(parentPair) || parentPair.value !== node) return undefined;

  // Pattern 1: value of a module-specific file-referencing param
  if (isScalar(parentPair.key) && typeof parentPair.key.value === "string") {
    const keyName = parentPair.key.value as string;

    // Check if this key+module combination is a known file reference
    const moduleName = findEnclosingModuleName(path);
    if (moduleName) {
      // Free-form module value (pattern 2)
      if (FILE_MODULE_NAMES.has(moduleName) && keyName === moduleName) {
        return value;
      }
      // Scoped param check (pattern 1)
      const fileParams = MODULE_FILE_PARAMS.get(moduleName);
      if (fileParams?.has(keyName)) {
        return value;
      }
    }
  }

  return undefined;
}

/**
 * Walks up the YAML path to find the module name that encloses the current
 * node. Returns the module name string, or undefined.
 */
function findEnclosingModuleName(path: Node[]): string | undefined {
  // Walk backwards looking for the task-level map key that is the module name.
  // In a typical structure:
  //   - ansible.builtin.copy:   <-- module key (Pair.key)
  //       src: myfile.txt       <-- we are here (Pair.value)
  //
  // path = [ ..., YAMLMap(task), Pair(copy), YAMLMap(params), Pair(src), Scalar(myfile) ]
  // We need to find the Pair whose key is the module name.
  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i];
    if (
      isPair(node) &&
      isScalar(node.key) &&
      typeof node.key.value === "string"
    ) {
      const candidate = node.key.value as string;
      if (
        MODULE_FILE_PARAMS.has(candidate) ||
        FILE_MODULE_NAMES.has(candidate)
      ) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * Resolves a file reference to an absolute path on disk, following Ansible's
 * search path conventions:
 *
 * 1. Absolute path — use as-is
 * 2. Relative to the playbook/task file directory
 * 3. Role context search paths:
 *    - <role>/files/<filename>
 *    - <role>/templates/<filename>
 *    - <role>/tasks/<filename>
 *    - <role>/vars/<filename>
 * 4. Relative to workspace root
 *
 * Path-traversal sequences (../) are rejected to prevent probing files
 * outside the expected search directories.
 */
async function resolveAnsibleFilePath(
  filePath: string,
  documentUri: string,
  workspaceFolderUri?: string,
): Promise<string | undefined> {
  // Reject path-traversal attempts
  if (hasPathTraversal(filePath)) return undefined;

  // Absolute path — check directly
  if (nodePath.isAbsolute(filePath)) {
    return (await fileExists(filePath)) ? filePath : undefined;
  }

  const documentFsPath = URI.parse(documentUri).fsPath;
  const documentDir = nodePath.dirname(documentFsPath);

  // Relative to document directory
  const relativeToDoc = nodePath.resolve(documentDir, filePath);
  if (await fileExists(relativeToDoc)) return relativeToDoc;

  // Role context: detect if the document is inside a role
  const roleSearchDirs = getRoleSearchDirs(documentFsPath);
  for (const dir of roleSearchDirs) {
    const candidate = nodePath.resolve(dir, filePath);
    if (await fileExists(candidate)) return candidate;
  }

  // Relative to workspace root
  if (workspaceFolderUri) {
    const workspaceRoot = URI.parse(workspaceFolderUri).fsPath;
    const relativeToWorkspace = nodePath.resolve(workspaceRoot, filePath);
    if (await fileExists(relativeToWorkspace)) return relativeToWorkspace;
  }

  return undefined;
}

/**
 * Returns true when the file path contains directory-traversal sequences
 * that could escape the intended search directory.
 */
function hasPathTraversal(filePath: string): boolean {
  const normalized = nodePath.normalize(filePath);
  return (
    normalized.startsWith("..") || normalized.includes(`${nodePath.sep}..`)
  );
}

/**
 * Given a file path inside an Ansible role, returns the standard role
 * subdirectories to search for referenced files.
 *
 * Role directory structure:
 *   roles/
 *     my_role/
 *       tasks/        — task files
 *       files/        — files for copy, script modules
 *       templates/    — Jinja2 templates
 *       vars/         — variable files
 *       defaults/     — default variable files
 *       handlers/     — handler files
 *
 * If the document is inside a role (e.g. roles/my_role/tasks/main.yml),
 * returns [roles/my_role/files, roles/my_role/templates, roles/my_role/tasks,
 *          roles/my_role/vars, roles/my_role/handlers, roles/my_role/defaults].
 */
function getRoleSearchDirs(documentPath: string): string[] {
  const roleSubdirs = [
    "files",
    "templates",
    "tasks",
    "vars",
    "handlers",
    "defaults",
  ];

  // Match pattern: .../roles/<role_name>/<subdir>/...
  const roleMatch = documentPath.match(
    /^(.*\/roles\/[^/]+)\/(tasks|files|templates|vars|handlers|defaults|meta)\//,
  );
  if (roleMatch) {
    const roleRoot = roleMatch[1];
    return roleSubdirs.map((sub) => nodePath.join(roleRoot, sub));
  }

  return [];
}
