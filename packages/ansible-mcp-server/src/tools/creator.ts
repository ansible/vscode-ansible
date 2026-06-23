import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { validatePathWithinWorkspace } from "@src/utils/pathValidation.js";

interface HandlerResponse {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Runs ansible-creator with the specified command and arguments.
 *
 * @param args - Additional arguments for the command.
 * @returns A promise that resolves with the output from ansible-creator.
 * @throws An error if the process fails or returns an error.
 */
async function runCreator(
  args: string[] = [],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const creatorProcess = spawnSync("ansible-creator", args);

    const stdoutData = creatorProcess.stdout?.toString() || "";
    const stderrData = creatorProcess.stderr?.toString() || "";

    if (creatorProcess.error) {
      reject(
        new Error(
          `Failed to run ansible-creator: ${creatorProcess.error.message}`,
        ),
      );
      return;
    }

    if (creatorProcess.status !== 0) {
      const errorMessage = stderrData || stdoutData || "Unknown error";
      reject(
        new Error(
          `ansible-creator exited with code ${creatorProcess.status}:\n${errorMessage}`,
        ),
      );
      return;
    }

    resolve({
      stdout: stdoutData,
      stderr: stderrData,
    });
  });
}

/**
 * Formats the ansible-creator result into a user-friendly message
 */
function formatCreatorResult(
  command: string,
  result: { stdout: string; stderr: string },
): string {
  let output = `✅ ansible-creator ${command} completed successfully\n\n`;

  /* v8 ignore if -- @preserve */
  if (result.stdout) {
    output += `Output:\n${result.stdout}\n`;
  }

  /* v8 ignore if -- @preserve */
  if (result.stderr) {
    output += `\nAdditional information:\n${result.stderr}\n`;
  }

  return output;
}

function makeResponse(text: string, isError?: boolean): HandlerResponse {
  const response: HandlerResponse = {
    content: [{ type: "text" as const, text }],
  };
  if (isError !== undefined) {
    response.isError = isError;
  }
  return response;
}

function validateProjectType(
  projectType: string | undefined,
): HandlerResponse | null {
  if (!projectType) {
    return makeResponse(
      "**Please specify the project type you want to create:**\n\n" +
        "1. **collection** - Create an Ansible collection project\n" +
        "2. **playbook** - Create an Ansible playbook project\n\n" +
        "**Required fields:**\n" +
        "- **projectType**: Either 'collection' or 'playbook'\n" +
        "- **namespace**: The collection namespace (e.g., 'myorg')\n" +
        "- **collectionName**: The collection name (e.g., 'mycollection')\n" +
        "- **projectDirectory**: The name of the project directory (e.g., 'my_playbook_proj', 'my_collection_proj')\n\n" +
        "**Example for collection:**\n" +
        '```json\n{"projectType": "collection", "namespace": "myorg", "collectionName": "mycollection", "projectDirectory": "my_collection_proj"}\n```\n\n' +
        "**Example for playbook:**\n" +
        '```json\n{"projectType": "playbook", "namespace": "myorg", "collectionName": "myproject", "projectDirectory": "my_playbook_proj"}\n```\n',
    );
  }

  if (projectType !== "collection" && projectType !== "playbook") {
    return makeResponse(
      `Error: Invalid project type '${String(projectType)}'. Must be either 'collection' or 'playbook'.\n`,
      true,
    );
  }

  return null;
}

function validateNamespace(
  namespace: string | undefined,
  projectType: string,
): HandlerResponse | null {
  if (
    !namespace ||
    typeof namespace !== "string" ||
    namespace.trim().length === 0
  ) {
    return makeResponse(
      `**Missing required information for ${projectType} project:**\n\n` +
        `The **namespace** field is required and cannot be empty.\n\n` +
        `**Required fields:**\n` +
        `- **namespace**: The collection namespace (e.g., 'myorg', 'acme', 'company') - must be provided\n` +
        `- **collectionName**: The collection name (e.g., 'mycollection', 'webapp', 'database') - must be provided\n` +
        `- **projectDirectory**: The name of the project directory (e.g., 'my_playbook_proj', 'my_collection_proj') - must be provided\n\n` +
        `**Example:**\n` +
        `\`\`\`json\n` +
        `{"projectType": "${projectType}", "namespace": "myorg", "collectionName": "mycollection", "projectDirectory": "my_project_dir"}\n` +
        `\`\`\`\n\n` +
        `**Note:** Please provide actual values. Default values like 'my_org' or 'my_namespace' are not accepted.\n`,
      false,
    );
  }

  if (!/^[a-z0-9_]+$/.test(namespace.trim())) {
    return makeResponse(
      `Error: Invalid namespace '${namespace.trim()}'. ` +
        `Namespace must contain only lowercase letters, numbers, and underscores.\n`,
      true,
    );
  }

  return null;
}

function validateCollectionName(
  collectionName: string | undefined,
  projectType: string,
  namespace: string,
): HandlerResponse | null {
  if (
    !collectionName ||
    typeof collectionName !== "string" ||
    collectionName.trim().length === 0
  ) {
    return makeResponse(
      `**Missing required information for ${projectType} project:**\n\n` +
        `The **collectionName** field is required and cannot be empty.\n\n` +
        `**Required fields:**\n` +
        `- **namespace**: The collection namespace (e.g., 'myorg', 'acme', 'company') - provided: '${namespace}'\n` +
        `- **collectionName**: The collection name (e.g., 'mycollection', 'webapp', 'database') - must be provided\n` +
        `- **projectDirectory**: The name of the project directory (e.g., 'my_playbook_proj', 'my_collection_proj') - must be provided\n\n` +
        `**Example:**\n` +
        `\`\`\`json\n` +
        `{"projectType": "${projectType}", "namespace": "${namespace}", "collectionName": "mycollection", "projectDirectory": "my_project_dir"}\n` +
        `\`\`\`\n\n` +
        `**Note:** Please provide actual values. Default values like 'my_collection' are not accepted.\n`,
      false,
    );
  }

  if (!/^[a-z0-9_]+$/.test(collectionName.trim())) {
    return makeResponse(
      `Error: Invalid collection name '${collectionName.trim()}'. ` +
        `Collection name must contain only lowercase letters, numbers, and underscores.\n`,
      true,
    );
  }

  return null;
}

function resolveProjectPath(
  args: { projectDirectory?: string; path?: string },
  workspaceRoot: string,
): { projectPath?: string; error?: HandlerResponse } {
  if (args.path) {
    try {
      return {
        projectPath: validatePathWithinWorkspace(args.path, workspaceRoot),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { error: makeResponse(`Error: ${errorMessage}\n`, true) };
    }
  }

  if (args.projectDirectory) {
    const rawPath = join(workspaceRoot, args.projectDirectory);
    try {
      const projectPath = validatePathWithinWorkspace(rawPath, workspaceRoot);
      mkdirSync(projectPath, { recursive: true });
      return { projectPath };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        error: makeResponse(
          `Error creating project directory '${args.projectDirectory}': ${errorMessage}\n`,
          true,
        ),
      };
    }
  }

  return {
    error: makeResponse(
      `Error: Project directory path could not be determined.\n`,
      true,
    ),
  };
}

/**
 * Creates a handler for ansible-creator init commands that supports both
 * collection and playbook project types with interactive prompts
 */
export function createProjectsHandler(workspaceRoot: string) {
  return async (args: {
    projectType?: "playbook" | "collection";
    namespace?: string;
    collectionName?: string;
    projectDirectory?: string;
    path?: string;
  }) => {
    try {
      const typeError = validateProjectType(args.projectType);
      if (typeError) return typeError;

      const projectType = args.projectType as "playbook" | "collection";

      const nsError = validateNamespace(args.namespace, projectType);
      if (nsError) return nsError;

      const namespace = (args.namespace as string).trim();

      const cnError = validateCollectionName(
        args.collectionName,
        projectType,
        namespace,
      );
      if (cnError) return cnError;

      const collectionName = (args.collectionName as string).trim();
      const fullCollectionName = `${namespace}.${collectionName}`;

      if (!args.projectDirectory && !args.path) {
        return makeResponse(
          `**Please provide a project directory name:**\n\n` +
            `To avoid creating projects in your home directory, please specify a directory name where the project should be created. ` +
            `The project will be scaffolded inside this directory within your workspace.\n\n` +
            `**Required field:**\n` +
            `- **projectDirectory**: The name of the project directory (e.g., 'my_playbook_proj', 'my_collection_proj')\n\n` +
            `**Example:**\n` +
            `\`\`\`json\n` +
            `{"projectType": "${projectType}", "namespace": "${namespace}", "collectionName": "${collectionName}", "projectDirectory": "my_playbook_proj"}\n` +
            `\`\`\`\n\n` +
            `**Note**: The project will be created at: \`${workspaceRoot}/<projectDirectory>\`\n`,
        );
      }

      const { projectPath, error: pathError } = resolveProjectPath(
        args,
        workspaceRoot,
      );
      if (pathError || !projectPath) {
        return (
          pathError ??
          makeResponse(
            `Error: Missing required values for command execution.\n` +
              `- projectType: ${projectType || "missing"}\n` +
              `- collectionName: ${fullCollectionName || "missing"}\n` +
              `- projectPath: missing\n`,
            true,
          )
        );
      }

      const creatorArgs = [
        "init",
        projectType,
        fullCollectionName,
        projectPath,
        "--no-overwrite",
      ];

      const result = await runCreator(creatorArgs);
      const formattedResult = formatCreatorResult(
        `init ${projectType}`,
        result,
      );

      const projectDescription =
        projectType === "collection"
          ? "Ansible collection"
          : "Ansible playbook project with adjacent collection";

      return makeResponse(
        `✅ Successfully created ${projectDescription}\n\n` +
          formattedResult +
          `\n**Project Details:**\n` +
          `- Type: ${projectType}\n` +
          `- Collection Name: ${fullCollectionName}\n` +
          `- Project Path: ${projectPath}\n`,
      );
    } catch (error) {
      /* v8 ignore next -- @preserve */
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return makeResponse(`Error creating project: ${errorMessage}\n`, true);
    }
  };
}
