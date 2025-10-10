import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createZenOfAnsibleHandler,
  createAnsibleLintHandler,
  createDebugEnvHandler,
} from "./handlers.js";

export function createAnsibleMcpServer(workspaceRoot: string) {
  const server = new McpServer({
    name: "ansible-mcp-server",
    version: "0.1.0",
  });

  // Tools
  server.registerTool(
    "zen_of_ansible",
    {
      title: "The Zen of Ansible",
      description: "20 aphorisms that describe Ansible's design philosophy.",
    },
    createZenOfAnsibleHandler(),
  );

  server.registerTool(
    "ansible_lint",
    {
      title: "Ansible Lint",
      description:
        "Run ansible-lint on Ansible files with human-readable input support for linting.",
    },
    createAnsibleLintHandler(workspaceRoot),
  );

  server.registerTool(
    "debug_env",
    {
      title: "Debug Environment",
      description:
        "Displays PATH, virtual environment, and workspace information for debugging.",
    },
    createDebugEnvHandler(workspaceRoot),
  );
  return server;
}

export async function runStdio(workspaceRoot: string) {
  const server = createAnsibleMcpServer(workspaceRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>(() => {
    // Intentionally empty - this keeps the process alive
  });
}
