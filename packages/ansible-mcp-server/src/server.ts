import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createZenOfAnsibleHandler } from "./handlers.js";

export function createAnsibleMcpServer() {
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runStdio(_workspaceRoot: string) {
  const server = createAnsibleMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive for stdio-based clients until they close the transport
  await new Promise<void>(() => {
    // Intentionally empty - this keeps the process alive
  });
}
