import { describe, it, expect } from "vitest";
import {
  createZenOfAnsibleHandler,
  createDebugEnvHandler,
  createAnsibleLintHandler,
} from "../src/handlers.js";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

describe("MCP Handlers", () => {
  describe("zen_of_ansible handler", () => {
    it("should return the Zen of Ansible aphorisms", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: ZEN_OF_ANSIBLE,
          },
        ],
      });
    });

    it("should handle empty arguments", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Simple is better than complex");
    });

    it("should handle undefined arguments", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
    });

    it("should return consistent results", async () => {
      const handler = createZenOfAnsibleHandler();
      const result1 = await handler();
      const result2 = await handler();

      expect(result1).toEqual(result2);
    });

    it("should return all 20 aphorisms", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      const text = result.content[0].text;
      const lines = text.split("\n").filter((line) => line.trim().length > 0);

      // Should have 20 numbered aphorisms
      const numberedLines = lines.filter((line) => /^\d+\./m.test(line.trim()));
      expect(numberedLines).toHaveLength(20);
    });

    it("should include key Ansible principles", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      const text = result.content[0].text;

      // Check for key principles
      expect(text).toContain("Simple is better than complex");
      expect(text).toContain("Readability counts");
      expect(text).toContain("Declarative is better than imperative");
      expect(text).toContain("YAML");
    });
  });

  describe("ansible_lint handler", () => {
    it("should prompt user when fix parameter is not provided", async () => {
      const handler = createAnsibleLintHandler();
      const result = await handler({
        playbookContent: "---\n- hosts: localhost",
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.content[0].text).toContain(
        "Would you like ansible-lint to apply automatic fixes?",
      );
      expect(result.content[0].text).toContain("fix: true");
      expect(result.content[0].text).toContain("fix: false");
    });

    it("should not prompt user when fix parameter is explicitly set to false", async () => {
      const handler = createAnsibleLintHandler();
      const result = await handler({
        playbookContent: "---\n- hosts: localhost",
        fix: false,
      });

      // Should not contain the prompt message
      expect(result.content[0].text).not.toContain(
        "Would you like ansible-lint to apply automatic fixes?",
      );
      // Should not contain fixed content since fix is false
      expect(result.content[0].text).not.toContain("📝 Fixed content:");
      // Should either contain an error (if ansible-lint not available) or linting results
      expect(result.content).toBeDefined();
    });

    it("should not prompt user when fix parameter is explicitly set to true", async () => {
      const handler = createAnsibleLintHandler();
      const result = await handler({
        playbookContent: "---\n- hosts: localhost",
        fix: true,
      });

      // Should not contain the prompt message
      expect(result.content[0].text).not.toContain(
        "Would you like ansible-lint to apply automatic fixes?",
      );
      // Should contain fixed content since fix is true
      expect(result.content[0].text).toContain("📝 Fixed content:");
      // Should either contain an error (if ansible-lint not available) or linting results
      expect(result.content).toBeDefined();
    });
  });

  describe("debug_env handler", () => {
    const workspaceRoot = "/test/workspace";

    it("should return environment information", async () => {
      const handler = createDebugEnvHandler(workspaceRoot);
      const result = await handler();

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].text).toContain("PATH:");
      expect(result.content[1].text).toContain("VIRTUAL_ENV:");
      expect(result.content[2].text).toContain("CWD:");
      expect(result.content[3].text).toContain("Workspace Root:");
    });
  });
});
