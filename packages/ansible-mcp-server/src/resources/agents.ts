/**
 * The agents.md file is packaged with the extension for offline access.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Agents guidelines file packaged with the extension
// In compiled output, files are in out/server/src/resources/data/
// In source, files are in src/resources/data/
const AGENTS_FILE = path.join(__dirname, "data/agents.md");

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
