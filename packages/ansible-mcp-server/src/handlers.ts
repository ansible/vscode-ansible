import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ZEN_OF_ANSIBLE } from "./constants.js";

export function createDebugEnvHandler(workspaceRoot: string) {
  return async () => {
    return {
      content: [
        { type: "text" as const, text: `PATH: ${process.env.PATH}\n` },
        {
          type: "text" as const,
          text: `VIRTUAL_ENV: ${process.env.VIRTUAL_ENV || "undefined"}\n`,
        },
        { type: "text" as const, text: `CWD: ${process.cwd()}\n` },
        { type: "text" as const, text: `Workspace Root: ${workspaceRoot}\n` },
      ],
    };
  };
}

export function createZenOfAnsibleHandler() {
  return async () => {
    return {
      content: [
        {
          type: "text" as const,
          text: ZEN_OF_ANSIBLE,
        },
      ],
    };
  };
}

export function createAnsibleLintHandler(workspaceRoot: string) {
  return async ({
    file,
    extraArgs = [],
  }: {
    file: string;
    extraArgs?: string[];
  }): Promise<{
    content: { type: "text"; text: string }[];
    isError?: boolean;
  }> => {
    const abs = path.resolve(workspaceRoot, file);
    return await new Promise((resolve) => {
      const child = spawn("ansible-lint", [abs, ...extraArgs], {
        cwd: workspaceRoot,
        env: process.env,
      });
      let stdout = "";
      let stderr = "";

      child.on("error", (err) => {
        resolve({
          content: [
            { type: "text" as const, text: `Error: ${err.message}\n` },
            {
              type: "text" as const,
              text: "Ensure 'ansible-lint' is installed and on PATH",
            },
          ],
          isError: true,
        });
      });

      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        resolve({
          content: [
            { type: "text" as const, text: `exitCode: ${code}\n` },
            { type: "text" as const, text: stdout || "" },
            { type: "text" as const, text: stderr || "" },
          ],
        });
      });
    });
  };
}

export function createWorkspaceFileHandler(workspaceRoot: string) {
  return async (uri: URL, variables: Record<string, string | string[]>) => {
    const raw = variables["relPath"];
    const rel = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
    const abs = path.resolve(workspaceRoot, rel);
    const data = await fs.readFile(abs, "utf8");
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: data }],
    };
  };
}

export function createAnsibleFixPromptHandler() {
  return ({ file, errorSummary }: { file: string; errorSummary: string }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text:
            `You are an expert in Ansible. Given lint issues in ${file}, suggest minimal edits.\n\n` +
            `Issues:\n${errorSummary}\n\nReturn corrected YAML and a brief rationale.`,
        },
      },
    ],
  });
}

export function createListToolsHandler(getToolNames: () => string[]) {
  return async () => {
    const toolNames = getToolNames();
    const toolList = toolNames.join("\n- ");
    return {
      content: [
        {
          type: "text" as const,
          text: `Available Ansible MCP Tools:\n\n- ${toolList}\n\nUse any of these tools by asking me to use them by name.`,
        },
      ],
    };
  };
}
