import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "./testWrapper.js";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

describe("Ansible MCP Server Integration Tests", () => {
  let server: ReturnType<typeof createTestServer>;
  const workspaceRoot = process.cwd();

  beforeEach(() => {
    server = createTestServer(workspaceRoot);
  });

  describe("zen_of_ansible tool integration", () => {
    it("should return the Zen of Ansible content", async () => {
      const result = await server.callTool("zen_of_ansible", {});

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: ZEN_OF_ANSIBLE,
          },
        ],
      });

      // Verify content is not empty and contains expected text
      expect(ZEN_OF_ANSIBLE).toContain("Simple is better than complex");
      expect(ZEN_OF_ANSIBLE).toContain("Readability counts");
      expect(ZEN_OF_ANSIBLE.split("\n")).toHaveLength(20);
    });

    it("should handle tool call with empty arguments", async () => {
      const result = await server.callTool("zen_of_ansible", {});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe(ZEN_OF_ANSIBLE);
    });

    it("should throw error for unknown tool", async () => {
      await expect(server.callTool("unknown_tool", {})).rejects.toThrow(
        "Unknown tool: unknown_tool",
      );
    });
  });
});
