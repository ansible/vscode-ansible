import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createZenOfAnsibleHandler,
  createListToolsHandler,
} from "./handlers.js";
import {
  checkDependencies,
  formatDependencyError,
  type Dependency,
} from "./dependencyChecker.js";

export function createAnsibleMcpServer() {
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runStdio(_workspaceRoot: string) {
  const server = createAnsibleMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>(() => {
    // Intentionally empty - this keeps the process alive
  });
}
