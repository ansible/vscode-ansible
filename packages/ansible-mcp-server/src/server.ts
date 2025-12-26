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
  createDefineAndBuildExecutionEnvHandler,
  createAgentsGuidelinesHandler,
} from "./handlers.js";
import {
  checkDependencies,
  formatDependencyError,
  type Dependency,
} from "./dependencyChecker.js";
import { createProjectsHandler } from "./tools/creator.js";
import {
  getEERules,
  getExecutionEnvironmentSchema,
  getSampleExecutionEnvironment,
} from "./resources/eeSchema.js";
import { getAgentsGuidelines } from "./resources/agents.js";

export function createAnsibleMcpServer(workspaceRoot: string) {
  const server = new McpServer({
    name: "ansible-mcp-server",
    version: "0.1.0",
  });

  // Register execution environment schema as a resource
  server.registerResource(
    "execution-environment-schema",
    "schema://execution-environment",
    {
      title: "Execution Environment Schema",
      description:
        "JSON schema for Ansible execution environment definition files. " +
        "This schema validates the structure of execution-environment.yml files used with ansible-builder. " +
        "Use this schema along with the sample EE file to generate compliant EE definition files.",
      mimeType: "application/json",
    },
    async () => {
      try {
        const schema = await getExecutionEnvironmentSchema();
        return {
          contents: [
            {
              uri: "schema://execution-environment",
              mimeType: "application/json",
              text: JSON.stringify(schema, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: "schema://execution-environment",
              mimeType: "text/plain",
              text: `Error loading schema: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );

  // Register sample execution environment file as a resource
  server.registerResource(
    "execution-environment-sample",
    "sample://execution-environment",
    {
      title: "Sample Execution Environment File",
      description:
        "A sample execution-environment.yml file that demonstrates the v3 schema structure. " +
        "Use this as a reference along with the schema to understand how to structure execution environment files. " +
        "The LLM should use both the schema and this sample to generate new EE files.",
      mimeType: "text/yaml",
    },
    async () => {
      try {
        const sampleContent = await getSampleExecutionEnvironment();
        return {
          contents: [
            {
              uri: "sample://execution-environment",
              mimeType: "text/yaml",
              text: sampleContent,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: "sample://execution-environment",
              mimeType: "text/plain",
              text: `Error loading sample file: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );

  // Register ee-rules.md file as a resource
  server.registerResource(
    "execution-environment-rules",
    "rules://execution-environment",
    {
      title: "Execution Environment Rules",
      description:
        "The ee-rules.md file contains rules and guidelines for Ansible execution environment files. " +
        "Use this as a reference along with the schema to understand how to structure execution environment files. " +
        "The LLM should use both the schema and this rules file to generate new EE files.",
      mimeType: "text/markdown",
    },
    async () => {
      try {
        const rulesContent = await getEERules();
        return {
          contents: [
            {
              uri: "rules://execution-environment",
              mimeType: "text/markdown",
              text: rulesContent,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: "rules://execution-environment",
              mimeType: "text/plain",
              text: `Error loading rules file: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );

  // Register agents.md file as a resource
  server.registerResource(
    "ansible-content-best-practices",
    "guidelines://ansible-content-best-practices",
    {
      title: "Ansible Content Best Practices",
      description:
        "Comprehensive best practices and guidelines for writing Ansible content. " +
        "This document provides standards, best practices, and guidelines for creating maintainable Ansible automation. " +
        "Use this resource when generating or modifying Ansible playbooks, roles, collections, and other Ansible content. " +
        "The guidelines cover formatting, naming conventions, project structure, testing strategies, and more. " +
        "This file is packaged with the extension for offline access. " +
        "Reference this resource in prompts to provide context for writing Ansible content following best practices.",
      mimeType: "text/markdown",
    },
    async () => {
      try {
        const guidelinesContent = await getAgentsGuidelines();
        return {
          contents: [
            {
              uri: "guidelines://ansible-content-best-practices",
              mimeType: "text/markdown",
              text: guidelinesContent,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: "guidelines://ansible-content-best-practices",
              mimeType: "text/plain",
              text: `Error loading Ansible Content Best Practices: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );

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
    [],
  );

  registerToolWithDeps(
    "ansible_content_best_practices",
    {
      title: "Ansible Content Best Practices",
      description:
        "Get best practices and guidelines for writing Ansible content. " +
        "This tool returns comprehensive guidelines covering standards, best practices, and recommendations for creating maintainable Ansible automation. " +
        "Use this tool to answer questions like 'What are best practices for writing ansible content?' or 'How do I write a good playbook?'. " +
        "The tool returns the full guidelines document which can be summarized or referenced. " +
        "Once the content is in context, you can use it to write playbooks and other Ansible content following best practices.",
      annotations: {
        keywords: [
          "ansible best practices",
          "ansible content",
          "what are best practices for writing ansible content",
          "how do I write a good playbook",
          "ansible guidelines",
          "ansible standards",
          "ansible style guide",
          "ansible conventions",
          "ansible formatting",
          "ansible naming",
          "ansible project structure",
          "ansible testing",
          "ansible development",
          "write ansible playbook",
          "ansible automation guidelines",
          "ansible content guidelines",
        ],
        useCases: [
          "Get best practices for writing Ansible content",
          "Learn how to write a good Ansible playbook",
          "Understand Ansible formatting and naming conventions",
          "Learn Ansible project structure standards",
          "Reference Ansible testing strategies",
          "Follow Ansible development best practices",
          "Get guidelines for creating maintainable Ansible automation",
        ],
      },
    },
    createAgentsGuidelinesHandler(),
    [],
  );

  registerToolWithDeps(
    "list_available_tools",
    {
      title: "List Available Tools",
      description:
        "Shows all available Ansible Development Tools MCP Server tools. Use this to discover what tools you can use. " +
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
          "Discover available Ansible Development Tools MCP tools",
          "Get overview of Ansible tools",
          "Find the right Ansible tool for a task",
          "Explore Ansible tool capabilities",
          "Get help selecting Ansible tools",
        ],
      },
    },
    createListToolsHandler(() => Array.from(registeredTools)),
    [],
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
  // Using Zod schema to match other tools (required for proper MCP tool discovery)
  const navigatorInputSchema = {
    userMessage: z
      .string()
      .describe(
        "**REQUIRED:** The user's original message/prompt. Just pass it as-is (DO NOT leave empty). " +
          "The tool will parse it to extract the playbook filename. " +
          "\n" +
          "**EXAMPLES OF CORRECT USAGE:** " +
          '- User says: \'run play1.yml\' → You MUST pass: {"userMessage": "run play1.yml"} ' +
          '- User says: \'execute deploy playbook\' → You MUST pass: {"userMessage": "execute deploy playbook"} ' +
          '- User says: \'run playbooks/site.yml\' → You MUST pass: {"userMessage": "run playbooks/site.yml"} ' +
          "\n" +
          "**DO NOT call this tool with empty userMessage or {}. Always provide the user's message.**",
      ),
    filePath: z
      .string()
      .optional()
      .describe(
        "Advanced: Direct file path to the playbook. " +
          "If provided, this takes precedence over userMessage parsing. " +
          "Most of the time, just use userMessage instead.",
      ),
    mode: z
      .enum(["stdout", "interactive"])
      .optional()
      .default("stdout")
      .describe(
        "Output mode: 'stdout' (default for this tool, direct terminal output) or 'interactive' (TUI for exploration). " +
          "Only specify if user explicitly requests a different mode.",
      ),
    environment: z
      .string()
      .optional()
      .default("auto")
      .describe(
        "Environment selection: 'auto' (default, checks PATH first, then venv), 'system' (only use PATH/system), " +
          "'venv' (only use virtual environment), or a specific venv name/path (e.g., 'ansible-dev', 'venv', '/path/to/venv'). " +
          "When a specific venv name is provided, the tool searches in the workspace and parent directories.",
      ),
    disableExecutionEnvironment: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Set to `true` to disable execution environments (passes --ee false). " +
          "**Use this if you encounter Podman/Docker errors.** " +
          "When disabled, ansible-navigator will use the local Ansible installation instead of containerized execution environments.",
      ),
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
        '→ Call: {"userMessage": "run play1.yml"}\n' +
        "\n" +
        "User: 'run play1 in minimal mode'\n" +
        '→ Call: {"userMessage": "run play1 in minimal mode", "mode": "stdout"}\n' +
        "\n" +
        "User: 'execute deploy playbook'\n" +
        '→ Call: {"userMessage": "execute deploy playbook"}\n' +
        "\n" +
        "User: 'run playbooks/site.yml without Podman'\n" +
        '→ Call: {"userMessage": "run playbooks/site.yml", "disableExecutionEnvironment": true}\n' +
        "\n" +
        "User: 'run using my venv at /custom/path'\n" +
        '→ Call: {"userMessage": "run playbook", "environment": "/custom/path"}\n' +
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
    [],
  );

  registerToolWithDeps(
    "ade_setup_environment",
    {
      title: "ADE Setup Development Environment",
      description:
        "Set up a complete Ansible development environment. " +
        "CRITICAL: For Ansible collections (amazon.aws, ansible.posix, etc.), you MUST use the 'collections' parameter. " +
        "DO NOT put collection names in 'requirementsFile' - that is ONLY for pip packages. " +
        "Correct: {collections: ['amazon.aws', 'ansible.posix']}. " +
        "Wrong: {requirementsFile: 'amazon.aws'}.",
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
          .describe(
            "Name for the virtual environment directory (default: 'venv')",
          ),
        pythonVersion: z
          .string()
          .optional()
          .describe(
            "Python version to use (e.g., '3.11', '3.12'). Will auto-install if not available.",
          ),
        collections: z
          .array(z.string())
          .optional()
          .describe(
            "Ansible collections to install via ansible-galaxy. " +
              "Examples: ['amazon.aws', 'ansible.posix', 'community.general']. " +
              "Use this for any collection names like namespace.collection format.",
          ),
        installRequirements: z
          .boolean()
          .optional()
          .describe(
            "Set to true to install Python packages from requirements.txt",
          ),
        requirementsFile: z
          .string()
          .optional()
          .describe(
            "Path to pip requirements.txt file ONLY. NOT for Ansible collections! " +
              "For collections like amazon.aws, use the 'collections' parameter instead.",
          ),
      },
    },
    createADESetupEnvironmentHandler(workspaceRoot),
    [],
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
    [],
  );

  registerToolWithDeps(
    "create_ansible_projects",
    {
      title: "Create Ansible Projects",
      description:
        "Create new Ansible collection or playbook project using ansible-creator. " +
        "This tool supports both collection and playbook project types with an interactive flow. " +
        "If project type is not specified, the tool will prompt you to choose between collection or playbook. " +
        "Then it will guide you through providing the required information (collection name, path, etc.). " +
        "Use this tool to scaffold new Ansible projects with proper structure and best practices.",
      inputSchema: {
        projectType: z
          .union([z.literal("collection"), z.literal("playbook")])
          .optional()
          .describe(
            "The type of project to create: 'collection' for Ansible collections or 'playbook' for playbook projects. " +
              "If not provided, the tool will prompt you to specify this first.",
          ),
        namespace: z
          .string()
          .optional()
          .describe(
            "The collection namespace (e.g., 'test_org'). " +
              "Required for both collection and playbook projects. " +
              "Must be provided along with 'collectionName'.",
          ),
        collectionName: z
          .string()
          .optional()
          .describe(
            "The collection name (e.g., 'test_coll'). " +
              "Required for both collection and playbook projects. " +
              "For playbook projects, this is the name of the adjacent collection. " +
              "Must be provided along with 'namespace'. " +
              "The full collection name will be constructed as 'namespace.collectionName'.",
          ),
        projectDirectory: z
          .string()
          .optional()
          .describe(
            "The name of the project directory where the project will be created (e.g., 'my_playbook_proj', 'my_collection_proj'). " +
              "The directory will be created inside the workspace. " +
              "If not provided, the tool will prompt you to specify this.",
          ),
        path: z
          .string()
          .optional()
          .describe(
            "Advanced: Full destination directory path for the project. " +
              "If provided, this takes precedence over projectDirectory. " +
              "For collections, the collection will be created at <path>/ansible_collections/<namespace>/<collectionName>. " +
              "For playbooks, the project will be created at the specified path.",
          ),
      },
      annotations: {
        keywords: [
          "create ansible project",
          "create collection",
          "create playbook",
          "ansible-creator",
          "initialize ansible project",
          "new ansible collection",
          "ansible project setup",
          "scaffold ansible project",
          "scaffold collection",
          "scaffold playbook",
          "ansible project creation",
          "ansible project initialization",
        ],
        useCases: [
          "Create a new Ansible collection project",
          "Create a new Ansible playbook project",
          "Initialize Ansible project structure",
          "Scaffold Ansible content with best practices",
          "Set up new Ansible development project",
          "Create Ansible collection with proper structure",
          "Create playbook project with adjacent collection",
        ],
      },
    },
    createProjectsHandler(workspaceRoot),
    [],
  );

  registerToolWithDeps(
    "define_and_build_execution_env",
    {
      title: "Define and Build Execution Environment",
      description:
        "Create an EE definition file for building Ansible execution environment images with ansible-builder. " +
        "This tool works in two steps: (1) First call returns a prompt with rules and requirements - generate YAML from this prompt. " +
        "(2) Second call with the 'generatedYaml' parameter containing the YAML content will create and validate the file. " +
        "Use rules from ee-rules.md and validate against the execution environment schema.",
      inputSchema: {
        baseImage: z
          .string()
          .describe(
            "The base container image to use (e.g., 'quay.io/fedora/fedora-minimal:41' or 'quay.io/centos/centos:stream10')",
          ),
        tag: z
          .string()
          .describe(
            "The tag/name for the resulting execution environment image (e.g., 'my-ee:latest')",
          ),
        destinationPath: z
          .string()
          .optional()
          .describe(
            "Optional destination directory path for the execution-environment.yml file. Defaults to workspace root.",
          ),
        collections: z
          .array(z.string())
          .optional()
          .describe(
            "Optional array of Ansible collection names to include (e.g., ['amazon.aws', 'ansible.utils'])",
          ),
        systemPackages: z
          .array(z.string())
          .optional()
          .describe(
            "Optional array of system packages to install (e.g., ['git', 'vim', 'curl'])",
          ),
        pythonPackages: z
          .array(z.string())
          .optional()
          .describe(
            "Optional array of Python packages to install (e.g., ['boto3', 'requests'])",
          ),
        generatedYaml: z
          .string()
          .optional()
          .describe(
            "Internal parameter: LLM-generated YAML content. Use this when calling the tool a second time after generating the YAML from the prompt provided in the first call.",
          ),
      },
      annotations: {
        keywords: [
          "execution environment",
          "ee",
          "ansible-builder",
          "container image",
          "build ee",
          "create execution environment",
          "execution-environment.yml",
          "define execution environment",
          "ansible container",
          "ee file",
          "ansible builder",
        ],
        useCases: [
          "Create execution environment definition file",
          "Build Ansible execution environment container images",
          "Define containerized Ansible runtime",
          "Generate execution-environment.yml from inputs",
          "Set up execution environment with collections and dependencies",
          "Create custom Ansible execution environment",
        ],
      },
    },
    createDefineAndBuildExecutionEnvHandler(workspaceRoot),
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
      if (handlers && handlers[toolName]?.handler) {
        // Pass workspaceRoot to handlers that need it (like ansible_navigator)
        const handlerArgs = request.params.arguments || {};

        if (toolName === "ansible_navigator") {
          return await handlers[toolName].handler(handlerArgs, workspaceRoot);
        }
        return await handlers[toolName].handler(handlerArgs);
      }

      // Log available tools for debugging
      const availableToolNames = handlers
        ? Object.keys(handlers).join(", ")
        : "no handlers object";
      console.error(
        `[MCP] Tool '${toolName}' handler not found. Available handlers: ${availableToolNames}`,
      );

      throw new McpError(
        ErrorCode.InternalError,
        `Tool '${toolName}' handler not found. Available tools in registry: ${availableToolNames}`,
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
