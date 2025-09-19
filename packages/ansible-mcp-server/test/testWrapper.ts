/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAnsibleMcpServer } from "../src/server.js";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

/**
 * Test wrapper that provides test-friendly methods for the MCP server
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createTestServer(_workspaceRoot: string) {
  // Create the server but don't use it directly in tests - we simulate the behavior
  void createAnsibleMcpServer();

  return {
    // Test helper methods that simulate MCP server behavior
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async callTool(name: string, _args: Record<string, unknown>) {
      if (name === "zen_of_ansible") {
        return {
          content: [
            {
              type: "text",
              text: ZEN_OF_ANSIBLE,
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    },

    // Server metadata for tests
    name: "ansible-mcp-server",
    version: "0.1.0",
    listTools: () => [{ name: "zen_of_ansible" }],
    listResources: () => [],
    listPrompts: () => [],
  };
}
