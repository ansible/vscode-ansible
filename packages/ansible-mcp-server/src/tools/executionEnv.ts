import fs from "node:fs/promises";
import path from "node:path";
import * as yaml from "yaml";
import Ajv from "ajv";
import ajvFormats from "ajv-formats";
import {
  getExecutionEnvironmentSchema,
  getEERules,
  getSampleExecutionEnvironment,
} from "../resources/eeSchema.js";

export interface ExecutionEnvInputs {
  baseImage: string;
  tag: string;
  destinationPath?: string;
  collections?: string[];
  systemPackages?: string[];
  pythonPackages?: string[];
}

export interface ExecutionEnvResult {
  success: boolean;
  filePath: string;
  yamlContent: string;
  message: string;
  buildCommand: string;
  validationErrors?: string[];
}

// Validates the generated EE data against the v3 schema
async function validateAgainstSchema(
  eeData: Record<string, unknown>,
): Promise<{ valid: boolean; errors: string[] }> {
  try {
    const schema = await getExecutionEnvironmentSchema();

    // Create AJV validator with formats support
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateSchema: false, // Don't validate the schema itself
    });
    ajvFormats(ajv);

    // Compile the v3 schema with $defs included so AJV can resolve $ref references
    // The v3 schema references "#/$defs/TYPE_StringOrListOfStrings" which needs $defs to be available
    const v3Schema = {
      $schema: "http://json-schema.org/draft-07/schema",
      $defs: schema.$defs, // Include $defs so references like "#/$defs/TYPE_StringOrListOfStrings" can be resolved
      ...schema.$defs.v3,
    };

    const validate = ajv.compile(v3Schema);
    const valid = validate(eeData);

    if (!valid && validate.errors) {
      const errors = validate.errors.map(
        (err) =>
          `${err.instancePath || "/"} ${err.message}${err.params ? ` (${JSON.stringify(err.params)})` : ""}`,
      );
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  } catch (error) {
    // If validation fails due to schema issues, log but don't fail generation
    console.warn(
      `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      valid: false,
      errors: [
        `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

// Generates EE file using MCP client's LLM through prompt-based approach
// Returns a prompt that the client's LLM will process to generate the YAML
// The tool handler will then parse the LLM's response and write the file
export async function buildEEStructureFromPrompt(
  inputs: ExecutionEnvInputs,
): Promise<{ prompt: string; generatedYaml?: string }> {
  // Read the rules file to use as prompt context
  const rulesContent = await getEERules();
  const sampleContent = await getSampleExecutionEnvironment();

  // Construct a prompt that includes rules, sample, and user inputs
  const prompt = `You are generating an Ansible Execution Environment (EE) definition file.

RULES AND GUIDELINES:
${rulesContent}

SAMPLE EE FILE STRUCTURE:
${sampleContent}

USER REQUIREMENTS:
- Base Image: ${inputs.baseImage}
- Tag: ${inputs.tag}
${inputs.collections && inputs.collections.length > 0 ? `- Collections: ${inputs.collections.join(", ")}` : ""}
${inputs.systemPackages && inputs.systemPackages.length > 0 ? `- System Packages: ${inputs.systemPackages.join(", ")}` : ""}
${inputs.pythonPackages && inputs.pythonPackages.length > 0 ? `- Python Packages: ${inputs.pythonPackages.join(", ")}` : ""}

Generate a valid execution-environment.yml file following ALL rules from the rules file above.
Pay special attention to:
1. Mandatory collections must be included
2. Required dependencies in correct order
3. Section ordering
4. Conditional build steps (e.g., Fedora base images)
5. Proper YAML formatting

Return ONLY valid YAML content that can be parsed. Do not include any markdown code fences, just the raw YAML.`;

  return { prompt };
}

// Parses LLM-generated YAML content
function parseLLMGeneratedYAML(generatedYaml: string): Record<string, unknown> {
  // Remove markdown code fences if present
  const cleanedYaml = generatedYaml
    .replace(/^```yaml\n?/i, "")
    .replace(/^```\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  try {
    const eeData = yaml.parse(cleanedYaml) as Record<string, unknown>;
    return eeData;
  } catch (parseError) {
    throw new Error(
      `Failed to parse LLM-generated YAML: ${parseError instanceof Error ? parseError.message : String(parseError)}\n\nGenerated content:\n${cleanedYaml}`,
    );
  }
}

// Generates an execution environment YAML file based on user inputs
// following the schema format and validating against the schema
// Uses MCP client's LLM to generate the file based on rules
// The generatedYaml parameter should contain the LLM-generated YAML content
export async function generateExecutionEnvironment(
  inputs: ExecutionEnvInputs,
  workspaceRoot: string,
  generatedYaml: string, // LLM-generated YAML content from the client
): Promise<ExecutionEnvResult> {
  const destinationPath =
    inputs.destinationPath || workspaceRoot || process.cwd();

  // Ensure destination directory exists
  try {
    await fs.mkdir(destinationPath, { recursive: true });
  } catch (error) {
    throw new Error(
      `Failed to create destination directory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Parse the LLM-generated YAML for validation
  const eeData = parseLLMGeneratedYAML(generatedYaml);

  // Validate against the schema
  const validation = await validateAgainstSchema(eeData);

  if (!validation.valid) {
    console.warn("Schema validation errors:", validation.errors);
  }

  // Use the original LLM-generated YAML (cleaned of code fences)
  // The LLM is responsible for formatting according to the rules
  const cleanedYaml = generatedYaml
    .replace(/^```yaml\n?/i, "")
    .replace(/^```\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  // Write file with LLM-generated content
  const filePath = path.join(destinationPath, "execution-environment.yml");

  try {
    await fs.writeFile(filePath, cleanedYaml, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to write execution-environment.yml: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Generate build command
  const buildCommand = `ansible-builder build --file ${filePath} --context ${destinationPath}/context --tag ${inputs.tag}`;

  return {
    success: true,
    filePath,
    yamlContent: cleanedYaml,
    message: `Execution environment file created successfully at ${filePath}`,
    buildCommand,
    validationErrors: validation.valid ? undefined : validation.errors,
  };
}

// Formats the result message for the LLM with instructions
export function formatExecutionEnvResult(result: ExecutionEnvResult): string {
  console.log("[formatExecutionEnvResult] Called with result:", {
    success: result.success,
    filePath: result.filePath,
    hasYamlContent: !!result.yamlContent,
    yamlContentLength: result.yamlContent?.length,
    validationErrors: result.validationErrors,
  });

  let output = `✅ ${result.message}\n\n`;

  // Show validation warnings if any
  if (result.validationErrors && result.validationErrors.length > 0) {
    output += `⚠️ **Schema Validation Warnings:**\n`;
    result.validationErrors.forEach((error) => {
      output += `- ${error}\n`;
    });
    output += `\nThe file was generated but may not fully comply with the schema. Please review.\n\n`;
  } else {
    output += `✓ The generated file has been validated against the execution environment schema.\n\n`;
  }

  output += `📄 Generated execution-environment.yml:\n\`\`\`yaml\n${result.yamlContent}\`\`\`\n\n`;

  output += `🔨 **To build the execution environment image, run:**\n`;
  output += `\`\`\`bash\n${result.buildCommand}\n\`\`\`\n\n`;

  output += `**Note:** Before building, ensure you have:\n`;
  output += `- ansible-builder installed (install via: pip install ansible-builder or via ADT)\n`;
  output += `- A container runtime (podman or docker) installed and running\n`;
  output += `- Sufficient permissions to build container images\n\n`;

  output += `**Additional commands you might want to use:**\n`;
  output += `- Create build context only: \`ansible-builder create --file ${result.filePath} --context ${path.dirname(result.filePath)}/context\`\n`;
  output += `- Build with custom tag: \`ansible-builder build --file ${result.filePath} --context ${path.dirname(result.filePath)}/context --tag your-custom-tag\`\n`;

  console.log(
    "[formatExecutionEnvResult] Generated output length:",
    output.length,
  );
  console.log(
    "[formatExecutionEnvResult] Output preview (first 300 chars):",
    output.substring(0, 300),
  );

  return output;
}
