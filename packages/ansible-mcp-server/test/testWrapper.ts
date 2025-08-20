import { createAnsibleMcpServer } from "../src/server.js";
import fs from "node:fs/promises";
import path from "node:path";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

/**
 * Test wrapper that provides test-friendly methods for the MCP server
 */
export function createTestServer(workspaceRoot: string) {
  const server = createAnsibleMcpServer(workspaceRoot);

  return {
    // Test helper methods that simulate MCP server behavior
    async callTool(name: string, args: any) {
      if (name === "debug_env") {
        return {
          content: [
            { type: "text", text: `PATH: ${process.env.PATH}\n` },
            {
              type: "text",
              text: `VIRTUAL_ENV: ${process.env.VIRTUAL_ENV || "undefined"}\n`,
            },
            { type: "text", text: `CWD: ${process.cwd()}\n` },
            { type: "text", text: `Workspace Root: ${workspaceRoot}\n` },
          ],
        };
      }

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

      if (name === "ansible_lint") {
        if (!args.file) {
          throw new Error("File parameter is required");
        }
        return {
          content: [
            { type: "text", text: "exitCode: 0\n" },
            { type: "text", text: "Mock ansible-lint output\n" },
            { type: "text", text: "" },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    },

    async callResource(uri: URL, vars: any) {
      if (uri.protocol === "workspace:") {
        const relPath = Array.isArray(vars.relPath)
          ? vars.relPath.join("/")
          : String(vars.relPath ?? "");
        const fullPath = path.resolve(workspaceRoot, relPath);
        const data = await fs.readFile(fullPath, "utf8");
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: data,
            },
          ],
        };
      }
      throw new Error(`Unknown resource protocol: ${uri.protocol}`);
    },

    async callPrompt(name: string, args: any) {
      if (name === "ansible_fix_prompt") {
        if (!args.file || args.errorSummary === undefined) {
          throw new Error("Both file and errorSummary parameters are required");
        }
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `You are an expert in Ansible. Given lint issues in ${args.file}, suggest minimal edits.\n\nIssues:\n${args.errorSummary}\n\nReturn corrected YAML and a brief rationale.`,
              },
            },
          ],
        };
      }
      throw new Error(`Unknown prompt: ${name}`);
    },

    // Server metadata for tests
    name: "ansible-mcp-server",
    version: "0.1.0",
    listTools: () => [
      { name: "debug_env" },
      { name: "zen_of_ansible" },
      { name: "ansible_lint" },
    ],
    listResources: () => [{ name: "workspace-file" }],
    listPrompts: () => [{ name: "ansible_fix_prompt" }],
  };
}
