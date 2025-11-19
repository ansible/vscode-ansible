import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createZenOfAnsibleHandler,
  createListToolsHandler,
  createAnsibleLintHandler,
  createAnsibleNavigatorHandler,
  createADEEnvironmentInfoHandler,
  createADESetupEnvironmentHandler,
  createADTCheckEnvHandler,
} from "./handlers.js";
import {
  checkDependencies,
  formatDependencyError,
  type Dependency,
} from "./dependencyChecker.js";
import { createInitHandler } from "./tools/creator.js";

export function createAnsibleMcpServer(workspaceRoot: string) {
  const server = new McpServer({
    name: "ansible-mcp-server",
    version: "0.1.0",
  });

  // Track registered tools for error messages
  const registeredTools = new Set<string>();

  // Track tool dependencies
  const toolDependencies = new Map<string, Dependency[]>();

  // Store original registerTool method
  const originalRegisterTool = server.registerTool.bind(server);

  // Helper function to register a tool with dependencies
  const registerToolWithDeps = (
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: any,
    dependencies: Dependency[] = [],
  ) => {
    registeredTools.add(name);
    toolDependencies.set(name, dependencies);
    return originalRegisterTool(name, config, handler);
  };

  // Register core tools
  registerToolWithDeps(
    "zen_of_ansible",
    {
      title: "The Zen of Ansible",
      description: "20 aphorisms that describe Ansible's design philosophy.",
    },
    createZenOfAnsibleHandler(),
    [], // No dependencies
  );

  registerToolWithDeps(
    "list_available_tools",
    {
      title: "List Available Tools",
      description:
        "Shows all available Ansible MCP tools. Use this to discover what tools you can use. " +
        "Perfect for exploring capabilities and finding the right tool for your task.",
      annotations: {
        keywords: [
          "list available tools",
          "show me tools",
          "what tools are available",
          "discover ansible tools",
          "explore ansible capabilities",
          "ansible tool overview",
          "help with tool selection",
          "find ansible tool",
          "search ansible tools",
        ],
        useCases: [
          "Discover available Ansible MCP tools",
          "Get overview of Ansible tools",
          "Find the right Ansible tool for a task",
          "Explore Ansible tool capabilities",
          "Get help selecting Ansible tools",
        ],
      },
    },
    createListToolsHandler(() => Array.from(registeredTools)),
    [], // No dependencies
  );

  registerToolWithDeps(
    "ansible_lint",
    {
      title: "Ansible Lint",
      description:
        "**PREFERRED APPROACH**: Instead of using this MCP tool, use terminal commands to run ansible-lint. " +
        "Execute commands like: `ansible-lint playbooks/deploy.yml` or `ansible-lint site.yml --fix`. " +
        "The LLM can infer the file path from the currently open file, files mentioned in conversation, or workspace context. " +
        "This approach works better because the LLM naturally understands file paths in terminal commands. " +
        "\n\n" +
        "**Alternative (if terminal is not available)**: This tool can run ansible-lint programmatically, " +
        "but requires the `filePath` parameter. The tool will attempt auto-detection if filePath is not provided, " +
        "but using terminal commands is the recommended approach.",
      inputSchema: {
        filePath: z
          .string()
          .describe(
            "Path to the Ansible playbook file to lint. " +
              "**Note**: Using terminal commands (e.g., 'ansible-lint playbooks/deploy.yml') is preferred. " +
              "This parameter is only needed if using the MCP tool directly.",
          ),
        fix: z
          .boolean()
          .optional()
          .describe(
            "Whether to apply automatic fixes using ansible-lint --fix. If not specified, tool will prompt user for preference.",
          ),
      },
      annotations: {
        keywords: [
          "ansible-lint",
          "linting",
          "code-quality",
          "yaml-validation",
          "playbook-validation",
          "ansible-best-practices",
          "automated-fixes",
        ],
        useCases: [
          "Validate Ansible playbook syntax and best practices",
          "Check YAML formatting and structure",
          "Detect common Ansible anti-patterns",
          "Automatically fix linting issues",
          "Debug playbook configuration problems",
        ],
      },
    },
    createAnsibleLintHandler(),
    [],
  );

  // Schema with userMessage - tool extracts filename from user's prompt
  const navigatorInputSchema = {
    type: "object",
    properties: {
      userMessage: {
        type: "string",
        description:
          "**REQUIRED:** The user's original message/prompt. Just pass it as-is (DO NOT leave empty). " +
          "The tool will parse it to extract the playbook filename. " +
          "\n" +
          "**EXAMPLES OF CORRECT USAGE:** " +
          "- User says: 'run play1.yml' → You MUST pass: {\"userMessage\": \"run play1.yml\"} " +
          "- User says: 'execute deploy playbook' → You MUST pass: {\"userMessage\": \"execute deploy playbook\"} " +
          "- User says: 'run playbooks/site.yml' → You MUST pass: {\"userMessage\": \"run playbooks/site.yml\"} " +
          "\n" +
          "**DO NOT call this tool with empty userMessage or {}. Always provide the user's message.**",
      },
      filePath: {
        type: "string",
        description:
          "Advanced: Direct file path to the playbook. " +
          "If provided, this takes precedence over userMessage parsing. " +
          "Most of the time, just use userMessage instead.",
      },
      mode: {
        type: "string",
        enum: ["stdout", "interactive"],
        default: "stdout",
        description:
          "Output mode: 'stdout' (direct terminal output, like ansible-playbook) or 'interactive' (default, text-based UI). " +
          "Only set this if user explicitly asks for a specific mode.",
      },
      environment: {
        type: "string",
        default: "auto",
        description:
          "Environment selection: 'auto' (default, checks PATH first, then venv), 'system' (only use PATH/system), " +
          "'venv' (only use virtual environment), or a specific venv name/path (e.g., 'ansible-dev', 'venv', '/path/to/venv'). " +
          "When a specific venv name is provided, the tool searches in the workspace and parent directories.",
      },
      disableExecutionEnvironment: {
        type: "boolean",
        default: false,
        description:
          "Set to `true` to disable execution environments (passes --ee false). " +
          "**Use this if you encounter Podman/Docker errors.** " +
          "When disabled, ansible-navigator will use the local Ansible installation instead of containerized execution environments.",
      },
    },
    required: ["userMessage"], // userMessage is REQUIRED - LLM must pass the user's prompt
    additionalProperties: false,
  };

  registerToolWithDeps(
    "ansible_navigator",
    {
      title: "Ansible Navigator",
      description:
        "Runs Ansible playbooks using ansible-navigator with smart features and provides information about available modes and options. " +
        "\n\n" +
        "**TWO MODES OF OPERATION:** " +
        "\n" +
        "**1. INFORMATION MODE (call with empty {}):** " +
        "When user asks about features, modes, or capabilities, call with {} to show comprehensive guide. " +
        "\n" +
        "Examples: " +
        "- 'what modes are available?' → Call: {} " +
        "- 'how does ansible-navigator work?' → Call: {} " +
        "- 'tell me about navigator options' → Call: {} " +
        "\n\n" +
        "**2. EXECUTION MODE (call with userMessage):** " +
        "**When user asks to RUN a playbook, ALWAYS call this tool with their message.** " +
        "\n" +
        "The tool provides smart features: " +
        "- 🔍 Auto-detects playbook files from user's message " +
        "- 🐳 Handles Podman/Docker errors automatically (retries with --ee false) " +
        "- 🔧 Environment auto-detection (PATH, venv, system) " +
        "- 📊 Clean, formatted output with configuration details " +
        "- 💡 Explains what happened and how to customize settings " +
        "\n\n" +
        "**EXECUTION EXAMPLES:** " +
        "```\n" +
        "User: 'run play1.yml'\n" +
        "→ Call: {\"userMessage\": \"run play1.yml\"}\n" +
        "\n" +
        "User: 'run play1 in minimal mode'\n" +
        "→ Call: {\"userMessage\": \"run play1 in minimal mode\", \"mode\": \"stdout\"}\n" +
        "\n" +
        "User: 'execute deploy playbook'\n" +
        "→ Call: {\"userMessage\": \"execute deploy playbook\"}\n" +
        "\n" +
        "User: 'run playbooks/site.yml without Podman'\n" +
        "→ Call: {\"userMessage\": \"run playbooks/site.yml\", \"disableExecutionEnvironment\": true}\n" +
        "\n" +
        "User: 'run using my venv at /custom/path'\n" +
        "→ Call: {\"userMessage\": \"run playbook\", \"environment\": \"/custom/path\"}\n" +
        "```\n" +
        "\n\n" +
        "**IMPORTANT:** Always pass the user's original message in userMessage. The tool extracts the playbook name and handles everything else.",
      inputSchema: navigatorInputSchema,
      annotations: {
        keywords: [
          "ansible-navigator",
          "navigator",
          "run",
          "execute",
          "playbook",
          "playbook-execution",
          "ansible-execution",
          "ansible-run",
          "yml",
          "yaml",
          // Common playbook names
          "play1",
          "play2",
          "play3",
          "deploy",
          "site",
          "main",
          "test",
          "setup",
          "config",
          "install",
        ],
        useCases: [
          "Run Ansible playbooks using ansible-navigator",
          "Execute Ansible files with ansible-navigator",
          "Debug Ansible playbook execution issues",
          "Test Ansible playbook execution",
        ],
      },
    },
    // Use the real handler directly - it has auto-detection logic built in
    createAnsibleNavigatorHandler(),
    [],
  );

  registerToolWithDeps(
    "ade_environment_info",
    {
      title: "ADE Environment Information",
      description:
        "Get comprehensive environment information including Python, Ansible, ADE, ADT status, and installed collections. " +
        "Use this tool when you need to check environment status, verify installations, inspect versions, " +
        "or troubleshoot missing dependencies.",
      annotations: {
        keywords: [
          "check environment",
          "environment status",
          "environment info",
          "verify installation",
          "check versions",
          "check installed packages",
          "python version check",
          "ansible version check",
          "ade status",
          "adt status",
          "list collections",
          "check dependencies",
          "troubleshoot environment",
          "diagnose environment",
          "inspect environment",
          "environment diagnostics",
          "what is installed",
          "show environment",
        ],
        useCases: [
          "Check if Ansible is installed",
          "Verify Python version",
          "List installed Ansible collections",
          "Check ADE/ADT installation status",
          "Troubleshoot environment issues",
          "Get comprehensive environment diagnostics",
        ],
      },
    },
    createADEEnvironmentInfoHandler(workspaceRoot),
    [], // No dependencies
  );

  registerToolWithDeps(
    "ade_setup_environment",
    {
      title: "ADE Setup Development Environment",
      description:
        "Set up a complete Ansible development environment using ADE. Creates virtual environments, installs collections, and manages dependencies. " +
        "Use this tool when you need to setup, install, configure, initialize, or create a development environment. " +
        "Automatically handles missing Ansible tools, Python environments, virtual environments, collections, and requirements.",
      annotations: {
        keywords: [
          "setup ansible environment",
          "install ansible tools",
          "configure development environment",
          "initialize ansible project",
          "create ansible environment",
          "setup dev environment",
          "create virtual environment",
          "setup venv",
          "missing ansible tools",
          "ansible tools not installed",
          "install requirements",
          "install dependencies",
          "install collections",
          "install ansible-lint",
          "install ansible-core",
          "setup python environment",
          "install via pip",
          "install via galaxy",
          "new ansible project",
          "fresh ansible setup",
          "start ansible development",
          "begin ansible project",
        ],
        useCases: [
          "Set up new Ansible development project",
          "Install missing Ansible tools and dependencies",
          "Create Python virtual environment for Ansible",
          "Install Ansible collections and requirements",
          "Fix Ansible environment issues",
          "Initialize complete Ansible development setup",
          "Install from requirements.txt",
          "Configure Python environment for Ansible",
        ],
      },
      inputSchema: {
        envName: z
          .string()
          .optional()
          .describe("Name for the virtual environment (optional)"),
        pythonVersion: z
          .string()
          .optional()
          .describe("Python version to use (e.g., '3.11', '3.12') (optional)"),
        collections: z
          .array(z.string())
          .optional()
          .describe("List of Ansible collections to install (optional)"),
        installRequirements: z
          .boolean()
          .optional()
          .describe(
            "Whether to install requirements from requirements files (optional)",
          ),
        requirementsFile: z
          .string()
          .optional()
          .describe("Path to specific requirements file (optional)"),
      },
    },
    createADESetupEnvironmentHandler(workspaceRoot),
    [], // No dependencies
  );

  registerToolWithDeps(
    "adt_check_env",
    {
      title: "ADT Check and Install Development Tools",
      description:
        "Check if ADT (ansible-dev-tools) is installed and install it if missing. " +
        "ADT provides essential Ansible development tools including ansible-lint, ansible-navigator, and ansible-builder. " +
        "Use this tool to ensure your Ansible development environment has all the necessary tools configured.",
      annotations: {
        keywords: [
          "check adt",
          "install adt",
          "ansible-dev-tools",
          "check ansible-dev-tools",
          "install ansible-dev-tools",
          "verify adt",
          "adt missing",
          "adt not installed",
          "ansible dev tools",
          "ansible development tools",
          "check development tools",
          "install development tools",
          "ansible-lint missing",
          "ansible-navigator missing",
          "ansible-builder missing",
          "install ansible tools",
        ],
        useCases: [
          "Check if ADT (ansible-dev-tools) is installed",
          "Install ansible-dev-tools package",
          "Verify ADT installation status",
          "Fix missing ADT installation",
          "Ensure Ansible development tools are available",
          "Install missing ansible-lint, ansible-navigator, or ansible-builder",
        ],
      },
    },
    createADTCheckEnvHandler(),
    [], // No dependencies
  );

  registerToolWithDeps(
    "ansible_create_playbook",
    {
      title: "Create Playbook",
      description: "Create a new Ansible playbook.",
    },
    createInitHandler("playbook"),
    [],
  );

  registerToolWithDeps(
    "ansible_create_collection",
    {
      title: "Create Collection",
      description: "Create a new Ansible collection.",
    },
    createInitHandler("collection"),
    [],
  );

  // Add custom error handling for tool calls using the underlying server
  server.server.setRequestHandler(
    CallToolRequestSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (request: any) => {
      const toolName = request.params.name;

      if (!registeredTools.has(toolName)) {
        const availableTools = Array.from(registeredTools).join(", ");
        const errorMessage = `Tool '${toolName}' not found. Available tools: ${availableTools}`;
        throw new McpError(ErrorCode.MethodNotFound, errorMessage);
      }

      // Check dependencies before executing tool
      const dependencies = toolDependencies.get(toolName) || [];
      if (dependencies.length > 0) {
        const depCheck = await checkDependencies(dependencies);
        if (!depCheck.satisfied) {
          const errorMessage = formatDependencyError(
            toolName,
            depCheck.missingDependencies,
            depCheck.versionMismatches,
          );

          // Return error as content so it's visible in the chat
          return {
            content: [
              {
                type: "text",
                text: `❌ ${errorMessage}`,
              },
            ],
          };
        }
      }

      // Execute the tool handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (server as any)._registeredTools;
      if (handlers && handlers[toolName]?.callback) {
        // Pass workspaceRoot to handlers that need it (like ansible_navigator)
        const handlerArgs = request.params.arguments || {};

        if (toolName === "ansible_navigator") {
          return await handlers[toolName].callback(handlerArgs, workspaceRoot);
        }
        return await handlers[toolName].callback(handlerArgs);
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Tool '${toolName}' handler not found`,
      );
    },
  );

  return server;
}

export async function runStdio(_workspaceRoot: string) {
  const server = createAnsibleMcpServer(_workspaceRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>(() => {
    // Intentionally empty - this keeps the process alive
  });
}
