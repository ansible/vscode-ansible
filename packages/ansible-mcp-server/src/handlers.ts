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
import {
  generateExecutionEnvironment,
  formatExecutionEnvResult,
  buildEEStructureFromPrompt,
} from "./tools/executionEnv.js";

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

export function createDefineAndBuildExecutionEnvHandler(workspaceRoot: string) {
  return async (args: {
    baseImage: string;
    tag: string;
    destinationPath?: string;
    collections?: string[];
    systemPackages?: string[];
    pythonPackages?: string[];
    generatedYaml?: string;
  }) => {
    try {
      // Validate required inputs
      if (!args.baseImage || !args.tag) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "Error: 'baseImage' and 'tag' are required fields.\n\n" +
                "**Please provide the following critical information:**\n" +
                "- **baseImage**: The base container image (e.g., 'quay.io/fedora/fedora-minimal:41', 'quay.io/centos/centos:stream10')\n" +
                "- **tag**: The tag/name for the resulting image (e.g., 'my-ee:latest')\n\n" +
                "**Optional fields:**\n" +
                "- **collections**: Array of Ansible collection names (e.g., ['amazon.aws', 'ansible.utils'])\n" +
                "- **systemPackages**: Array of system packages (e.g., ['git', 'vim'])\n" +
                "- **pythonPackages**: Array of Python packages (e.g., ['boto3', 'requests'])\n" +
                "- **destinationPath**: Directory path for the file (defaults to workspace root)\n\n" +
                "**Note:** The tool will use the execution environment schema and sample file to generate a compliant EE file.",
            },
          ],
          isError: true,
        };
      }

      // If generatedYaml is provided, use it to create the file
      // Otherwise, return a prompt for the client's LLM to generate the YAML
      if (!args.generatedYaml) {
        // Return prompt for LLM to generate YAML
        const { prompt } = await buildEEStructureFromPrompt(args);
        return {
          content: [
            {
              type: "text" as const,
              text:
                `**Please generate the execution-environment.yml file using the following prompt:**\n\n` +
                `\`\`\`\n${prompt}\n\`\`\`\n\n` +
                `**After generating the YAML, call this tool again with the 'generatedYaml' parameter containing the generated YAML content.**`,
            },
          ],
          isError: false,
        };
      }

      // Generate execution environment file using LLM-generated YAML
      const result = await generateExecutionEnvironment(
        args,
        workspaceRoot,
        args.generatedYaml,
      );

      // Format result for display
      const formattedOutput = formatExecutionEnvResult(result);

      return {
        content: [
          {
            type: "text" as const,
            text: formattedOutput,
          },
        ],
        isError: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Error creating execution environment: ${errorMessage}\n\n` +
              "Please ensure:\n" +
              "- Valid base image name is provided\n" +
              "- Destination path is writable (if specified)\n" +
              "- All inputs are properly formatted\n" +
              "- Generated YAML is valid and follows the rules",
          },
        ],
        isError: true,
      };
    }
  };
}
