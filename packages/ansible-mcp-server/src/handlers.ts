import fs from "node:fs/promises";
import path from "node:path";
import { ZEN_OF_ANSIBLE } from "./constants.js";
import { runAnsibleLint, formatLintingResult } from "./tools/ansibleLint.js";
import {
  runAnsibleNavigator,
  formatNavigatorResult,
} from "./tools/ansibleNavigator.js";
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

export function createAnsibleNavigatorHandler() {
  return async (
    args: {
      userMessage?: string;
      filePath?: string; // For direct use (tests, advanced users)
      mode?: string;
      environment?: string;
      disableExecutionEnvironment?: boolean;
    },
    workspaceRoot?: string,
  ) => {
    // If userMessage is not provided, return helpful information about ansible-navigator features
    if (!args.userMessage || args.userMessage.trim() === "") {
      return {
        content: [{
          type: "text" as const,
          text:
            "# Ansible Navigator - Features & Usage Guide\n\n" +
            "## 📋 Output Modes (specify with `-m` or `--mode`)\n" +
            "- **stdout** (used by this tool) - Direct terminal output (like ansible-playbook)\n" +
            "- **interactive** (ansible-navigator default) - Text-based UI for exploring execution\n\n" +
            "## 🖥️ Execution Environments\n" +
            "- **VM/Podman** (default) - Runs in isolated container environment\n" +
            "- **Local Ansible** - Runs directly on your system (use `--ee false`)\n" +
            "- **Virtual Environment** - Runs from specific Python venv\n\n" +
            "## 🚀 Quick Commands\n" +
            "```bash\n" +
            "# Interactive mode (default)\n" +
            "ansible-navigator run playbooks/play1.yml\n\n" +
            "# Direct stdout output (traditional ansible-playbook style)\n" +
            "ansible-navigator run playbooks/play1.yml -m stdout\n\n" +
            "# Disable execution environment (run with local Ansible)\n" +
            "ansible-navigator run playbooks/play1.yml --ee false\n\n" +
            "# Combine stdout mode with local Ansible\n" +
            "ansible-navigator run playbooks/play1.yml -m stdout --ee false\n\n" +
            "# Use specific Python venv\n" +
            "source venv/bin/activate && ansible-navigator run playbooks/play1.yml -m stdout\n" +
            "```\n\n" +
            "## 💡 Tips\n" +
            "- **This tool uses**: stdout mode (direct output, best for chat/scripting)\n" +
            "- **For exploration**: Use `-m interactive` (TUI - press ESC to navigate)\n" +
            "- **Podman/Docker**: Required for execution environment (EE)\n" +
            "- **If Podman fails**: Use `--ee false` to run with local Ansible\n" +
            "- **Environment auto-detection**: Checks PATH, then venv, then system\n\n" +
            "## 🎯 For This Session\n" +
            "Tell me which playbook to run and I'll execute it with your preferred settings!"
        }],
        isError: false,
      };
    }

    // If filePath is directly provided (for tests), use it
    let targetFilePath: string | undefined = args.filePath;

    // Otherwise, parse user message to extract filename
    if (!targetFilePath && args.userMessage && workspaceRoot) {
      // Extract potential filenames from user message
      // Look for patterns like: play1, play1.yml, playbooks/play1.yml, deploy, site.yml, etc.
      const message = args.userMessage.toLowerCase();

      // Try to find explicit file paths first (with directory)
      const explicitPathMatch = args.userMessage.match(/(?:playbooks\/)?[\w-]+\.ya?ml/);
      if (explicitPathMatch) {
        targetFilePath = explicitPathMatch[0];
        // If it doesn't start with playbooks/ and isn't an absolute path, prepend playbooks/
        if (!targetFilePath.startsWith('playbooks/') && !targetFilePath.startsWith('/')) {
          targetFilePath = `playbooks/${targetFilePath}`;
        }
      } else {
        // Look for playbook names (without extension)
        // Common patterns: "run play1", "execute deploy", "start site", etc.
        const nameMatch = message.match(/(?:run|execute|start|launch)\s+([\w-]+)/);
        if (nameMatch) {
          const playbookName = nameMatch[1];
          targetFilePath = `playbooks/${playbookName}.yml`;
        }
      }
    }

    // If no file path found, ask user to be more specific
    if (!targetFilePath) {
      return {
        content: [{
          type: "text" as const,
          text:
            "❌ **Could not determine which playbook to run.**\n\n" +
            "Please specify the playbook name more clearly. Examples:\n" +
            "- 'run play1.yml'\n" +
            "- 'run playbooks/deploy.yml'\n" +
            "- 'execute site.yml'\n\n" +
            "Common playbook locations:\n" +
            "- `playbooks/play1.yml`\n" +
            "- `playbooks/site.yml`\n" +
            "- `playbooks/deploy.yml`"
        }],
        isError: true,
      };
    }

    // Use mode from args, defaulting to "stdout" for better UX in chat/scripting contexts
    const mode = args.mode || "stdout";

    // Use disableExecutionEnvironment from args, defaulting to false
    // If user encounters Podman/Docker errors, they should set this to true
    let disableExecutionEnvironment = args.disableExecutionEnvironment || false;

    // Normalize filePath (trim whitespace)
    const normalizedFilePath = targetFilePath;

    // Use environment from args, defaulting to "auto" if not provided
    const environment = args.environment || "auto";

    try {
      const { output, debugOutput, navigatorPath, executionEnvironmentDisabled } = await runAnsibleNavigator(
        normalizedFilePath,
        mode,
        workspaceRoot,
        disableExecutionEnvironment,
        environment,
      );

      const formattedResult = formatNavigatorResult(
        output,
        debugOutput,
        normalizedFilePath,
        mode,
        executionEnvironmentDisabled ?? disableExecutionEnvironment,
        navigatorPath,
        environment,
      );

      return {
        content: [{ type: "text" as const, text: formattedResult }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check if this is a container engine error and we haven't already disabled EE
      // Use case-insensitive checks to catch all variations
      const errorMessageLower = errorMessage.toLowerCase();
      const isContainerEngineError =
        errorMessageLower.includes("container engine") ||
        errorMessageLower.includes("podman") ||
        errorMessageLower.includes("docker") ||
        errorMessageLower.includes("execution environment") ||
        errorMessageLower.includes("cannot connect to podman") ||
        errorMessageLower.includes("connection refused") ||
        errorMessageLower.includes("podman pull") ||
        errorMessageLower.includes("podman machine") ||
        errorMessageLower.includes("ghcr.io/ansible");

      // If it's a container engine error and we haven't already disabled EE, automatically retry
      if (isContainerEngineError && !disableExecutionEnvironment) {
        // Inform the user we're automatically retrying
        const retryMessage = `⚠️  Container engine error detected. Automatically retrying with execution environment disabled...\n\n`;

        try {
          // Retry with execution environment disabled
          const { output, debugOutput, navigatorPath, executionEnvironmentDisabled } = await runAnsibleNavigator(
            normalizedFilePath,
            mode,
            workspaceRoot,
            true, // Force disable execution environment
            environment,
          );

          const formattedResult = formatNavigatorResult(
            output,
            debugOutput,
            normalizedFilePath,
            mode,
            executionEnvironmentDisabled ?? true,
            navigatorPath,
            environment,
          );

          return {
            content: [{
              type: "text" as const,
              text: retryMessage + formattedResult
            }],
          };
        } catch (retryError) {
          // If retry also fails, return both errors
          const retryErrorMessage = retryError instanceof Error ? retryError.message : String(retryError);
          return {
            content: [
              {
                type: "text" as const,
                text: `${retryMessage}Original error: ${errorMessage}\n\nRetry error: ${retryErrorMessage}\n\nPlease check your ansible-navigator installation and configuration.`,
              },
            ],
            isError: true,
          };
        }
      }

      // For non-container-engine errors, or if we already disabled EE, return the error
      return {
        content: [
          {
            type: "text" as const,
            text: `Error running ansible-navigator: ${errorMessage}\n\nEnsure 'ansible-navigator' is installed and on PATH\n`,
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
    console.log("[EE Tool Handler] Called with args:", {
      baseImage: args.baseImage,
      tag: args.tag,
      destinationPath: args.destinationPath,
      collections: args.collections,
      systemPackages: args.systemPackages,
      pythonPackages: args.pythonPackages,
      hasGeneratedYaml: !!args.generatedYaml,
      generatedYamlLength: args.generatedYaml?.length,
    });

    try {
      // Validate required inputs
      if (!args.baseImage || !args.tag) {
        console.log(
          "[EE Tool Handler] Validation failed: missing baseImage or tag",
        );
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

      // Return a prompt for the client's LLM to generate the YAML
      if (!args.generatedYaml) {
        console.log(
          "[EE Tool Handler] No generatedYaml provided - returning prompt for LLM to generate YAML",
        );
        const { prompt } = await buildEEStructureFromPrompt(args);
        console.log(
          "[EE Tool Handler] Prompt generated, length:",
          prompt.length,
        );
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
      console.log(
        "[EE Tool Handler] generatedYaml IS provided - proceeding to generate EE file",
      );
      console.log(
        "[EE Tool Handler] Generating EE file with LLM-generated YAML",
      );
      console.log(
        "[EE Tool Handler] generatedYaml length:",
        args.generatedYaml?.length,
      );
      console.log(
        "[EE Tool Handler] generatedYaml preview (first 200 chars):",
        args.generatedYaml?.substring(0, 200),
      );
      const result = await generateExecutionEnvironment(
        args,
        workspaceRoot,
        args.generatedYaml,
      );

      console.log("[EE Tool] File generated successfully:", result.filePath);
      console.log("[EE Tool] Result object:", {
        success: result.success,
        filePath: result.filePath,
        hasYamlContent: !!result.yamlContent,
        yamlContentLength: result.yamlContent?.length,
        validationErrors: result.validationErrors,
      });

      // Format result for display
      const formattedOutput = formatExecutionEnvResult(result);
      console.log("[EE Tool] Formatted output length:", formattedOutput.length);
      console.log(
        "[EE Tool] Formatted output preview (first 500 chars):",
        formattedOutput.substring(0, 500),
      );

      const response = {
        content: [
          {
            type: "text" as const,
            text: formattedOutput,
          },
        ],
        isError: false,
      };

      console.log(
        "[EE Tool] Returning response with content length:",
        response.content[0].text.length,
      );
      console.log(
        "[EE Tool] Response content preview (first 500 chars):",
        response.content[0].text.substring(0, 500),
      );
      return response;
    } catch (error) {
      console.error("[EE Tool Handler] Error occurred:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[EE Tool Handler] Error message:", errorMessage);
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
