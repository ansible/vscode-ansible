import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "./testWrapper.js";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

describe("Ansible MCP Server", () => {
  let server: ReturnType<typeof createTestServer>;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    server = createTestServer(workspaceRoot);
  });

  describe("zen_of_ansible tool", () => {
    it("should return the Zen of Ansible aphorisms", async () => {
      const result = await server.callTool("zen_of_ansible", {});

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: ZEN_OF_ANSIBLE,
          },
        ],
      });
    });
  });

  describe("server configuration", () => {
    it("should have correct server metadata", () => {
      expect(server.name).toBe("ansible-mcp-server");
      expect(server.version).toBe("0.1.0");
    });

    it("should register only zen_of_ansible tool", () => {
      const tools = server.listTools();
      expect(tools).toEqual([{ name: "zen_of_ansible" }]);
    });

    it("should have no resources", () => {
      const resources = server.listResources();
      expect(resources).toEqual([]);
    });

    it("should have no prompts", () => {
      const prompts = server.listPrompts();
      expect(prompts).toEqual([]);
    });
  });
});
