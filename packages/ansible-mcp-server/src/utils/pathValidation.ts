import path from "node:path";
import fs from "node:fs";

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

// Resolves symlinks for a path that may not exist yet by walking up
// to the nearest existing ancestor, resolving it, then re-appending
// the remaining segments. This handles macOS /var -> /private/var.
function resolveWithSymlinks(targetPath: string): string {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    const parent = path.dirname(targetPath);
    if (parent === targetPath) {
      return targetPath;
    }
    const resolvedParent = resolveWithSymlinks(parent);
    return path.join(resolvedParent, path.basename(targetPath));
  }
}

/**
 * Resolves and validates that a path stays within the workspace root.
 * Prevents path traversal attacks (CVE-2026-44192) by ensuring all
 * file operations are constrained to the workspace directory.
 *
 * @returns The resolved absolute path guaranteed to be within workspaceRoot.
 * @throws PathTraversalError if the path escapes the workspace.
 */
export function validatePathWithinWorkspace(
  inputPath: string,
  workspaceRoot: string,
): string {
  if (!inputPath?.trim()) {
    throw new PathTraversalError("Path must not be empty");
  }

  if (!workspaceRoot?.trim()) {
    throw new PathTraversalError("Workspace root must not be empty");
  }

  const resolvedWorkspace = path.resolve(workspaceRoot);

  const resolvedPath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(resolvedWorkspace, inputPath);

  const finalPath = resolveWithSymlinks(resolvedPath);
  const realWorkspace = resolveWithSymlinks(resolvedWorkspace);

  if (
    finalPath !== realWorkspace &&
    !finalPath.startsWith(realWorkspace + path.sep)
  ) {
    throw new PathTraversalError(
      `Path '${inputPath}' resolves to '${finalPath}' which is outside the workspace '${realWorkspace}'`,
    );
  }

  return finalPath;
}
