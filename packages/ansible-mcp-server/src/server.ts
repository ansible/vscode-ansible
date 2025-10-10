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
  COMMON_DEPENDENCIES,
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

  // Register tools (tools without dependencies can pass empty array)
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

  // TEST TOOL: Tool with real dependency (ansible)
  registerToolWithDeps(
    "check_ansible_version",
    {
      title: "Check Ansible Version",
      description:
        "Check the installed Ansible version. This tool requires ansible to be installed.",
    },
    async () => {
      const { spawn } = await import("node:child_process");
      return new Promise((resolve) => {
        const child = spawn("ansible", ["--version"]);
        let output = "";
        child.stdout?.on("data", (d) => (output += d.toString()));
        child.stderr?.on("data", (d) => (output += d.toString()));
        child.on("close", (code) => {
          resolve({
            content: [
              {
                type: "text" as const,
                text:
                  code === 0
                    ? `Ansible Version:\n${output}`
                    : `Error checking ansible version: ${output}`,
              },
            ],
          });
        });
      });
    },
    [COMMON_DEPENDENCIES.ansible], // Requires ansible
  );

  // REAL TOOL: ansible-lint (will show missing dependency if not installed)
  registerToolWithDeps(
    "ansible_lint",
    {
      title: "Ansible Lint",
      description:
        "Lint Ansible playbooks for best practices and potential issues. Checks your playbooks against ansible-lint rules.",
    },
    async ({ file = "." }: { file?: string }) => {
      const { spawn } = await import("node:child_process");
      const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

      return new Promise((resolve) => {
        const child = spawn("ansible-lint", [file], {
          cwd: workspaceRoot,
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (d) => (stdout += d.toString()));
        child.stderr?.on("data", (d) => (stderr += d.toString()));

        child.on("close", (code) => {
          const output = stdout || stderr || "No issues found!";
          resolve({
            content: [
              {
                type: "text" as const,
                text:
                  code === 0
                    ? `✅ Linting complete!\n\n${output}`
                    : `Linting found issues:\n\n${output}`,
              },
            ],
          });
        });

        child.on("error", (err) => {
          resolve({
            content: [
              {
                type: "text" as const,
                text: `❌ Error running ansible-lint: ${err.message}`,
              },
            ],
          });
        });
      });
    },
    [COMMON_DEPENDENCIES.ansible, COMMON_DEPENDENCIES.ansibleLint],
  );

  // Add custom error handling for tool calls using the underlying server
  server.server.setRequestHandler(
    CallToolRequestSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (request: any) => {
      const toolName = request.params.name;

      // Log tool calls for debugging
      console.error(
        `[MCP Server] Tool call received: ${toolName} (registered: ${registeredTools.has(toolName)})`,
      );

      if (!registeredTools.has(toolName)) {
        const availableTools = Array.from(registeredTools).join(", ");
        const errorMessage = `Tool '${toolName}' not found. Available tools: ${availableTools}`;
        console.error(`[MCP Server] Returning error: ${errorMessage}`);
        throw new McpError(ErrorCode.MethodNotFound, errorMessage);
      }

      // Check dependencies before executing tool
      const dependencies = toolDependencies.get(toolName) || [];
      if (dependencies.length > 0) {
        console.error(
          `[MCP Server] Checking ${dependencies.length} dependencies for ${toolName}`,
        );
        const depCheck = await checkDependencies(dependencies);
        if (!depCheck.satisfied) {
          const errorMessage = formatDependencyError(
            toolName,
            depCheck.missingDependencies,
            depCheck.versionMismatches,
          );
          console.error(
            `[MCP Server] Dependency check failed: ${errorMessage}`,
          );

          // Return as content so it's visible in chat
          // Don't use isError flag as it causes Claude to show generic message
          return {
            content: [
              {
                type: "text",
                text: `❌ ${errorMessage}`,
              },
            ],
          };
        }
        console.error(
          `[MCP Server] All dependencies satisfied for ${toolName}`,
        );
      }

      // If tool exists, let the default handler process it
      // We need to get the handler for this tool
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (server as any)._registeredTools;

      // _registeredTools is an object, not a Map
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
