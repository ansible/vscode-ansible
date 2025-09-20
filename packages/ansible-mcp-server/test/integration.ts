import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "./testWrapper";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

describe("Ansible MCP Server Integration", () => {
  let server: ReturnType<typeof createTestServer>;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    server = createTestServer(workspaceRoot);
  });

  describe("zen_of_ansible tool integration", () => {
    it("should return the Zen of Ansible aphorisms", async () => {
      const result = await server.callTool("zen_of_ansible", {});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toEqual(ZEN_OF_ANSIBLE);
    });

    it("should handle tool call with empty arguments", async () => {
      const result = await server.callTool("zen_of_ansible", {});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
    });

    it("should throw error for unknown tool", async () => {
      await expect(server.callTool("unknown_tool", {})).rejects.toThrow(
        "Unknown tool: unknown_tool",
      );
    });

    it("should maintain consistency across multiple calls", async () => {
      const result1 = await server.callTool("zen_of_ansible", {});
      const result2 = await server.callTool("zen_of_ansible", {});
      const result3 = await server.callTool("zen_of_ansible", {});

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it("should handle concurrent calls", async () => {
      const promises = Array(5)
        .fill(null)
        .map(() => server.callTool("zen_of_ansible", {}));

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toEqual(ZEN_OF_ANSIBLE);
      });
    });
  });

  describe("server lifecycle integration", () => {
    it("should handle multiple server instances", () => {
      const server1 = createTestServer("/workspace1");
      const server2 = createTestServer("/workspace2");

      expect(server1.name).toBe("ansible-mcp-server");
      expect(server2.name).toBe("ansible-mcp-server");
      expect(server1.listTools()).toEqual(server2.listTools());
    });

    it("should maintain tool registry integrity", () => {
      const tools = server.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("zen_of_ansible");
    });

    it("should handle workspace configuration", () => {
      const customServer = createTestServer("/custom/ansible/project");
      expect(customServer.name).toBe("ansible-mcp-server");

      // Should still provide the same tools regardless of workspace
      const tools = customServer.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("zen_of_ansible");
    });
  });

  describe("content validation integration", () => {
    it("should return properly formatted content", async () => {
      const result = await server.callTool("zen_of_ansible", {});

      expect(result).toHaveProperty("content");
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty("type", "text");
      expect(result.content[0]).toHaveProperty("text");
      expect(typeof result.content[0].text).toBe("string");
    });

    it("should return non-empty content", async () => {
      const result = await server.callTool("zen_of_ansible", {});

      expect(result.content[0].text.length).toBeGreaterThan(0);
      expect(result.content[0].text.trim()).not.toBe("");
    });

    it("should return structured aphorisms", async () => {
      const result = await server.callTool("zen_of_ansible", {});
      const text = result.content[0].text;

      // Should contain numbered items
      expect(text).toMatch(/\d+\./);

      // Should contain multiple lines
      const lines = text.split("\n");
      expect(lines.length).toBeGreaterThan(10);
    });
  });
});
