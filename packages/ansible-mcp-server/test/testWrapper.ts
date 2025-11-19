import { createAnsibleMcpServer } from "../src/server.js";

/**
 * Test wrapper that provides test-friendly methods for the MCP server
 */
export function createTestServer(workspaceRoot: string) {
  // Create the actual server instance with workspaceRoot
  const server = createAnsibleMcpServer(workspaceRoot);

  return {
    // Test helper methods that simulate MCP server behavior

    async callTool(name: string, args: Record<string, unknown>) {
      // Get the registered tools from the server
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredTools = (server as any)._registeredTools;

      if (!registeredTools || !registeredTools[name]) {
        throw new Error(`Unknown tool: ${name}`);
      }

      // Call the tool handler
      const handler = registeredTools[name].callback;
      if (handler) {
        return await handler(args);
      }

      throw new Error(`Tool handler not found for: ${name}`);
    },

    // Server metadata for tests
    name: "ansible-mcp-server",
    version: "0.1.0",
    listTools: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredTools = (server as any)._registeredTools;
      return registeredTools
        ? Object.keys(registeredTools).map((name) => ({ name }))
        : [];
    },
    listResources: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredResources = (server as any)._registeredResources;
      if (!registeredResources) {
        return [];
      }

      // Resources are stored by URI, each resource has a 'name' property
      const resources: Array<{ name: string; uri: string }> = [];

      for (const [uri, resource] of Object.entries(registeredResources)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (resource as any)?.name || uri;
        resources.push({ name, uri });
      }

      return resources;
    },
    async callResource(nameOrUri: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredResources = (server as any)._registeredResources;
      if (!registeredResources) {
        throw new Error(`Unknown resource: ${nameOrUri}`);
      }

      // Try to find by URI first
      let resourceHandler = registeredResources[nameOrUri];

      // If not found by URI, try to find by name
      if (!resourceHandler) {
        for (const [, resource] of Object.entries(registeredResources)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((resource as any)?.name === nameOrUri) {
            resourceHandler = resource;
            break;
          }
        }
      }

      if (!resourceHandler) {
        throw new Error(`Unknown resource: ${nameOrUri}`);
      }

      // Call the resource handler (it's called readCallback in the MCP SDK)

      const handler = resourceHandler.readCallback;
      if (handler) {
        return await handler();
      }

      throw new Error(`Resource handler not found for: ${nameOrUri}`);
    },
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
