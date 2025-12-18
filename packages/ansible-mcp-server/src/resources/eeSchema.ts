/**
 * The schema is packaged with the extension for offline access.
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

const SCHEMA_FILE = path.join(resourceDir, "execution-environment-schema.json");
const RULES_FILE = path.join(resourceDir, "ee-rules.md");

export const SAMPLE_EE_FILE = path.join(
  resourceDir,
  "execution-environment-sample.yml",
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
