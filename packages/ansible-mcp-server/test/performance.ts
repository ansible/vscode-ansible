import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "./testWrapper.js";

describe("Ansible MCP Server Performance Tests", () => {
  let server: ReturnType<typeof createTestServer>;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    server = createTestServer(workspaceRoot);
  });

  describe("tool performance", () => {
    it("should handle debug_env tool calls efficiently", async () => {
      const iterations = 100;
      const start = Date.now();

      const promises = Array.from({ length: iterations }, () =>
        server.callTool("debug_env", {}),
      );

      const results = await Promise.all(promises);
      const end = Date.now();
      const duration = end - start;

      expect(results).toHaveLength(iterations);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second

      // Each result should be valid
      results.forEach((result) => {
        expect(result.content).toHaveLength(4);
        expect(result.content[0].text).toMatch(/^PATH: /);
      });
    });

    it("should handle zen_of_ansible tool calls efficiently", async () => {
      const iterations = 50;
      const start = Date.now();

      const promises = Array.from({ length: iterations }, () =>
        server.callTool("zen_of_ansible", {}),
      );

      const results = await Promise.all(promises);
      const end = Date.now();
      const duration = end - start;

      expect(results).toHaveLength(iterations);
      expect(duration).toBeLessThan(500); // Should complete quickly as it's just returning static text

      // Each result should contain all 20 aphorisms
      results.forEach((result) => {
        expect(result.content[0].text).toContain(
          "20. Automation is a journey that never ends",
        );
      });
    });

    it("should handle concurrent prompt generation efficiently", async () => {
      const iterations = 25;
      const start = Date.now();

      const promises = Array.from({ length: iterations }, (_, i) =>
        server.callPrompt("ansible_fix_prompt", {
          file: `test-file-${i}.yml`,
          errorSummary: `Error ${i}: some lint issue`,
        }),
      );

      const results = await Promise.all(promises);
      const end = Date.now();
      const duration = end - start;

      expect(results).toHaveLength(iterations);
      expect(duration).toBeLessThan(200); // Should be very fast as it's just string templating

      // Each result should be properly formatted
      results.forEach((result, i) => {
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].content.text).toContain(`test-file-${i}.yml`);
        expect(result.messages[0].content.text).toContain(`Error ${i}`);
      });
    });
  });

  describe("memory usage", () => {
    it("should not leak memory with repeated tool calls", async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        await server.callTool("debug_env", {});
        await server.callTool("zen_of_ansible", {});
        await server.callPrompt("ansible_fix_prompt", {
          file: `file-${i}.yml`,
          errorSummary: `Error ${i}`,
        });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe("server initialization performance", () => {
    it("should initialize quickly", () => {
      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        createTestServer(`/test/workspace-${i}`);
      }

      const end = Date.now();
      const duration = end - start;

      expect(duration).toBeLessThan(1000); // Should create 100 servers in under 1 second
    });
  });

  describe("error handling performance", () => {
    it("should handle invalid tool calls efficiently", async () => {
      const iterations = 50;
      const start = Date.now();

      const promises = Array.from({ length: iterations }, async () => {
        try {
          // This should fail quickly
          await server.callTool("nonexistent_tool", {});
        } catch (error) {
          return error;
        }
      });

      const results = await Promise.all(promises);
      const end = Date.now();
      const duration = end - start;

      expect(results).toHaveLength(iterations);
      expect(duration).toBeLessThan(500); // Error handling should be fast

      // All should be errors
      results.forEach((result) => {
        expect(result).toBeInstanceOf(Error);
      });
    });
  });
});
