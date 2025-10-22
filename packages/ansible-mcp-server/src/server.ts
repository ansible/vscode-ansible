import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createZenOfAnsibleHandler,
  createListToolsHandler,
  createAnsibleLintHandler,
  createDebugEnvHandler,
  createADEEnvironmentInfoHandler,
  createADESetupEnvironmentHandler,
  createADECheckADTHandler,
} from "./handlers.js";
import {
  checkDependencies,
  formatDependencyError,
  type Dependency,
} from "./dependencyChecker.js";

export function createAnsibleMcpServer(workspaceRoot: string) {
  const server = new McpServer({
    name: "ansible-mcp-server",
    version: "0.1.0",
  });

  // Track registered tools for error messages
  const registeredTools = new Set<string>();

  // Track tool dependencies
  const toolDependencies = new Map<string, Dependency[]>();

  // Store original registerTool method
  const originalRegisterTool = server.registerTool.bind(server);

  // Helper function to register a tool with dependencies
  const registerToolWithDeps = (
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: any,
    dependencies: Dependency[] = [],
  ) => {
    registeredTools.add(name);
    toolDependencies.set(name, dependencies);
    return originalRegisterTool(name, config, handler);
  };

  // Register core tools
  registerToolWithDeps(
    "zen_of_ansible",
    {
      title: "The Zen of Ansible",
      description: "20 aphorisms that describe Ansible's design philosophy.",
    },
    createZenOfAnsibleHandler(),
    [], // No dependencies
  );

  registerToolWithDeps(
    "list_available_tools",
    {
      title: "List Available Tools",
      description:
        "Shows all available Ansible MCP tools. Use this to discover what tools you can use.",
    },
    createListToolsHandler(() => Array.from(registeredTools)),
    [], // No dependencies
  );

  registerToolWithDeps(
    "ansible_lint",
    {
      title: "Ansible Lint",
      description:
        "Run ansible-lint on Ansible files with human-readable input support for linting.",
      inputSchema: {
        playbookContent: z
          .string()
          .describe("The full YAML content of the Ansible playbook to lint."),
      },
    },
    createAnsibleLintHandler(),
    [], // TODO: Add ansible-lint dependencies when ready
  );

  registerToolWithDeps(
    "debug_env",
    {
      title: "Debug Environment",
      description:
        "Displays PATH, virtual environment, and workspace information for debugging.",
    },
    createDebugEnvHandler(workspaceRoot),
    [], // No dependencies
  );

  registerToolWithDeps(
    "ade_environment_info",
    {
      title: "ADE Environment Information",
      description:
        "Get comprehensive environment information including Python, Ansible, ADE, ADT status, and installed collections.",
    },
    createADEEnvironmentInfoHandler(workspaceRoot),
    [], // No dependencies
  );

  registerToolWithDeps(
    "ade_setup_environment",
    {
      title: "ADE Setup Development Environment",
      description:
        "Set up a complete Ansible development environment using ADE. Creates virtual environments, installs collections, and manages dependencies.",
      inputSchema: {
        envName: z
          .string()
          .optional()
          .describe("Name for the virtual environment (optional)"),
        pythonVersion: z
          .string()
          .optional()
          .describe("Python version to use (e.g., '3.11', '3.12') (optional)"),
        collections: z
          .array(z.string())
          .optional()
          .describe("List of Ansible collections to install (optional)"),
        installRequirements: z
          .boolean()
          .optional()
          .describe("Whether to install requirements from requirements files (optional)"),
        requirementsFile: z
          .string()
          .optional()
          .describe("Path to specific requirements file (optional)"),
      },
    },
    createADESetupEnvironmentHandler(workspaceRoot),
    [], // No dependencies
  );

  registerToolWithDeps(
    "ade_check_adt",
    {
      title: "ADE Check and Install ADT",
      description:
        "Check if ADT (ansible-dev-tools) is installed and install it if missing. This tool ensures the ADE environment is properly set up.",
    },
    createADECheckADTHandler(),
    [], // No dependencies
  );

  // Add custom error handling for tool calls using the underlying server
  server.server.setRequestHandler(
    CallToolRequestSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (request: any) => {
      const toolName = request.params.name;

      if (!registeredTools.has(toolName)) {
        const availableTools = Array.from(registeredTools).join(", ");
        const errorMessage = `Tool '${toolName}' not found. Available tools: ${availableTools}`;
        throw new McpError(ErrorCode.MethodNotFound, errorMessage);
      }

      // Check dependencies before executing tool
      const dependencies = toolDependencies.get(toolName) || [];
      if (dependencies.length > 0) {
        const depCheck = await checkDependencies(dependencies);
        if (!depCheck.satisfied) {
          const errorMessage = formatDependencyError(
            toolName,
            depCheck.missingDependencies,
            depCheck.versionMismatches,
          );

          // Return error as content so it's visible in the chat
          return {
            content: [
              {
                type: "text",
                text: `❌ ${errorMessage}`,
              },
            ],
          };
        }
      }

      // Execute the tool handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (server as any)._registeredTools;
      if (handlers && handlers[toolName]?.callback) {
        return await handlers[toolName].callback(
          request.params.arguments || {},
        );
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Tool '${toolName}' handler not found`,
      );
    },
  );

  return server;
}

export async function runStdio(_workspaceRoot: string) {
  const server = createAnsibleMcpServer(_workspaceRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>(() => {
    // Intentionally empty - this keeps the process alive
  });
}
