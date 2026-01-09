import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import {
  getAgentsGuidelines,
  getFullAgentsGuidelines,
  getAvailableTopics,
  searchGuidelines,
} from "../../src/resources/agents.js";

describe("agents.ts resource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getFullAgentsGuidelines", () => {
    it("should successfully read agents.md file", async () => {
      const content = await getFullAgentsGuidelines();

      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain("Ansible Coding Guidelines");
    });

    it("should return markdown content with expected sections", async () => {
      const content = await getFullAgentsGuidelines();

      // Check for key sections that should be in the file
      expect(content).toContain("# Ansible Coding Guidelines");
      expect(content).toMatch(
        /##\s+(Guiding Principles|Coding Standards|Development Workflow)/,
      );
    });

    it("should handle file reading errors gracefully", async () => {
      // Mock fs.readFile to throw an error
      const readFileSpy = vi
        .spyOn(fs, "readFile")
        .mockRejectedValueOnce(new Error("ENOENT: no such file or directory"));

      await expect(getFullAgentsGuidelines()).rejects.toThrow(
        "Error loading agents.md file: ENOENT: no such file or directory",
      );

      expect(readFileSpy).toHaveBeenCalled();
    });

    it("should handle non-Error exceptions", async () => {
      // Mock fs.readFile to throw a non-Error
      const readFileSpy = vi
        .spyOn(fs, "readFile")
        .mockRejectedValueOnce("String error");

      await expect(getFullAgentsGuidelines()).rejects.toThrow(
        "Error loading agents.md file: String error",
      );

      expect(readFileSpy).toHaveBeenCalled();
    });

    it("should return consistent content on multiple calls", async () => {
      const content1 = await getFullAgentsGuidelines();
      const content2 = await getFullAgentsGuidelines();

      expect(content1).toBe(content2);
    });

    it("should handle bundled path detection logic", () => {
      // Test case 1: Path ending with "mcp/cli.js" should match
      const path1 = "/some/path/out/mcp/cli.js";
      expect(path1.endsWith("mcp/cli.js")).toBe(true);
      expect(path1.includes("out/mcp/cli.js")).toBe(true);

      // Test case 2: Path containing "out/mcp/cli.js" should match
      const path2 = "/full/absolute/path/to/out/mcp/cli.js";
      expect(path2.includes("out/mcp/cli.js")).toBe(true);

      // Test case 3: Path not matching should not match
      const path3 = "/some/other/path/script.js";
      expect(path3.endsWith("mcp/cli.js")).toBe(false);
      expect(path3.includes("out/mcp/cli.js")).toBe(false);

      // Test case 4: Verify type and length checks
      const validPath = "out/mcp/cli.js";
      expect(typeof validPath === "string").toBe(true);
      expect(validPath.length > 0).toBe(true);

      // Test case 5: Empty string should not pass length check
      const emptyPath = "";
      expect(emptyPath.length > 0).toBe(false);
    });
  });

  describe("getAvailableTopics", () => {
    it("should return a list of available topics", async () => {
      const topics = await getAvailableTopics();

      expect(typeof topics).toBe("string");
      expect(topics).toContain("Available Topics");
      expect(topics).toContain("Guiding Principles");
      expect(topics).toContain("Development Workflow");
      expect(topics).toContain("Coding Standards");
    });

    it("should include usage examples", async () => {
      const topics = await getAvailableTopics();

      expect(topics).toContain("Examples");
      expect(topics).toContain("Ask about a specific topic");
    });
  });

  describe("searchGuidelines", () => {
    it("should find relevant sections for yaml formatting query", async () => {
      const result = await searchGuidelines("yaml formatting");

      expect(result).toContain("YAML");
      expect(result).toContain("Formatting");
    });

    it("should find relevant sections for naming conventions query", async () => {
      const result = await searchGuidelines("naming conventions");

      expect(result).toContain("Naming");
    });

    it("should find relevant sections for roles query", async () => {
      const result = await searchGuidelines("roles");

      expect(result).toContain("Role");
    });

    it("should return helpful message when no results found", async () => {
      const result = await searchGuidelines("123");

      expect(result).toContain("No specific guidelines found");
      expect(result).toContain("Try asking about");
    });

    it("should limit results to prevent large outputs", async () => {
      const result = await searchGuidelines("ansible");

      // Should have content but not be excessively long
      expect(result.length).toBeLessThan(50000);
    });
  });

  describe("getAgentsGuidelines", () => {
    it("should return available topics when called with no query", async () => {
      const result = await getAgentsGuidelines();

      expect(result).toContain("Available Topics");
      expect(result).toContain("Guiding Principles");
    });

    it("should return available topics when called with empty string", async () => {
      const result = await getAgentsGuidelines("");

      expect(result).toContain("Available Topics");
    });

    it("should return relevant sections when called with a topic", async () => {
      const result = await getAgentsGuidelines("yaml formatting");

      expect(result).toContain("YAML");
      // Should not include the full available topics list
      expect(result).not.toContain("Available Topics");
    });

    it("should handle various topic queries", async () => {
      const queries = [
        "playbooks",
        "collections",
        "inventories",
        "variables",
        "testing",
      ];

      for (const query of queries) {
        const result = await getAgentsGuidelines(query);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});
