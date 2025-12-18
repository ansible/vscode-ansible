/**
 * The agents.md file is packaged with the extension for offline access.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getResourceDir(): string {
  // Check for MCP_RESOURCE_DIR environment variable set by the extension
  if (
    typeof process !== "undefined" &&
    process.env &&
    process.env.MCP_RESOURCE_DIR &&
    typeof process.env.MCP_RESOURCE_DIR === "string" &&
    process.env.MCP_RESOURCE_DIR.length > 0
  ) {
    return process.env.MCP_RESOURCE_DIR;
  }

  // Fallback: This works correctly when code is not bundled (dev/test/standalone)
  const __filename = fileURLToPath(import.meta.url);
  return path.join(path.dirname(__filename), "data");
}

const resourceDir = getResourceDir();
const AGENTS_FILE = path.join(resourceDir, "agents.md");

/**
 * Get the agents.md file content from the packaged file.
 */
export async function getAgentsGuidelines(): Promise<string> {
  try {
    const guidelinesContent = await fs.readFile(AGENTS_FILE, "utf8");
    return guidelinesContent;
  } catch (error) {
    throw new Error(
      `Error loading agents.md file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
