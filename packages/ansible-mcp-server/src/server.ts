import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createZenOfAnsibleHandler } from "./handlers.js";

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

  return server;
}

export async function runStdio(workspaceRoot: string) {
  const server = createAnsibleMcpServer(workspaceRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive for stdio-based clients until they close the transport
  await new Promise<void>(() => {
    // Intentionally empty - this keeps the process alive
  });
}
