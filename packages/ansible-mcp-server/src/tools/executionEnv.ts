import fs from "node:fs/promises";
import path from "node:path";
import * as yaml from "yaml";
import Ajv from "ajv";
import ajvFormats from "ajv-formats";
import { getExecutionEnvironmentSchema } from "../resources/eeSchema.js";

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

// Builds the EE file based on the schema definition, matching the sample structure
// Order: version, images, dependencies, additional_build_steps, options
async function buildEEStructureFromSchema(
  inputs: ExecutionEnvInputs,
): Promise<Record<string, unknown>> {
  // Build dependencies in the order matching the sample file:
  // python_interpreter, ansible_core, ansible_runner, system, python, galaxy
  const dependencies: Record<string, unknown> = {};

  // Add python_interpreter first (matching sample structure)
  dependencies.python_interpreter = {
    package_system: "python3",
    python_path: "/usr/bin/python3",
  };

  // Add ansible_core and ansible_runner (required)
  dependencies.ansible_core = { package_pip: "ansible-core" };
  dependencies.ansible_runner = { package_pip: "ansible-runner" };

  // Add system packages if provided (before python and galaxy)
  if (inputs.systemPackages && inputs.systemPackages.length > 0) {
    const systemPkgs = inputs.systemPackages
      .map((pkg) => pkg.trim())
      .filter((pkg) => pkg !== "");
    if (systemPkgs.length > 0) {
      dependencies.system = systemPkgs;
    }
  }

  // Add Python packages if provided (before galaxy)
  if (inputs.pythonPackages && inputs.pythonPackages.length > 0) {
    const pythonPkgs = inputs.pythonPackages
      .map((pkg) => pkg.trim())
      .filter((pkg) => pkg !== "");
    if (pythonPkgs.length > 0) {
      dependencies.python = pythonPkgs;
    }
  }

  // Add collections if provided (last in dependencies, matching sample)
  if (inputs.collections && inputs.collections.length > 0) {
    dependencies.galaxy = {
      collections: inputs.collections.map((col) => ({ name: col.trim() })),
    };
  }

  // Build the EE data structure in the order matching the sample:
  // version, images, dependencies, additional_build_steps, options
  const eeData: Record<string, unknown> = {
    version: 3,
  };

  // Add images section (second, matching sample)
  eeData.images = {
    base_image: {
      name: inputs.baseImage,
    },
  };

  // Add dependencies (third, matching sample)
  eeData.dependencies = dependencies;

  // Build options section (will be added last)
  const options: Record<string, unknown> = {
    tags: [inputs.tag],
  };

  // Add additional_build_steps before options (matching sample order)
  const baseImageLower = inputs.baseImage.toLowerCase();
  if (baseImageLower.includes("fedora")) {
    eeData.additional_build_steps = {
      append_base: ["RUN $PYCMD -m pip install -U pip"],
    };
  }

  // Add options last (matching sample)
  eeData.options = options;

  return eeData;
}

// Generates an execution environment YAML file based on user inputs
// following the schema format and validating against the schema
export async function generateExecutionEnvironment(
  inputs: ExecutionEnvInputs,
  workspaceRoot: string,
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

  // Build the execution environment definition file
  const eeData = await buildEEStructureFromSchema(inputs);

  // Validate against the schema
  const validation = await validateAgainstSchema(eeData);

  if (!validation.valid) {
    console.warn("Schema validation errors:", validation.errors);
  }

  // Convert to YAML with formatting to match sample structure
  let yamlContent = yaml.stringify(eeData, {
    indent: 2,
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
    // Add document separator to match sample
    directives: true,
  });

  // Post-process to add blank lines between top-level sections to match sample structure
  // The sample has: ---, version, blank line, images, blank line, dependencies, blank line, additional_build_steps, blank line, options
  if (!yamlContent.startsWith("---")) {
    yamlContent = "---\n" + yamlContent;
  }

  // Ensure blank lines between top-level sections (matching sample structure)
  yamlContent = yamlContent
    .replace(/^version: 3\n/, "version: 3\n\n") // Blank line after version
    .replace(/\nimages:\n/g, "\n\nimages:\n") // Blank line before images
    .replace(/\n\ndependencies:\n/g, "\n\ndependencies:\n") // Blank line before dependencies
    .replace(/\n\nadditional_build_steps:\n/g, "\n\nadditional_build_steps:\n") // Blank line before additional_build_steps
    .replace(/\n\noptions:\n/g, "\n\noptions:\n"); // Blank line before options

  // Write file
  const filePath = path.join(destinationPath, "execution-environment.yml");

  try {
    await fs.writeFile(filePath, yamlContent, "utf8");
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
    yamlContent,
    message: `Execution environment file created successfully at ${filePath}`,
    buildCommand,
    validationErrors: validation.valid ? undefined : validation.errors,
  };
}

// Formats the result message for the LLM with instructions
export function formatExecutionEnvResult(result: ExecutionEnvResult): string {
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

  return output;
}
