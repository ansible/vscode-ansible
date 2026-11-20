/**
 * Resource path resolution utility.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Get the directory where resources are located.
 * Uses import.meta.url for ESM module resolution.
 * The __dirname check is kept for compatibility but should not be used in ESM mode.
 */
function getResourceBaseDir(callerUrl?: string): string {
  // In ESM, __dirname is not available, so we always use import.meta.url
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }

  // If callerUrl is omitted, falls back to this module's URL (src/utils/),
  // which is then corrected to src/resources/ by the fallback logic below.
  const url = callerUrl ?? import.meta.url;
  let callerDir = path.dirname(fileURLToPath(url));

  if (
    callerDir.includes("src" + path.sep + "resources") ||
    callerDir.includes(
      "out" + path.sep + "server" + path.sep + "src" + path.sep + "resources",
    )
  ) {
    return callerDir;
  }

  if (callerDir.includes("src" + path.sep + "utils")) {
    callerDir = callerDir.replace(
      "src" + path.sep + "utils",
      "src" + path.sep + "resources",
    );
    return callerDir;
  }

  if (
    callerDir.includes(
      "out" + path.sep + "server" + path.sep + "src" + path.sep + "utils",
    )
  ) {
    callerDir = callerDir.replace(
      "out" + path.sep + "server" + path.sep + "src" + path.sep + "utils",
      "out" + path.sep + "server" + path.sep + "src" + path.sep + "resources",
    );
    return callerDir;
  }

  return callerDir;
}

/**
 * Look for a resource in the built output. The build copies data/ to
 * dist/data/ and lib/resources/data/, while this module and its callers are
 * emitted to dist/utils/, dist/resources/ and lib/utils/.
 *
 * @param baseDir - Directory of the module that asks for the resource
 * @param relativePath - Path relative to the data directory
 * @returns Absolute path to the resource file, or undefined if not found
 * @internal Exported only for unit tests; not part of the public API.
 */
export async function resolveBuiltResourcePath(
  baseDir: string,
  relativePath: string,
): Promise<string | undefined> {
  for (const altBaseDir of [
    path.join(baseDir, "..", "resources"),
    path.join(baseDir, ".."),
  ]) {
    const altResourcePath = path.join(altBaseDir, "data", relativePath);
    try {
      await fs.access(altResourcePath);
      return altResourcePath;
    } catch {
      // Try the next candidate
    }
  }
  return undefined;
}

/**
 * Works generically in any environment (dev, bundled, CI, production) by resolving
 * relative to the module's location. The build process ensures resources are always
 * placed in a consistent location relative to the code.
 *
 * @param relativePath - Path relative to the resources/data directory (e.g., "agents.md")
 * @param callerUrl - Optional: The import.meta.url from the calling module (for ESM dev mode).
 *   Recommended in ESM mode; if omitted, paths are auto-corrected.
 * @returns Absolute path to the resource file
 * @throws Error if the file cannot be found
 */
export async function resolveResourcePath(
  relativePath: string,
  callerUrl?: string,
): Promise<string> {
  const baseDir = getResourceBaseDir(callerUrl);

  // Resources are in data/ relative to base directory:
  // - Dev: src/resources/agents.js -> src/resources/data/
  const resourcePath = path.join(baseDir, "data", relativePath);

  try {
    await fs.access(resourcePath);
    return resourcePath;
  } catch {
    // Fallback: if in src/utils/, try src/resources/data/
    if (baseDir.includes("src" + path.sep + "utils")) {
      const altBaseDir = baseDir.replace(
        "src" + path.sep + "utils",
        "src" + path.sep + "resources",
      );
      const altResourcePath = path.join(altBaseDir, "data", relativePath);
      try {
        await fs.access(altResourcePath);
        return altResourcePath;
      } catch {
        // Fall through to error
      }
    }

    // Fallback: if in src/utils/, try src/resources/data/
    if (
      baseDir.includes(
        "out" + path.sep + "server" + path.sep + "src" + path.sep + "utils",
      )
    ) {
      const altBaseDir = baseDir.replace(
        "out" + path.sep + "server" + path.sep + "src" + path.sep + "utils",
        "out" + path.sep + "server" + path.sep + "src" + path.sep + "resources",
      );
      const altResourcePath = path.join(altBaseDir, "data", relativePath);
      try {
        await fs.access(altResourcePath);
        return altResourcePath;
      } catch {
        // Fall through to error
      }
    }

    // Fallback: built output (dist/ and lib/)
    const builtResourcePath = await resolveBuiltResourcePath(
      baseDir,
      relativePath,
    );
    if (builtResourcePath) {
      return builtResourcePath;
    }

    const errorMsg =
      `Could not resolve resource path for "${relativePath}".\n` +
      `Base directory: ${baseDir}\n` +
      `Expected path: ${resourcePath}\n` +
      `This usually indicates a build or packaging issue. Ensure resources are copied during build.`;
    throw new Error(errorMsg);
  }
}
