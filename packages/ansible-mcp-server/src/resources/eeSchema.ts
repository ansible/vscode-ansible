/**
 * The schema is packaged with the extension for offline access.
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

// Schema file packaged with the extension
// In compiled output, files are in out/mcp/data/
// In source, files are in src/resources/data/
const SCHEMA_FILE = path.join(
  resourceDir,
  "data/execution-environment-schema.json",
);
const RULES_FILE = path.join(resourceDir, "data/ee-rules.md");
// Sample EE file packaged with the extension
export const SAMPLE_EE_FILE = path.join(
  resourceDir,
  "data/execution-environment-sample.yml",
);

export interface ExecutionEnvironmentSchema {
  $defs: {
    v3: {
      properties: Record<string, unknown>;
      required: string[];
    };
    v1: {
      properties: Record<string, unknown>;
      required: string[];
    };
  };
  oneOf: Array<{ $ref: string }>;
  [key: string]: unknown;
}

/**
 * Get the schema from the packaged file
 */
export async function getExecutionEnvironmentSchema(): Promise<ExecutionEnvironmentSchema> {
  try {
    const schemaContent = await fs.readFile(SCHEMA_FILE, "utf8");
    const schema = JSON.parse(schemaContent) as ExecutionEnvironmentSchema;

    // Validate that it has the expected structure
    if (!schema.$defs?.v3 || !schema.oneOf) {
      throw new Error(
        "Schema file is missing required structure ($defs.v3 or oneOf)",
      );
    }

    return schema;
  } catch (error) {
    throw new Error(
      `Error loading execution environment schema from packaged file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get the sample execution environment file content
 */
export async function getSampleExecutionEnvironment(): Promise<string> {
  try {
    const sampleContent = await fs.readFile(SAMPLE_EE_FILE, "utf8");
    return sampleContent;
  } catch (error) {
    throw new Error(
      `Error loading sample execution environment file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get ee-rules.md file content
 */
export async function getEERules(): Promise<string> {
  try {
    const rulesContent = await fs.readFile(RULES_FILE, "utf8");
    return rulesContent;
  } catch (error) {
    throw new Error(
      `Error loading ee-rules.md file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
