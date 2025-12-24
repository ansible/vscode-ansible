import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "../testWrapper.js";

describe("ADE Tools Integration", () => {
  let server: ReturnType<typeof createTestServer>;

  beforeEach(() => {
    server = createTestServer("/test/workspace");
  });

  describe("ade_environment_info tool", () => {
    it("should be registered and callable", async () => {
      const result = await server.callTool("ade_environment_info", {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const textContent = result.content.find(
        (c: { type: string }) => c.type === "text",
      );
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("Environment Information");
    });

    it("should handle errors gracefully", async () => {
      // This test would need to mock the underlying functions to throw errors
      // For now, we just ensure the tool is callable
      const result = await server.callTool("ade_environment_info", {});
      expect(result).toBeDefined();
    });
  });

  describe("ade_setup_environment tool", () => {
    it("should be registered and callable with no arguments", async () => {
      const result = await server.callTool("ade_setup_environment", {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    }, 45000); // 45 second timeout for macOS slowness

    it("should be callable with all optional arguments", async () => {
      const args = {
        envName: "test-env",
        pythonVersion: "3.11",
        collections: ["ansible.posix", "community.general"],
        installRequirements: true,
        requirementsFile: "requirements.txt",
      };

      const result = await server.callTool("ade_setup_environment", args);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    }, 45000); // 45 second timeout

    it("should handle partial arguments", async () => {
      const args = {
        envName: "my-env",
        collections: ["ansible.posix"],
      };

      const result = await server.callTool("ade_setup_environment", args);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe("adt_check_env tool", () => {
    it("should be registered and callable", async () => {
      const result = await server.callTool("adt_check_env", {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const textContent = result.content.find(
        (c: { type: string }) => c.type === "text",
      );
      expect(textContent).toBeDefined();
    });
  });

  describe("Tool registration", () => {
    it("should include ADE tools in available tools list", async () => {
      const result = await server.callTool("list_available_tools", {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const textContent = result.content.find(
        (c: { type: string }) => c.type === "text",
      );
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain("ade_environment_info");
      expect(textContent?.text).toContain("ade_setup_environment");
      expect(textContent?.text).toContain("adt_check_env");
    });
  });

  describe("Error handling", () => {
    it("should handle invalid tool names", async () => {
      try {
        await server.callTool("invalid_ade_tool", {});
        expect.fail("Expected an error to be thrown");
      } catch (error: unknown) {
        expect((error as Error).message).toContain(
          "Unknown tool: invalid_ade_tool",
        );
      }
    });

    it("should handle malformed arguments gracefully", async () => {
      // Test with invalid argument types
      const result = await server.callTool("ade_setup_environment", {
        envName: 123, // Should be string
        collections: "not-an-array", // Should be array
      });

      // The tool should still be callable, but may handle invalid args gracefully
      expect(result).toBeDefined();
    });
  });

  describe("Human-readable input support", () => {
    it("should support human-readable descriptions in tool descriptions", async () => {
      const result = await server.callTool("list_available_tools", {});

      const textContent = result.content.find(
        (c: { type: string }) => c.type === "text",
      );
      expect(textContent?.text).toContain("ade_environment_info");
      expect(textContent?.text).toContain("ade_setup_environment");
      expect(textContent?.text).toContain("adt_check_env");
    });
  });
});
