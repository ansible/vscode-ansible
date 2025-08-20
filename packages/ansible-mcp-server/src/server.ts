import { z } from "zod";

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createDebugEnvHandler,
  createZenOfAnsibleHandler,
  createAnsibleLintHandler,
  createWorkspaceFileHandler,
  createAnsibleFixPromptHandler,
} from "./handlers.js";

export function createAnsibleMcpServer(workspaceRoot: string) {
  const server = new McpServer({
    name: "ansible-mcp-server",
    version: "0.1.0",
  });

  // Tools
  server.registerTool(
    "debug_env",
    {
      title: "Debug Environment",
      description: "Show PATH and environment info for debugging",
    },
    createDebugEnvHandler(workspaceRoot),
  );

  server.registerTool(
    "zen_of_ansible",
    {
      title: "The Zen of Ansible",
      description: "20 aphorisms that describe Ansible's design philosophy.",
    },
    createZenOfAnsibleHandler(),
  );

  server.registerTool(
    "ansible_lint",
    {
      title: "ansible-lint",
      description: "Run ansible-lint on a file within the workspace",
      inputSchema: {
        file: z
          .string()
          .min(1)
          .describe("Relative path to file within workspace"),
        extraArgs: z
          .array(z.string())
          .optional()
          .describe("Extra arguments to pass to ansible-lint"),
      },
    },
    createAnsibleLintHandler(workspaceRoot),
  );

  // Resources
  server.registerResource(
    "workspace-file",
    new ResourceTemplate("workspace://file/{relPath}", { list: undefined }),
    {
      title: "Workspace file reader",
      description: "Read files from the current workspace",
      mimeType: "text/plain",
    },
    createWorkspaceFileHandler(workspaceRoot),
  );

  // Prompts - kinda broken in Cursor, inputs don't show up correctly
  server.registerPrompt(
    "ansible_fix_prompt",
    {
      title: "Ansible Fix Prompt",
      description: "Prompt template for fixing ansible-lint issues",
      argsSchema: {
        file: z.string(),
        errorSummary: z.string(),
      },
    },
    createAnsibleFixPromptHandler(),
  );

  return server;
}

export async function runStdio(workspaceRoot: string) {
  const server = createAnsibleMcpServer(workspaceRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive for stdio-based clients until they close the transport
  await new Promise<void>(() => {});
}
