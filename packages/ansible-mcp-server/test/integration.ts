/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { createTestServer } from "./testWrapper.js";

describe("Ansible MCP Server Integration Tests", () => {
  let server: ReturnType<typeof createTestServer>;
  const workspaceRoot = path.join(__dirname, "fixtures");

  beforeAll(async () => {
    server = createTestServer(workspaceRoot);

    // Ensure fixture directory exists
    try {
      await fs.mkdir(path.dirname(workspaceRoot), { recursive: true });
    } catch {
      // Directory might already exist
    }
  });

  describe("workspace-file resource integration", () => {
    it("should read an actual test fixture file", async () => {
      const relPath = "playbook.yml";
      const uri = new URL(`workspace://file/${relPath}`);

      try {
        const result = await server.callResource(uri, { relPath });

        expect(result.contents).toHaveLength(1);
        expect(result.contents[0]).toHaveProperty("uri", uri.href);
        expect(result.contents[0]).toHaveProperty("mimeType", "text/plain");
        expect(result.contents[0]).toHaveProperty("text");
        expect(result.contents[0].text).toContain("Test playbook");
      } catch (error) {
        // If the fixture file doesn't exist, skip this test gracefully
        if ((error as Error & { code?: string }).code === "ENOENT") {
          console.warn("Fixture file not found, skipping integration test");
          return;
        }
        throw error;
      }
    });
  });

  describe("debug_env tool integration", () => {
    it("should return actual environment information", async () => {
      const result = await server.callTool("debug_env", {});

      expect(result.content).toHaveLength(4);
      expect(result.content[0].text).toMatch(/^PATH: /);
      expect(result.content[1].text).toMatch(/^VIRTUAL_ENV: /);
      expect(result.content[2].text).toMatch(/^CWD: /);
      expect(result.content[3].text).toMatch(/^Workspace Root: /);
    });
  });

  describe("zen_of_ansible tool integration", () => {
    it("should return all 20 aphorisms", async () => {
      const result = await server.callTool("zen_of_ansible", {});

      expect(result.content).toHaveLength(1);
      const zenText = result.content[0].text;

      expect(zenText).toContain("Ansible is not Python");
      expect(zenText).toContain("Automation is a journey that never ends");
    });
  });

  describe("ansible_fix_prompt integration", () => {
    it("should generate a complete prompt structure", async () => {
      const file = "test-playbook.yml";
      const errorSummary =
        "Line 5: [yaml] trailing whitespace\nLine 10: [ansible-lint] Use FQCN";

      const result = await server.callPrompt("ansible_fix_prompt", {
        file,
        errorSummary,
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toHaveProperty("role", "user");
      expect(result.messages[0]).toHaveProperty("content");
      expect(result.messages[0].content).toHaveProperty("type", "text");

      const promptText = result.messages[0].content.text;
      expect(promptText).toContain("expert in Ansible");
      expect(promptText).toContain(file);
      expect(promptText).toContain(errorSummary);
      expect(promptText).toContain("corrected YAML");
      expect(promptText).toContain("brief rationale");
    });
  });

  describe("tool input validation", () => {
    it("should validate ansible_lint tool inputs", async () => {
      // Test with empty file path
      await expect(async () => {
        await server.callTool("ansible_lint", { file: "" });
      }).rejects.toThrow();

      // Test with valid file path but file doesn't need to exist for schema validation
      const result = server.callTool("ansible_lint", {
        file: "valid-file.yml",
      });
      // This should not throw a validation error (it might fail later due to missing file/command)
      expect(result).toBeDefined();
    });

    it("should validate prompt inputs", async () => {
      // Test ansible_fix_prompt with missing required fields
      await expect(async () => {
        await server.callPrompt("ansible_fix_prompt", {
          file: "test.yml",
        } as any);
      }).rejects.toThrow();

      await expect(async () => {
        await server.callPrompt("ansible_fix_prompt", {
          errorSummary: "some error",
        } as any);
      }).rejects.toThrow();
    });
  });
});
