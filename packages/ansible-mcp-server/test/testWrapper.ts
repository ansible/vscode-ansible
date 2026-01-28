import { createAnsibleMcpServer } from "../src/server.js";

/**
 * Test wrapper that provides test-friendly methods for the MCP server
 */
export function createTestServer(workspaceRoot: string) {
  // Create the actual server instance with workspaceRoot
  const server = createAnsibleMcpServer(workspaceRoot);

  return {
    // Test helper methods that simulate MCP server behavior

    async callTool(name: string, args: Record<string, unknown>) {
      // Get the registered tools from the server
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredTools = (server as any)._registeredTools;

      if (!registeredTools || !registeredTools[name]) {
        throw new Error(`Unknown tool: ${name}`);
      }

      // Call the tool handler
      const handler = registeredTools[name].handler;
      if (handler) {
        return await handler(args);
      }

      throw new Error(`Tool handler not found for: ${name}`);
    },

    // Server metadata for tests
    name: "ansible-mcp-server",
    version: "0.1.0",
    listTools: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredTools = (server as any)._registeredTools;
      return registeredTools
        ? Object.keys(registeredTools).map((name) => ({ name }))
        : [];
    },
    listResources: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredResources = (server as any)._registeredResources;
      if (!registeredResources) {
        return [];
      }

      // Resources are stored by URI, each resource has a 'name' property
      const resources: Array<{ name: string; uri: string }> = [];

      for (const [uri, resource] of Object.entries(registeredResources)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (resource as any)?.name || uri;
        resources.push({ name, uri });
      }

      return resources;
    },
    async callResource(nameOrUri: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredResources = (server as any)._registeredResources;
      if (!registeredResources) {
        throw new Error(`Unknown resource: ${nameOrUri}`);
      }

      // Try to find by URI first
      let resourceHandler = registeredResources[nameOrUri];

      // If not found by URI, try to find by name
      if (!resourceHandler) {
        for (const [, resource] of Object.entries(registeredResources)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((resource as any)?.name === nameOrUri) {
            resourceHandler = resource;
            break;
          }
        }
      }

      if (!resourceHandler) {
        throw new Error(`Unknown resource: ${nameOrUri}`);
      }

      // Call the resource handler (it's called readCallback in the MCP SDK)

      const handler = resourceHandler.readCallback;
      if (handler) {
        return await handler();
      }

      throw new Error(`Resource handler not found for: ${nameOrUri}`);
    },
    listPrompts: () => [],
  };
}
