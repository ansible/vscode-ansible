/**
 * Resource path resolution utility.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Works generically in any environment (dev, bundled, CI, production) by resolving
 * relative to the module's location. The build process ensures resources are always
 * placed in a consistent location relative to the code.
 *
 * @param relativePath - Path relative to the resources/data directory (e.g., "agents.md")
 * @param callerUrl - The import.meta.url from the calling module
 * @returns Absolute path to the resource file
 * @throws Error if the file cannot be found
 */
export async function resolveResourcePath(
  relativePath: string,
  callerUrl: string = import.meta.url,
): Promise<string> {
  // Get the directory of the calling module
  // This works in all environments: dev, bundled, CI, production
  const moduleDir = path.dirname(fileURLToPath(callerUrl));
  const debug = process.env.DEBUG === "true" || process.env.DEBUG === "1";

  if (debug) {
    console.log(`[resourcePath] Resolving: ${relativePath}`);
    console.log(`[resourcePath] Module dir: ${moduleDir}`);
  }

  // Resources are always in data/ relative to the module directory
  // Build process ensures this structure:
  // - Dev: out/server/src/resources/agents.js -> out/server/src/resources/data/
  // - Bundled: out/mcp/cli.js -> out/mcp/data/
  const resourcePath = path.join(moduleDir, "data", relativePath);

  try {
    await fs.access(resourcePath);
    if (debug) console.log(`[resourcePath] ✓ Found at: ${resourcePath}`);
    return resourcePath;
  } catch (error) {
    const errorMsg =
      `Could not resolve resource path for "${relativePath}".\n` +
      `Module location: ${moduleDir}\n` +
      `Expected path: ${resourcePath}\n` +
      `This usually indicates a build or packaging issue. Ensure resources are copied during build.`;
    if (debug) {
      console.error(`[resourcePath] ${errorMsg}`);
      console.error(
        `[resourcePath] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    throw new Error(errorMsg);
  }
}
