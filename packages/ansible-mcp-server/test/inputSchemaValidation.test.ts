import { describe, it, expect, beforeEach } from "vitest";
import { createAnsibleMcpServer } from "../src/server.js";
import { z } from "zod";

/**
 * Test to verify that MCP tools can properly parse and validate input arguments
 * using Zod schemas. This test ensures compatibility between Zod and the MCP SDK.
 *
 * This is important for catching issues when Zod versions are updated, as the MCP SDK
 * relies on Zod schemas being correctly converted to JSON Schema for input validation.
 */

describe("MCP Tool InputSchema Validation", () => {
  let server: ReturnType<typeof createAnsibleMcpServer>;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    server = createAnsibleMcpServer(workspaceRoot);
  });

  /**
   * Helper to get registered tool including inputSchema
   */
  function getTool(toolName: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registeredTools = (server as any)._registeredTools;
    if (!registeredTools || !registeredTools[toolName]) {
      return null;
    }
    return registeredTools[toolName];
  }

  /**
   * Programmatically discover all tools that have an inputSchema defined.
   */
  function getToolsWithInputSchema(): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registeredTools = (server as any)._registeredTools;
    if (!registeredTools) {
      return [];
    }

    const toolsWithSchema: string[] = [];
    for (const toolName of Object.keys(registeredTools)) {
      const tool = registeredTools[toolName];
      if (tool && tool.inputSchema) {
        toolsWithSchema.push(toolName);
      }
    }
    return toolsWithSchema.sort();
  }

  /**
   * Helper to validate arguments against a Zod schema
   */
  function validateWithZodSchema(
    schema: z.ZodObject<z.ZodRawShape>,
    args: Record<string, unknown>,
  ): { success: boolean; error?: z.ZodError } {
    try {
      schema.parse(args);
      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error };
      }
      throw error;
    }
  }

  /**
   * Helper to verify that a tool has inputSchema defined
   */
  function expectToolHasInputSchema(toolName: string) {
    const tool = getTool(toolName);
    expect(tool).toBeDefined();
    expect(tool.inputSchema).toBeDefined();
  }

  /**
   * Helper to test tool validation with given arguments
   * @param toolName - Name of the tool to test
   * @param args - Arguments to validate
   * @param expectedSuccess - Whether validation should succeed
   * @param expectError - Whether to expect an error object when validation fails (default: true for invalid cases)
   */
  function testToolValidation(
    toolName: string,
    args: Record<string, unknown>,
    expectedSuccess: boolean,
    expectError = !expectedSuccess,
  ) {
    const tool = getTool(toolName);
    expect(tool).toBeDefined();
    expect(tool.inputSchema).toBeDefined();

    const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;
    const result = validateWithZodSchema(schema, args);

    expect(result.success).toBe(expectedSuccess);
    if (expectError && !expectedSuccess) {
      expect(result.error).toBeDefined();
    }
  }

  describe("ansible_lint tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      expectToolHasInputSchema("ansible_lint");
    });

    it("should parse valid arguments correctly", () => {
      testToolValidation(
        "ansible_lint",
        {
          filePath: "/path/to/playbook.yml",
          fix: false,
        },
        true,
      );
    });

    it("should parse valid arguments with optional fix parameter", () => {
      testToolValidation(
        "ansible_lint",
        {
          filePath: "/path/to/playbook.yml",
          fix: true,
        },
        true,
      );
    });

    it("should parse valid arguments without optional fix parameter", () => {
      testToolValidation(
        "ansible_lint",
        {
          filePath: "/path/to/playbook.yml",
        },
        true,
      );
    });

    it("should reject invalid arguments - missing required filePath", () => {
      testToolValidation(
        "ansible_lint",
        {
          fix: false,
        },
        false,
      );
    });

    it("should reject invalid arguments - wrong type for filePath", () => {
      testToolValidation(
        "ansible_lint",
        {
          filePath: 123, // Should be string
          fix: false,
        },
        false,
      );
    });

    it("should reject invalid arguments - wrong type for fix", () => {
      testToolValidation(
        "ansible_lint",
        {
          filePath: "/path/to/playbook.yml",
          fix: "yes", // Should be boolean
        },
        false,
      );
    });
  });

  describe("ansible_navigator tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      expectToolHasInputSchema("ansible_navigator");
    });

    it("should parse valid arguments with required userMessage", () => {
      testToolValidation(
        "ansible_navigator",
        {
          userMessage: "run playbook.yml",
        },
        true,
      );
    });

    it("should parse valid arguments with all optional parameters", () => {
      testToolValidation(
        "ansible_navigator",
        {
          userMessage: "run playbook.yml",
          filePath: "/path/to/playbook.yml",
          mode: "stdout" as const,
          environment: "auto",
          disableExecutionEnvironment: false,
        },
        true,
      );
    });

    it("should parse valid arguments with enum values", () => {
      testToolValidation(
        "ansible_navigator",
        {
          userMessage: "run playbook.yml",
          mode: "interactive" as const,
        },
        true,
      );
    });

    it("should reject invalid arguments - missing required userMessage", () => {
      testToolValidation(
        "ansible_navigator",
        {
          filePath: "/path/to/playbook.yml",
        },
        false,
      );
    });

    it("should reject invalid arguments - invalid enum value for mode", () => {
      testToolValidation(
        "ansible_navigator",
        {
          userMessage: "run playbook.yml",
          mode: "invalid_mode", // Should be "stdout" or "interactive"
        },
        false,
      );
    });
  });

  describe("ade_setup_environment tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      expectToolHasInputSchema("ade_setup_environment");
    });

    it("should parse valid arguments with all optional parameters", () => {
      testToolValidation(
        "ade_setup_environment",
        {
          envName: "test-env",
          pythonVersion: "3.11",
          collections: ["ansible.builtin", "community.general"],
          installRequirements: true,
          requirementsFile: "/path/to/requirements.txt",
        },
        true,
      );
    });

    it("should parse valid arguments with empty object (all optional)", () => {
      testToolValidation("ade_setup_environment", {}, true);
    });

    it("should reject invalid arguments - wrong type for collections", () => {
      testToolValidation(
        "ade_setup_environment",
        {
          collections: "not-an-array", // Should be array of strings
        },
        false,
      );
    });

    it("should reject invalid arguments - wrong type for installRequirements", () => {
      testToolValidation(
        "ade_setup_environment",
        {
          installRequirements: "yes", // Should be boolean
        },
        false,
      );
    });
  });

  describe("create_ansible_projects tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      expectToolHasInputSchema("create_ansible_projects");
    });

    it("should parse valid arguments with union type for projectType", () => {
      testToolValidation(
        "create_ansible_projects",
        {
          projectType: "collection" as const,
          namespace: "test_org",
          collectionName: "test_coll",
          projectDirectory: "my_collection_project",
        },
        true,
      );
    });

    it("should parse valid arguments with playbook projectType", () => {
      testToolValidation(
        "create_ansible_projects",
        {
          projectType: "playbook" as const,
          namespace: "test_org",
          collectionName: "test_coll",
          projectDirectory: "my_playbook_project",
        },
        true,
      );
    });

    it("should reject invalid arguments - invalid union value for projectType", () => {
      testToolValidation(
        "create_ansible_projects",
        {
          projectType: "invalid_type", // Should be "collection" or "playbook"
          namespace: "test_org",
          collectionName: "test_coll",
        },
        false,
      );
    });
  });

  describe("define_and_build_execution_env tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      expectToolHasInputSchema("define_and_build_execution_env");
    });

    it("should parse valid arguments with required parameters", () => {
      testToolValidation(
        "define_and_build_execution_env",
        {
          baseImage: "quay.io/fedora/fedora-minimal:41",
          tag: "my-ee:latest",
        },
        true,
      );
    });

    it("should parse valid arguments with all optional parameters", () => {
      testToolValidation(
        "define_and_build_execution_env",
        {
          baseImage: "quay.io/fedora/fedora-minimal:41",
          tag: "my-ee:latest",
          destinationPath: "/path/to/dest",
          collections: ["amazon.aws", "ansible.utils"],
          systemPackages: ["git", "vim"],
          pythonPackages: ["boto3", "requests"],
          generatedYaml: "---\nversion: 3",
        },
        true,
      );
    });

    it("should reject invalid arguments - missing required baseImage", () => {
      testToolValidation(
        "define_and_build_execution_env",
        {
          tag: "my-ee:latest",
        },
        false,
      );
    });

    it("should reject invalid arguments - missing required tag", () => {
      testToolValidation(
        "define_and_build_execution_env",
        {
          baseImage: "quay.io/fedora/fedora-minimal:41",
        },
        false,
      );
    });

    it("should reject invalid arguments - wrong type for collections array", () => {
      testToolValidation(
        "define_and_build_execution_env",
        {
          baseImage: "quay.io/fedora/fedora-minimal:41",
          tag: "my-ee:latest",
          collections: "not-an-array", // Should be array of strings
        },
        false,
      );
    });
  });

  describe("ansible_content_best_practices tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      expectToolHasInputSchema("ansible_content_best_practices");
    });

    it("should parse valid arguments with empty object (all optional)", () => {
      testToolValidation("ansible_content_best_practices", {}, true);
    });

    it("should parse valid arguments with topic parameter", () => {
      testToolValidation(
        "ansible_content_best_practices",
        {
          topic: "yaml formatting",
        },
        true,
      );
    });

    it("should parse valid arguments with different topic values", () => {
      testToolValidation(
        "ansible_content_best_practices",
        {
          topic: "naming conventions",
        },
        true,
      );
    });

    it("should reject invalid arguments - wrong type for topic", () => {
      testToolValidation(
        "ansible_content_best_practices",
        {
          topic: 123, // Should be string
        },
        false,
      );
    });
  });

  describe("Zod schema compatibility with MCP SDK", () => {
    /**
     * This test verifies that the MCP SDK can successfully convert Zod schemas to JSON Schema
     * during tool registration.
     *
     * By successfully creating the server and accessing all tools with schemas, we verify
     * that the Zod-to-JSON Schema conversion worked correctly. This also verifies that Zod
     * schemas can be properly accessed and validated. If Zod version changes break compatibility,
     * this test will catch it.
     */
    it("should successfully register tools with Zod schemas", () => {
      // By verifying all tools are registered and accessible, we confirm
      // the conversion succeeded.
      const toolsWithSchema = getToolsWithInputSchema();
      expect(toolsWithSchema.length).toBeGreaterThan(0);

      for (const toolName of toolsWithSchema) {
        const tool = getTool(toolName);
        expect(tool).toBeDefined();
        expect(tool.inputSchema).toBeDefined();

        // Verify the schema is a Zod object
        const schema = tool.inputSchema;
        expect(schema).toBeInstanceOf(z.ZodObject);

        // Verify tool has required properties
        expect(tool.handler).toBeDefined();
        expect(tool.title || tool.name).toBeDefined();
      }
    });

    /**
     * This test ensures that Zod's parse method works correctly with the schemas.
     * This is critical because the MCP SDK relies on Zod's parsing capabilities.
     *
     * IMPORTANT: This test will fail if a new tool with inputSchema is discovered but has
     * no corresponding test case.
     */
    it("should successfully parse valid arguments for all tools with inputSchema", () => {
      const toolsWithSchema = getToolsWithInputSchema();

      // Test cases with valid arguments for each tool with inputSchema
      const testCases: Array<{
        toolName: string;
        validArgs: Record<string, unknown>;
      }> = [
        {
          toolName: "ansible_lint",
          validArgs: { filePath: "/test/playbook.yml" },
        },
        {
          toolName: "ansible_navigator",
          validArgs: { userMessage: "run playbook.yml" },
        },
        {
          toolName: "ade_setup_environment",
          validArgs: {},
        },
        {
          toolName: "create_ansible_projects",
          validArgs: {
            projectType: "collection" as const,
            namespace: "test",
            collectionName: "test",
          },
        },
        {
          toolName: "define_and_build_execution_env",
          validArgs: {
            baseImage: "quay.io/fedora/fedora-minimal:41",
            tag: "test:latest",
          },
        },
        {
          toolName: "ansible_content_best_practices",
          validArgs: {},
        },
      ];

      // Ensure all discovered tools with schemas have test cases
      // This will fail if a new tool with inputSchema is added without a test case
      const testCaseToolNames = new Set(testCases.map((tc) => tc.toolName));
      const missingTestCases = toolsWithSchema.filter(
        (toolName) => !testCaseToolNames.has(toolName),
      );

      if (missingTestCases.length > 0) {
        throw new Error(
          `Tools with inputSchema are missing test cases: ${missingTestCases.join(", ")}. ` +
            `Please add test cases for these tools in the testCases array above.`,
        );
      }

      // Also ensure we don't have test cases for non-existent tools
      const testCasesForNonExistentTools = testCases.filter(
        (tc) => !toolsWithSchema.includes(tc.toolName),
      );
      if (testCasesForNonExistentTools.length > 0) {
        throw new Error(
          `Test cases exist for tools without inputSchema: ${testCasesForNonExistentTools.map((tc) => tc.toolName).join(", ")}. ` +
            `These test cases should be removed or the tools should have inputSchema added.`,
        );
      }

      // Run validation tests for all test cases
      for (const testCase of testCases) {
        testToolValidation(testCase.toolName, testCase.validArgs, true);
      }
    });
  });
});
