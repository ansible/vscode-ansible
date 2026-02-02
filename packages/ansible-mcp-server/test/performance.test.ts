import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "./testWrapper";
import { TOOL_COUNT } from "../src/constants.js";

describe("Ansible Development Tools MCP Server Performance", () => {
  let server: ReturnType<typeof createTestServer>;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    server = createTestServer(workspaceRoot);
  });

  describe("zen_of_ansible tool performance", () => {
    it("should respond quickly to zen_of_ansible calls", async () => {
      const startTime = performance.now();

      await server.callTool("zen_of_ansible", {});

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in less than 100ms since it's just returning a constant
      expect(duration).toBeLessThan(100);
    });

    it("should handle multiple concurrent calls efficiently", async () => {
      const startTime = performance.now();

      // Make 10 concurrent calls
      const promises = Array(10)
        .fill(null)
        .map(() => server.callTool("zen_of_ansible", {}));

      const results = await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // All calls should complete
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");
      });

      // Should complete all calls in reasonable time
      expect(duration).toBeLessThan(500);
    });

    it("should maintain consistent response times", async () => {
      const times: number[] = [];

      // Run the same call multiple times
      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        await server.callTool("zen_of_ansible", {});
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      // All calls should be reasonably fast
      times.forEach((time) => {
        expect(time).toBeLessThan(50);
      });

      // Variance should be low (consistent performance)
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const variance =
        times.reduce((acc, time) => acc + Math.pow(time - avg, 2), 0) /
        times.length;
      expect(variance).toBeLessThan(100); // Low variance indicates consistent performance
    });

    it("should handle rapid sequential calls", async () => {
      const startTime = performance.now();
      const results = [];

      // Make 20 sequential calls as fast as possible
      for (let i = 0; i < 20; i++) {
        const result = await server.callTool("zen_of_ansible", {});
        results.push(result);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // All calls should succeed
      expect(results).toHaveLength(20);
      results.forEach((result) => {
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");
      });

      // Should complete all sequential calls reasonably quickly
      expect(duration).toBeLessThan(1000); // 1 second for 20 calls
    });

    it("should not have memory leaks with repeated calls", async () => {
      // Get initial memory usage (if available)
      const initialMemory = process.memoryUsage?.()?.heapUsed || 0;

      // Make many calls to test for memory leaks
      for (let i = 0; i < 100; i++) {
        await server.callTool("zen_of_ansible", {});
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage?.()?.heapUsed || 0;

      // Memory should not grow significantly (allowing for some variance)
      if (initialMemory > 0 && finalMemory > 0) {
        const memoryGrowth = finalMemory - initialMemory;
        const memoryGrowthMB = memoryGrowth / (1024 * 1024);

        // Should not grow by more than 10MB (very generous threshold)
        expect(memoryGrowthMB).toBeLessThan(10);
      }
    });
  });

  describe("server initialization performance", () => {
    it("should create server instances quickly", () => {
      const startTime = performance.now();

      const testServer = createTestServer("/test/workspace");

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(testServer.name).toBe("ansible-mcp-server");
      expect(duration).toBeLessThan(100); // Should initialize in less than 100ms (GHA MacOS can be slow)
    });

    it("should handle multiple server creations efficiently", () => {
      const startTime = performance.now();

      const servers = Array(10)
        .fill(null)
        .map((_, i) => createTestServer(`/test/workspace${i}`));

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(servers).toHaveLength(10);
      servers.forEach((srv) => {
        expect(srv.name).toBe("ansible-mcp-server");
      });

      expect(duration).toBeLessThan(200); // 10 servers in less than 400ms (GHA MacOS can be slow)
    });
  });

  describe("tool listing performance", () => {
    it("should list tools quickly", () => {
      const startTime = performance.now();

      const tools = server.listTools();

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(tools).toHaveLength(TOOL_COUNT);
      expect(tools.map((t) => t.name)).toContain("zen_of_ansible");
      expect(duration).toBeLessThan(10); // Should be nearly instantaneous
    });

    it("should handle repeated tool listings efficiently", () => {
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        const tools = server.listTools();
        expect(tools).toHaveLength(TOOL_COUNT);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // CI environments (especially macOS and WSL) can be slower than local development
      // Allow more time for CI while still catching real performance regressions
      expect(duration).toBeLessThan(500); // 1000 listings in less than this
    });
  });
});
