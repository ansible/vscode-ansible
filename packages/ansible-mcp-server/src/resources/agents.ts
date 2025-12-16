/**
 * The agents.md file is packaged with the extension for offline access.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory where resources are located
// In bundled output (out/mcp/cli.js), resources are at out/mcp/data/
// In source/dev/test mode, resources are at src/resources/data/
function getResourceDir(): string {
  // In bundled mode, process.argv[1] points to the entry script (out/mcp/cli.js)
  // Check if process.argv[1] exists, is a non-empty string, and matches our bundled CLI script pattern
  if (
    typeof process !== "undefined" &&
    process.argv &&
    process.argv[1] &&
    typeof process.argv[1] === "string" &&
    process.argv[1].length > 0
  ) {
    const cliPath = process.argv[1];
    if (cliPath.endsWith("mcp/cli.js") || cliPath.includes("out/mcp/cli.js")) {
      return path.dirname(cliPath);
    }
  }

  // Fall back to import.meta.url for dev mode, test mode, and other scenarios
  // This works correctly when code is not bundled (dev/test with ts-node/vitest)
  const __filename = fileURLToPath(import.meta.url);
  return path.dirname(__filename);
}

const resourceDir = getResourceDir();

// Agents guidelines file packaged with the extension
// In compiled output, files are in out/mcp/data/
// In source, files are in src/resources/data/
const AGENTS_FILE = path.join(resourceDir, "data/agents.md");

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
