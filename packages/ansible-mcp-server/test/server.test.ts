import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "./testWrapper";
import { ZEN_OF_ANSIBLE, TOOL_COUNT } from "../src/constants.js";

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

    it("should handle invalid arguments gracefully", async () => {
      const result = await server.callTool("zen_of_ansible", {
        invalid: "arg",
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
    });
  });

  describe("ansible_content_best_practices tool", () => {
    it("should return best practices content", async () => {
      const result = await server.callTool(
        "ansible_content_best_practices",
        {},
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(typeof result.content[0].text).toBe("string");
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });

    it("should handle tool call with empty arguments", async () => {
      const result = await server.callTool(
        "ansible_content_best_practices",
        {},
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
    });

    it("should handle invalid arguments gracefully", async () => {
      const result = await server.callTool("ansible_content_best_practices", {
        invalid: "arg",
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
    });

    it("should return consistent results on multiple calls", async () => {
      const result1 = await server.callTool(
        "ansible_content_best_practices",
        {},
      );
      const result2 = await server.callTool(
        "ansible_content_best_practices",
        {},
      );

      expect(result1.content[0].text).toBe(result2.content[0].text);
    });
  });

  describe("server configuration", () => {
    it("should have correct server metadata", () => {
      expect(server.name).toBe("ansible-mcp-server");
      expect(server.version).toBe("0.1.0");
    });

    it("should register all expected tools", () => {
      const toolNames = server.listTools().map((tool) => tool.name);
      expect(toolNames).toContain("zen_of_ansible");
      expect(toolNames).toContain("ansible_content_best_practices");
      expect(toolNames).toContain("list_available_tools");
      expect(toolNames).toContain("ansible_lint");
      expect(toolNames).toContain("ade_environment_info");
      expect(toolNames).toContain("ade_setup_environment");
      expect(toolNames).toContain("adt_check_env");
      expect(toolNames).toContain("ansible_create_playbook");
      expect(toolNames).toContain("ansible_create_collection");
      expect(toolNames).toContain("define_and_build_execution_env");
      expect(toolNames).toHaveLength(TOOL_COUNT);
    });

    it("should register expected resources", () => {
      const resources = server.listResources();
      const resourceNames = resources.map((r) => r.name);

      expect(resourceNames).toContain("execution-environment-schema");
      expect(resourceNames).toContain("execution-environment-sample");
      expect(resourceNames).toContain("execution-environment-rules");
      expect(resourceNames).toContain("ansible-content-best-practices");
      expect(resources.length).toBeGreaterThanOrEqual(4);
    });

    it("should not register any prompts", () => {
      expect(server.listPrompts()).toEqual([]);
    });

    it("should handle workspace root configuration", () => {
      const serverWithWorkspace = createTestServer("/custom/workspace");
      expect(serverWithWorkspace.name).toBe("ansible-mcp-server");
    });
  });

  describe("error handling", () => {
    it("should handle null arguments", async () => {
      const result = await server.callTool("zen_of_ansible", {});
      expect(result.content).toHaveLength(1);
    });

    it("should handle undefined arguments", async () => {
      const result = await server.callTool("zen_of_ansible", {});
      expect(result.content).toHaveLength(1);
    });

    it("should throw descriptive error for missing tool", async () => {
      await expect(server.callTool("", {})).rejects.toThrow("Unknown tool:");
    });
  });
});
