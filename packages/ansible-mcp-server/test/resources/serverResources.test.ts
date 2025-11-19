import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer } from "../testWrapper.js";
import fs from "node:fs/promises";

describe("Server Resource Registration", () => {
  let server: ReturnType<typeof createTestServer>;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    server = createTestServer(workspaceRoot);
  });

  describe("ansible-content-best-practices resource", () => {
    it("should register the ansible-content-best-practices resource", () => {
      const resources = server.listResources();
      const resourceNames = resources.map((r) => r.name);

      expect(resourceNames).toContain("ansible-content-best-practices");
    });

    it("should successfully retrieve resource content", async () => {
      const result = await server.callResource(
        "ansible-content-best-practices",
      );

      expect(result).toHaveProperty("contents");
      expect(Array.isArray(result.contents)).toBe(true);
      expect(result.contents.length).toBeGreaterThan(0);

      const content = result.contents[0];
      expect(content).toHaveProperty(
        "uri",
        "guidelines://ansible-content-best-practices",
      );
      expect(content).toHaveProperty("mimeType", "text/markdown");
      expect(content).toHaveProperty("text");
      expect(typeof content.text).toBe("string");
      expect(content.text.length).toBeGreaterThan(0);
    });

    it("should return markdown content with expected sections", async () => {
      const result = await server.callResource(
        "ansible-content-best-practices",
      );
      const text = result.contents[0].text;

      expect(text).toContain("# Ansible Coding Guidelines");
      expect(text).toMatch(
        /##\s+(Guiding Principles|Coding Standards|Development Workflow)/,
      );
    });

    it("should handle file reading errors gracefully", async () => {
      // Mock fs.readFile to throw an error
      const readFileSpy = vi
        .spyOn(fs, "readFile")
        .mockRejectedValueOnce(new Error("ENOENT: no such file or directory"));

      const result = await server.callResource(
        "ansible-content-best-practices",
      );

      expect(result).toHaveProperty("contents");
      expect(result.contents.length).toBeGreaterThan(0);

      const content = result.contents[0];
      expect(content.uri).toBe("guidelines://ansible-content-best-practices");
      expect(content.mimeType).toBe("text/plain"); // Error responses use text/plain
      expect(content.text).toContain(
        "Error loading Ansible Content Best Practices",
      );
      expect(content.text).toContain("ENOENT: no such file or directory");

      expect(readFileSpy).toHaveBeenCalled();
    });

    it("should handle non-Error exceptions in resource handler", async () => {
      // Mock fs.readFile to throw a non-Error
      const readFileSpy = vi
        .spyOn(fs, "readFile")
        .mockRejectedValueOnce("String error");

      const result = await server.callResource(
        "ansible-content-best-practices",
      );

      expect(result).toHaveProperty("contents");
      const content = result.contents[0];
      expect(content.mimeType).toBe("text/plain");
      expect(content.text).toContain(
        "Error loading Ansible Content Best Practices",
      );
      expect(content.text).toContain("String error");

      expect(readFileSpy).toHaveBeenCalled();
    });

    it("should return consistent content on multiple calls", async () => {
      const result1 = await server.callResource(
        "ansible-content-best-practices",
      );
      const result2 = await server.callResource(
        "ansible-content-best-practices",
      );

      expect(result1.contents[0].text).toBe(result2.contents[0].text);
    });

    it("should throw error for unknown resource", async () => {
      await expect(server.callResource("unknown-resource")).rejects.toThrow(
        "Unknown resource: unknown-resource",
      );
    });
  });

  describe("all registered resources", () => {
    it("should register execution-environment-schema resource", () => {
      const resources = server.listResources();
      const resourceNames = resources.map((r) => r.name);

      expect(resourceNames).toContain("execution-environment-schema");
    });

    it("should register execution-environment-sample resource", () => {
      const resources = server.listResources();
      const resourceNames = resources.map((r) => r.name);

      expect(resourceNames).toContain("execution-environment-sample");
    });

    it("should register execution-environment-rules resource", () => {
      const resources = server.listResources();
      const resourceNames = resources.map((r) => r.name);

      expect(resourceNames).toContain("execution-environment-rules");
    });

    it("should register ansible-content-best-practices resource", () => {
      const resources = server.listResources();
      const resourceNames = resources.map((r) => r.name);

      expect(resourceNames).toContain("ansible-content-best-practices");
    });
  });
});
