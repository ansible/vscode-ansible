import fs from "node:fs/promises";
import path from "node:path";
import { ZEN_OF_ANSIBLE } from "./constants.js";
import { runAnsibleLint, formatLintingResult } from "./ansibleLint.js";

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

export function createAnsibleLintHandler() {
  return async (args: {
    content?: string;
    [x: string]: any;
  }) => {
    const content = args.playbookContent;
    try {
      const lintingResult = await runAnsibleLint(content);

      const formattedResult = formatLintingResult(lintingResult);
      return {
        content: [{ type: "text" as const, text: formattedResult }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          { type: "text" as const, text: `Error: ${errorMessage}\n` },
          {
            type: "text" as const,
            text: "Ensure 'ansible-lint' is installed and on PATH\n",
          },
        ],
        isError: true,
      };
    }
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
