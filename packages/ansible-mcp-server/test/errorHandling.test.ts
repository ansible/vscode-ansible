import { describe, it, expect } from "vitest";
import { createAnsibleMcpServer } from "../src/server.js";

describe("MCP Server Error Handling", () => {
  it("should provide helpful error message with available tools when requesting non-existent tool", async () => {
    const server = createAnsibleMcpServer("/test/workspace");

    // Try to call the tools/call handler directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestHandler = (server.server as any)._requestHandlers?.get(
      "tools/call",
    );

    expect(requestHandler).toBeDefined();

    if (requestHandler) {
      try {
        await requestHandler({
          method: "tools/call",
          params: {
            name: "xyz_tool",
            arguments: {},
          },
        });
        // If no error is thrown, fail the test
        expect.fail("Expected an error to be thrown");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        // Verify the error message includes the tool name and available tools
        expect(error.message).toContain("Tool 'xyz_tool' not found");
        expect(error.message).toContain("Available tools: zen_of_ansible");
      }
    }
  });

  it("should provide helpful error message listing all available tools", async () => {
    const server = createAnsibleMcpServer("/test/workspace");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestHandler = (server.server as any)._requestHandlers?.get(
      "tools/call",
    );

    if (requestHandler) {
      try {
        await requestHandler({
          method: "tools/call",
          params: {
            name: "nonexistent_tool",
            arguments: {},
          },
        });
        expect.fail("Expected an error to be thrown");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        // Verify the error message lists available tools
        expect(error.message).toContain("Tool 'nonexistent_tool' not found");
        expect(error.message).toContain("Available tools:");
        expect(error.message).toContain("zen_of_ansible");
        expect(error.message).toContain("list_available_tools");
      }
    }
  });

  it("should successfully call existing tools", async () => {
    const server = createAnsibleMcpServer("/test/workspace");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestHandler = (server.server as any)._requestHandlers?.get(
      "tools/call",
    );

    if (requestHandler) {
      const result = await requestHandler({
        method: "tools/call",
        params: {
          name: "zen_of_ansible",
          arguments: {},
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
    }
  });

  it("should handle empty tool name gracefully", async () => {
    const server = createAnsibleMcpServer("/test/workspace");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestHandler = (server.server as any)._requestHandlers?.get(
      "tools/call",
    );

    if (requestHandler) {
      try {
        await requestHandler({
          method: "tools/call",
          params: {
            name: "",
            arguments: {},
          },
        });
        expect.fail("Expected an error to be thrown");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        expect(error.message).toContain("Tool '' not found");
        expect(error.message).toContain("Available tools: zen_of_ansible");
      }
    }
  });

  it("should handle missing tool handler gracefully", async () => {
    const server = createAnsibleMcpServer("/test/workspace");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestHandler = (server.server as any)._requestHandlers?.get(
      "tools/call",
    );

    expect(requestHandler).toBeDefined();

    if (requestHandler) {
      // Manipulate the server to have a registered tool but no handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredTools = (server as any)._registeredTools;
      if (registeredTools) {
        // Temporarily remove callback from a registered tool
        const toolName = "zen_of_ansible";
        const originalCallback = registeredTools[toolName]?.callback;
        if (originalCallback) {
          registeredTools[toolName].callback = undefined;

          try {
            await requestHandler({
              method: "tools/call",
              params: {
                name: toolName,
                arguments: {},
              },
            });
            expect.fail("Expected an error to be thrown");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (error: any) {
            expect(error.message).toContain(
              "Tool 'zen_of_ansible' handler not found",
            );
          } finally {
            // Restore the callback
            registeredTools[toolName].callback = originalCallback;
          }
        }
      }
    }
  });
});
