/**
 * The schema is packaged with the extension for offline access.
 */
import fs from "node:fs/promises";
import { resolveResourcePath } from "../utils/resourcePath.js";

/**
 * Get the path to execution-environment-schema.json file.
 */
async function getSchemaFilePath(): Promise<string> {
  return await resolveResourcePath(
    "execution-environment-schema.json",
    import.meta.url,
  );
}

/**
 * Get the path to ee-rules.md file.
 */
async function getRulesFilePath(): Promise<string> {
  return await resolveResourcePath("ee-rules.md", import.meta.url);
}

/**
 * Get the path to execution-environment-sample.yml file.
 */
async function getSampleEEFilePath(): Promise<string> {
  return await resolveResourcePath(
    "execution-environment-sample.yml",
    import.meta.url,
  );
}

interface ExecutionEnvironmentSchema {
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
    const schemaFile = await getSchemaFilePath();
    const schemaContent = await fs.readFile(schemaFile, "utf8");
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
    const sampleFile = await getSampleEEFilePath();
    const sampleContent = await fs.readFile(sampleFile, "utf8");
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
    const rulesFile = await getRulesFilePath();
    const rulesContent = await fs.readFile(rulesFile, "utf8");
    return rulesContent;
  } catch (error) {
    throw new Error(
      `Error loading ee-rules.md file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
