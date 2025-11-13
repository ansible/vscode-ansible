/**
 * The schema is packaged with the extension for offline access.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Schema file packaged with the extension
// In compiled output, files are in out/server/src/resources/data/
// In source, files are in src/resources/data/
const SCHEMA_FILE = path.join(
  __dirname,
  "data/execution-environment-schema.json",
);
const RULES_FILE = path.join(__dirname, "data/ee-rules.md");
// Sample EE file packaged with the extension
export const SAMPLE_EE_FILE = path.join(
  __dirname,
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
