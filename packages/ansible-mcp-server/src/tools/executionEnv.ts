import fs from "node:fs/promises";
import path from "node:path";
import * as yaml from "yaml";
import Ajv from "ajv";
import ajvFormats from "ajv-formats";
import {
  getExecutionEnvironmentSchema,
  getV3SchemaDefinition,
  type ExecutionEnvironmentSchema,
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

    // First, add the full schema with $defs to AJV's schema store
    // This allows AJV to resolve $ref references like "#/$defs/TYPE_StringOrListOfStrings"
    const fullSchemaWithDefs = {
      $schema: "http://json-schema.org/draft-07/schema",
      $id: "#", // Root ID for reference resolution
      ...schema, // Include the full schema with $defs
    };

    // Add the schema to AJV's store so $ref references can be resolved
    ajv.addSchema(fullSchemaWithDefs, "#");

    // Now compile just the v3 schema definition - AJV will resolve $refs from the stored schema
    const v3Schema = {
      $schema: "http://json-schema.org/draft-07/schema",
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

// Builds the EE file based on the schema definition
async function buildEEStructureFromSchema(
  inputs: ExecutionEnvInputs,
): Promise<Record<string, unknown>> {
  // Get the v3 schema to understand the structure
  const v3Schema = await getV3SchemaDefinition();

  // Start with required fields from schema
  const eeData: Record<string, unknown> = {
    version: 3,
    dependencies: {},
  };

  // Build dependencies according to schema structure
  const dependencies: Record<string, unknown> = {
    ansible_core: { package_pip: "ansible-core" },
    ansible_runner: { package_pip: "ansible-runner" },
  };

  // Add collections if provided
  if (inputs.collections && inputs.collections.length > 0) {
    dependencies.galaxy = {
      collections: inputs.collections.map((col) => ({ name: col.trim() })),
    };
  }

  // Add system packages if provided
  if (inputs.systemPackages && inputs.systemPackages.length > 0) {
    const systemPkgs = inputs.systemPackages
      .map((pkg) => pkg.trim())
      .filter((pkg) => pkg !== "");
    if (systemPkgs.length > 0) {
      dependencies.system = systemPkgs;
    }
  }

  // Add Python packages if provided
  if (inputs.pythonPackages && inputs.pythonPackages.length > 0) {
    const pythonPkgs = inputs.pythonPackages
      .map((pkg) => pkg.trim())
      .filter((pkg) => pkg !== "");
    if (pythonPkgs.length > 0) {
      dependencies.python = pythonPkgs;
    }
  }

  eeData.dependencies = dependencies;

  // Build images section (schema requires base_image with name)
  eeData.images = {
    base_image: {
      name: inputs.baseImage,
    },
  };

  // Build options section (schema allows tags array)
  const options: Record<string, unknown> = {
    tags: [inputs.tag],
  };

  // Handle special cases for base images
  const baseImageLower = inputs.baseImage.toLowerCase();
  if (baseImageLower.includes("fedora")) {
    options.package_manager_path = "/usr/bin/dnf5";
  } else if (
    baseImageLower.includes("rhel") ||
    baseImageLower.includes("redhat")
  ) {
    options.package_manager_path = "/usr/bin/microdnf";
  }

  eeData.options = options;

  // Add build steps for Fedora if needed (schema allows additional_build_steps)
  if (baseImageLower.includes("fedora")) {
    eeData.additional_build_steps = {
      prepend_base: ["RUN $PKGMGR -y -q install python3-devel"],
    };
  }

  return eeData;
}

// Generates an execution environment YAML file based on user inputs
// following the v3 schema format and validating against the schema
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

  // Convert to YAML
  const yamlContent = yaml.stringify(eeData, {
    indent: 2,
    lineWidth: 0,
  });

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
