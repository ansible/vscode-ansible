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
