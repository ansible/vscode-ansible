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
  createADEEnvironmentInfoHandler,
  createADESetupEnvironmentHandler,
  createADTCheckEnvHandler,
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
        "Shows all available Ansible MCP tools. Use this to discover what tools you can use. " +
        "Perfect for exploring capabilities and finding the right tool for your task.",
      annotations: {
        keywords: [
          "list available tools",
          "show me tools",
          "what tools are available",
          "discover ansible tools",
          "explore ansible capabilities",
          "ansible tool overview",
          "help with tool selection",
          "find ansible tool",
          "search ansible tools",
        ],
        useCases: [
          "Discover available Ansible MCP tools",
          "Get overview of Ansible tools",
          "Find the right Ansible tool for a task",
          "Explore Ansible tool capabilities",
          "Get help selecting Ansible tools",
        ],
      },
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
    "ade_environment_info",
    {
      title: "ADE Environment Information",
      description:
        "Get comprehensive environment information including Python, Ansible, ADE, ADT status, and installed collections. " +
        "Use this tool when you need to check environment status, verify installations, inspect versions, " +
        "or troubleshoot missing dependencies.",
      annotations: {
        keywords: [
          "check environment",
          "environment status",
          "environment info",
          "verify installation",
          "check versions",
          "check installed packages",
          "python version check",
          "ansible version check",
          "ade status",
          "adt status",
          "list collections",
          "check dependencies",
          "troubleshoot environment",
          "diagnose environment",
          "inspect environment",
          "environment diagnostics",
          "what is installed",
          "show environment",
        ],
        useCases: [
          "Check if Ansible is installed",
          "Verify Python version",
          "List installed Ansible collections",
          "Check ADE/ADT installation status",
          "Troubleshoot environment issues",
          "Get comprehensive environment diagnostics",
        ],
      },
    },
    createADEEnvironmentInfoHandler(workspaceRoot),
    [], // No dependencies
  );

  registerToolWithDeps(
    "ade_setup_environment",
    {
      title: "ADE Setup Development Environment",
      description:
        "Set up a complete Ansible development environment using ADE. Creates virtual environments, installs collections, and manages dependencies. " +
        "Use this tool when you need to setup, install, configure, initialize, or create a development environment. " +
        "Automatically handles missing Ansible tools, Python environments, virtual environments, collections, and requirements.",
      annotations: {
        keywords: [
          "setup ansible environment",
          "install ansible tools",
          "configure development environment",
          "initialize ansible project",
          "create ansible environment",
          "setup dev environment",
          "create virtual environment",
          "setup venv",
          "missing ansible tools",
          "ansible tools not installed",
          "install requirements",
          "install dependencies",
          "install collections",
          "install ansible-lint",
          "install ansible-core",
          "setup python environment",
          "install via pip",
          "install via galaxy",
          "new ansible project",
          "fresh ansible setup",
          "start ansible development",
          "begin ansible project",
        ],
        useCases: [
          "Set up new Ansible development project",
          "Install missing Ansible tools and dependencies",
          "Create Python virtual environment for Ansible",
          "Install Ansible collections and requirements",
          "Fix Ansible environment issues",
          "Initialize complete Ansible development setup",
          "Install from requirements.txt",
          "Configure Python environment for Ansible",
        ],
      },
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
          .describe(
            "Whether to install requirements from requirements files (optional)",
          ),
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
    "adt_check_env",
    {
      title: "ADT Check and Install Development Tools",
      description:
        "Check if ADT (ansible-dev-tools) is installed and install it if missing. " +
        "ADT provides essential Ansible development tools including ansible-lint, ansible-navigator, and ansible-builder. " +
        "Use this tool to ensure your Ansible development environment has all the necessary tools configured.",
      annotations: {
        keywords: [
          "check adt",
          "install adt",
          "ansible-dev-tools",
          "check ansible-dev-tools",
          "install ansible-dev-tools",
          "verify adt",
          "adt missing",
          "adt not installed",
          "ansible dev tools",
          "ansible development tools",
          "check development tools",
          "install development tools",
          "ansible-lint missing",
          "ansible-navigator missing",
          "ansible-builder missing",
          "install ansible tools",
        ],
        useCases: [
          "Check if ADT (ansible-dev-tools) is installed",
          "Install ansible-dev-tools package",
          "Verify ADT installation status",
          "Fix missing ADT installation",
          "Ensure Ansible development tools are available",
          "Install missing ansible-lint, ansible-navigator, or ansible-builder",
        ],
      },
    },
    createADTCheckEnvHandler(),
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
