import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer } from "./testWrapper.js";

describe("Ansible MCP Server Performance Tests", () => {
  let server: ReturnType<typeof createTestServer>;
  const workspaceRoot = process.cwd();

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
  });
});
