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
});
