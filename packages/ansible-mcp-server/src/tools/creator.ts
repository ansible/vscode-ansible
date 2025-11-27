import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Runs ansible-creator with the specified command and arguments.
 *
 * @param command - The ansible-creator command to run (e.g., 'init', 'list').
 * @param args - Additional arguments for the command.
 * @returns A promise that resolves with the output from ansible-creator.
 * @throws An error if the process fails or returns an error.
 */
export async function runCreator(
  args: string[] = [],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const creatorProcess = spawnSync("ansible-creator", args);

    const stdoutData = creatorProcess.stdout?.toString() || "";
    const stderrData = creatorProcess.stderr?.toString() || "";

    // Check if the process failed to spawn (command not found, etc.)
    if (creatorProcess.error) {
      return reject(
        new Error(
          `Failed to run ansible-creator: ${creatorProcess.error.message}`,
        ),
      );
    }

    // Check if the process exited with a non-zero status code
    if (creatorProcess.status !== 0) {
      const errorMessage = stderrData || stdoutData || "Unknown error";
      return reject(
        new Error(
          `ansible-creator exited with code ${creatorProcess.status}:\n${errorMessage}`,
        ),
      );
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
export function formatCreatorResult(
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
      // Step 1: Check if project type is specified
      if (!args.projectType) {
        return {
          content: [
            {
              type: "text" as const,
              text:
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
            },
          ],
          isError: false,
        };
      }

      // Step 2: Validate project type
      if (
        args.projectType !== "collection" &&
        args.projectType !== "playbook"
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Invalid project type '${args.projectType}'. Must be either 'collection' or 'playbook'.\n`,
            },
          ],
          isError: true,
        };
      }

      // Step 3: Check if namespace is provided
      // Check for undefined, null, empty string, or whitespace-only
      if (
        !args.namespace ||
        typeof args.namespace !== "string" ||
        args.namespace.trim().length === 0
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `**Missing required information for ${args.projectType} project:**\n\n` +
                `The **namespace** field is required and cannot be empty.\n\n` +
                `**Required fields:**\n` +
                `- **namespace**: The collection namespace (e.g., 'myorg', 'acme', 'company') - must be provided\n` +
                `- **collectionName**: The collection name (e.g., 'mycollection', 'webapp', 'database') - must be provided\n` +
                `- **projectDirectory**: The name of the project directory (e.g., 'my_playbook_proj', 'my_collection_proj') - must be provided\n\n` +
                `**Example:**\n` +
                `\`\`\`json\n` +
                `{"projectType": "${args.projectType}", "namespace": "myorg", "collectionName": "mycollection", "projectDirectory": "my_project_dir"}\n` +
                `\`\`\`\n\n` +
                `**Note:** Please provide actual values. Default values like 'my_org' or 'my_namespace' are not accepted.\n`,
            },
          ],
          isError: false,
        };
      }

      // Step 4: Check if collectionName is provided
      // Check for undefined, null, empty string, or whitespace-only
      if (
        !args.collectionName ||
        typeof args.collectionName !== "string" ||
        args.collectionName.trim().length === 0
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `**Missing required information for ${args.projectType} project:**\n\n` +
                `The **collectionName** field is required and cannot be empty.\n\n` +
                `**Required fields:**\n` +
                `- **namespace**: The collection namespace (e.g., 'myorg', 'acme', 'company') - provided: '${args.namespace}'\n` +
                `- **collectionName**: The collection name (e.g., 'mycollection', 'webapp', 'database') - must be provided\n` +
                `- **projectDirectory**: The name of the project directory (e.g., 'my_playbook_proj', 'my_collection_proj') - must be provided\n\n` +
                `**Example:**\n` +
                `\`\`\`json\n` +
                `{"projectType": "${args.projectType}", "namespace": "${args.namespace}", "collectionName": "mycollection", "projectDirectory": "my_project_dir"}\n` +
                `\`\`\`\n\n` +
                `**Note:** Please provide actual values. Default values like 'my_collection' are not accepted.\n`,
            },
          ],
          isError: false,
        };
      }

      // Trim whitespace from namespace and collectionName
      // At this point, TypeScript knows both are defined and are strings
      const namespace = args.namespace.trim();
      const collectionName = args.collectionName.trim();

      // Validate namespace and collectionName format individually
      if (!/^[a-z0-9_]+$/.test(namespace)) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Error: Invalid namespace '${namespace}'. ` +
                `Namespace must contain only lowercase letters, numbers, and underscores.\n`,
            },
          ],
          isError: true,
        };
      }

      if (!/^[a-z0-9_]+$/.test(collectionName)) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Error: Invalid collection name '${collectionName}'. ` +
                `Collection name must contain only lowercase letters, numbers, and underscores.\n`,
            },
          ],
          isError: true,
        };
      }

      // Construct full collection name from namespace and collectionName
      const fullCollectionName = `${namespace}.${collectionName}`;

      // Step 5: Check if project directory is provided
      if (!args.projectDirectory && !args.path) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `**Please provide a project directory name:**\n\n` +
                `To avoid creating projects in your home directory, please specify a directory name where the project should be created. ` +
                `The project will be scaffolded inside this directory within your workspace.\n\n` +
                `**Required field:**\n` +
                `- **projectDirectory**: The name of the project directory (e.g., 'my_playbook_proj', 'my_collection_proj')\n\n` +
                `**Example:**\n` +
                `\`\`\`json\n` +
                `{"projectType": "${args.projectType}", "namespace": "${args.namespace}", "collectionName": "${args.collectionName}", "projectDirectory": "my_playbook_proj"}\n` +
                `\`\`\`\n\n` +
                `**Note**: The project will be created at: \`${workspaceRoot}/<projectDirectory>\`\n`,
            },
          ],
          isError: false,
        };
      }

      // Step 6: Determine the project directory path
      let projectPath: string;

      if (args.path) {
        // If full path is provided, use it directly
        projectPath = args.path;
      } else if (args.projectDirectory) {
        // Create project directory in the workspace
        // We know projectDirectory is defined here because we checked earlier
        projectPath = join(workspaceRoot, args.projectDirectory);
        try {
          mkdirSync(projectPath, { recursive: true });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error creating project directory '${args.projectDirectory}': ${errorMessage}\n`,
              },
            ],
            isError: true,
          };
        }
      } else {
        // This should never happen due to earlier validation, but TypeScript needs it
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Project directory path could not be determined.\n`,
            },
          ],
          isError: true,
        };
      }

      // Step 7: Execute the ansible-creator command
      // Format: ansible-creator init <projectType> <namespace.collectionName> <destination-path>
      // For collections: creates at <path>/ansible_collections/<namespace>/<collectionName>
      // For playbooks: creates at <path>
      const creatorArgs = [
        "init",
        args.projectType,
        fullCollectionName,
        projectPath,
        "--no-overwrite",
      ];

      // Final safety check - ensure all required values are present and valid
      if (!args.projectType || !fullCollectionName || !projectPath) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Error: Missing required values for command execution.\n` +
                `- projectType: ${args.projectType || "missing"}\n` +
                `- collectionName: ${fullCollectionName || "missing"}\n` +
                `- projectPath: ${projectPath || "missing"}\n`,
            },
          ],
          isError: true,
        };
      }

      const result = await runCreator(creatorArgs);
      const formattedResult = formatCreatorResult(
        `init ${args.projectType}`,
        result,
      );

      const projectDescription =
        args.projectType === "collection"
          ? "Ansible collection"
          : "Ansible playbook project with adjacent collection";

      return {
        content: [
          {
            type: "text" as const,
            text:
              `✅ Successfully created ${projectDescription}\n\n` +
              formattedResult +
              `\n**Project Details:**\n` +
              `- Type: ${args.projectType}\n` +
              `- Collection Name: ${fullCollectionName}\n` +
              `- Project Path: ${projectPath}\n`,
          },
        ],
      };
    } catch (error) {
      /* v8 ignore next -- @preserve */
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating project: ${errorMessage}\n`,
          },
        ],
        isError: true,
      };
    }
  };
}
