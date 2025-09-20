import { createAnsibleMcpServer } from "../src/server.js";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

/**
 * Test wrapper that provides test-friendly methods for the MCP server
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createTestServer(_workspaceRoot: string) {
  // Create the server but don't use it directly in tests - we simulate the behavior
  void createAnsibleMcpServer();

  return {
    // Test helper methods that simulate MCP server behavior
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async callTool(name: string, _args: Record<string, unknown>) {
      if (name === "zen_of_ansible") {
        return {
          content: [
            {
              type: "text",
              text: ZEN_OF_ANSIBLE,
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    },

    // Server metadata for tests
    name: "ansible-mcp-server",
    version: "0.1.0",
    listTools: () => [{ name: "zen_of_ansible" }],
    listResources: () => [],
    listPrompts: () => [],
  };
}

/**
 * Mock MCP server response types for testing
 */
export interface MockToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface MockTool {
  name: string;
}

export interface MockResource {
  name: string;
}

export interface MockPrompt {
  name: string;
}

/**
 * Test utilities for common assertions
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class TestUtils {
  static assertValidToolResponse(response: MockToolResponse): void {
    if (!response || !response.content) {
      throw new Error("Invalid tool response: missing content");
    }

    if (!Array.isArray(response.content)) {
      throw new Error("Invalid tool response: content must be an array");
    }

    if (response.content.length === 0) {
      throw new Error("Invalid tool response: content array is empty");
    }

    response.content.forEach((item, index) => {
      if (!item.type) {
        throw new Error(`Invalid content item at index ${index}: missing type`);
      }

      if (item.type === "text" && typeof item.text !== "string") {
        throw new Error(
          `Invalid content item at index ${index}: text must be a string`,
        );
      }
    });
  }

  static assertZenOfAnsibleContent(response: MockToolResponse): void {
    TestUtils.assertValidToolResponse(response);

    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("Expected text content type");
    }

    if (!textContent.text.includes("Simple is better than complex")) {
      throw new Error("Missing expected Zen of Ansible content");
    }

    // Check for numbered aphorisms
    const numberedLines = textContent.text
      .split("\n")
      .filter((line) => /^\d+\./m.test(line.trim()));

    if (numberedLines.length !== 20) {
      throw new Error(`Expected 20 aphorisms, found ${numberedLines.length}`);
    }
  }

  static async measureExecutionTime<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    const duration = endTime - startTime;

    return { result, duration };
  }

  static async runConcurrentTests<T>(
    testFn: () => Promise<T>,
    concurrency: number = 5,
  ): Promise<T[]> {
    const promises = Array(concurrency)
      .fill(null)
      .map(() => testFn());
    return Promise.all(promises);
  }
}

/**
 * Test data generators
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class TestDataGenerator {
  private static counter = 0;

  static generateRandomWorkspacePath(): string {
    // Use counter-based approach for deterministic test data
    const uniqueId = `test${++TestDataGenerator.counter}`;
    return `/test/workspace/${uniqueId}`;
  }

  static generateToolCallArgs(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      ...overrides,
    };
  }

  static generateInvalidToolNames(): string[] {
    return [
      "",
      "invalid_tool",
      "nonexistent",
      "zen_of_python", // Similar but wrong
      "ansible_zen", // Similar but wrong
      "123invalid",
      "tool-with-dashes",
      "tool with spaces",
    ];
  }
}

/**
 * Performance testing utilities
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PerformanceTestUtils {
  static async benchmarkFunction<T>(
    fn: () => Promise<T>,
    iterations: number = 100,
  ): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    totalTime: number;
    results: T[];
  }> {
    const times: number[] = [];
    const results: T[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const result = await fn();
      const endTime = performance.now();

      times.push(endTime - startTime);
      results.push(result);
    }

    return {
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      totalTime: times.reduce((a, b) => a + b, 0),
      results,
    };
  }

  static calculateVariance(numbers: number[]): number {
    const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    return (
      numbers.reduce((acc, num) => acc + Math.pow(num - avg, 2), 0) /
      numbers.length
    );
  }

  static assertPerformanceThreshold(
    actualTime: number,
    expectedMaxTime: number,
    operation: string,
  ): void {
    if (actualTime > expectedMaxTime) {
      throw new Error(
        `Performance threshold exceeded for ${operation}: ${actualTime}ms > ${expectedMaxTime}ms`,
      );
    }
  }
}
