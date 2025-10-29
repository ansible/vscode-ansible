import { describe, it, expect } from "vitest";
import { createZenOfAnsibleHandler } from "../src/handlers.js";
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

  // describe("ansible_lint handler", () => {
  //   it("should handle file input without options", async () => {
  //     const handler = createAnsibleLintHandler();
  //     const result = await handler({ file: "playbook.yml" });

  //     // This will fail in test environment since ansible-lint isn't available
  //     // but we can test the structure
  //     expect(result.content).toBeDefined();
  //     expect(result.content.length).toBeGreaterThan(0);
  //   });

  //   it("should handle file input with options", async () => {
  //     const handler = createAnsibleLintHandler();
  //     const result = await handler({
  //       file: "playbook.yml",
  //       extraArgs: ["--skip-list", "no-changed-when"],
  //     });

  //     expect(result.content).toBeDefined();
  //     expect(result.content.length).toBeGreaterThan(0);
  //   });

  //   it("should handle file input with multiple options", async () => {
  //     const handler = createAnsibleLintHandler();
  //     const result = await handler({
  //       file: "playbook.yml",
  //       extraArgs: [
  //         "--skip-list",
  //         "no-changed-when",
  //         "--exclude",
  //         "roles/legacy/",
  //       ],
  //     });

  //     expect(result.content).toBeDefined();
  //     expect(result.content.length).toBeGreaterThan(0);
  //   });
  // });
});
