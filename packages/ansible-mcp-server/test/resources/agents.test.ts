import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { getAgentsGuidelines } from "../../src/resources/agents.js";

describe("agents.ts resource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAgentsGuidelines", () => {
    it("should successfully read agents.md file", async () => {
      const content = await getAgentsGuidelines();

      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain("Ansible Coding Guidelines");
    });

    it("should return markdown content with expected sections", async () => {
      const content = await getAgentsGuidelines();

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

      await expect(getAgentsGuidelines()).rejects.toThrow(
        "Error loading agents.md file: ENOENT: no such file or directory",
      );

      expect(readFileSpy).toHaveBeenCalled();
    });

    it("should handle non-Error exceptions", async () => {
      // Mock fs.readFile to throw a non-Error
      const readFileSpy = vi
        .spyOn(fs, "readFile")
        .mockRejectedValueOnce("String error");

      await expect(getAgentsGuidelines()).rejects.toThrow(
        "Error loading agents.md file: String error",
      );

      expect(readFileSpy).toHaveBeenCalled();
    });

    it("should handle permission errors", async () => {
      const readFileSpy = vi
        .spyOn(fs, "readFile")
        .mockRejectedValueOnce(new Error("EACCES: permission denied"));

      await expect(getAgentsGuidelines()).rejects.toThrow(
        "Error loading agents.md file: EACCES: permission denied",
      );

      expect(readFileSpy).toHaveBeenCalled();
    });

    it("should return consistent content on multiple calls", async () => {
      const content1 = await getAgentsGuidelines();
      const content2 = await getAgentsGuidelines();

      expect(content1).toBe(content2);
    });
  });
});
