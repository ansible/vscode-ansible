import fs from "node:fs/promises";
import path from "node:path";
import { ZEN_OF_ANSIBLE } from "./constants.js";
import { runAnsibleLint, formatLintingResult } from "./tools/ansibleLint.js";
import {
  getEnvironmentInfo,
  setupDevelopmentEnvironment,
  checkAndInstallADT,
  formatEnvironmentInfo,
} from "./tools/adeTools.js";

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
  return async (args: { filePath: string; fix?: boolean }) => {
    try {
      // Check if fix parameter is explicitly provided
      const fix = args.fix;

      // If fix is not specified, prompt the user for their preference
      if (fix === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "Would you like ansible-lint to apply automatic fixes?\n\n" +
                "Please specify:\n" +
                "- `fix: true` to run with automatic fixes (ansible-lint --fix)\n" +
                "- `fix: false` to run without fixes (ansible-lint only)\n\n" +
                "The --fix flag can automatically fix issues like:\n" +
                "- command-instead-of-shell\n" +
                "- deprecated-local-action\n" +
                "- fqcn (Fully Qualified Collection Names)\n" +
                "- jinja formatting\n" +
                "- key-order\n" +
                "- name formatting\n" +
                "- no-free-form\n" +
                "- no-jinja-when\n" +
                "- no-log-password\n" +
                "- partial-become\n" +
                "- yaml formatting\n\n" +
                "When using fix: true, the tool will show you the fixed content after applying automatic fixes.\n\n" +
                "Please re-run the tool with your preference.",
            },
          ],
        };
      }

      const { result: lintingResult, fixedContent } = await runAnsibleLint(
        args.filePath,
        fix,
      );

      // Ensure the result is an array before formatting
      const resultArray = Array.isArray(lintingResult) ? lintingResult : [];
      const formattedResult = formatLintingResult(
        resultArray,
        fix,
        fixedContent,
        args.filePath,
      );

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

export function createADEEnvironmentInfoHandler(workspaceRoot: string) {
  return async () => {
    try {
      const envInfo = await getEnvironmentInfo(workspaceRoot);
      const formattedInfo = formatEnvironmentInfo(envInfo);

      return {
        content: [
          {
            type: "text" as const,
            text: formattedInfo,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting environment information: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  };
}

export function createADESetupEnvironmentHandler(workspaceRoot: string) {
  return async (args: {
    envName?: string;
    pythonVersion?: string;
    collections?: string[];
    installRequirements?: boolean;
    requirementsFile?: string;
  }) => {
    try {
      const result = await setupDevelopmentEnvironment(workspaceRoot, args);

      return {
        content: [
          {
            type: "text" as const,
            text: result.output,
          },
        ],
        isError: !result.success,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error setting up development environment: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  };
}

export function createADTCheckEnvHandler() {
  return async () => {
    try {
      const result = await checkAndInstallADT();

      return {
        content: [
          {
            type: "text" as const,
            text: result.output,
          },
        ],
        isError: !result.success,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error checking/installing ADT: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  };
}
