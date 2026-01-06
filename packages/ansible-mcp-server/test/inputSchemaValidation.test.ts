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

  describe("ansible_lint tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      const tool = getTool("ansible_lint");
      expect(tool).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    });

    it("should parse valid arguments correctly", () => {
      const tool = getTool("ansible_lint");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        filePath: "/path/to/playbook.yml",
        fix: false,
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should parse valid arguments with optional fix parameter", () => {
      const tool = getTool("ansible_lint");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        filePath: "/path/to/playbook.yml",
        fix: true,
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should parse valid arguments without optional fix parameter", () => {
      const tool = getTool("ansible_lint");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        filePath: "/path/to/playbook.yml",
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should reject invalid arguments - missing required filePath", () => {
      const tool = getTool("ansible_lint");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        fix: false,
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject invalid arguments - wrong type for filePath", () => {
      const tool = getTool("ansible_lint");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        filePath: 123, // Should be string
        fix: false,
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject invalid arguments - wrong type for fix", () => {
      const tool = getTool("ansible_lint");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        filePath: "/path/to/playbook.yml",
        fix: "yes", // Should be boolean
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("ansible_navigator tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      const tool = getTool("ansible_navigator");
      expect(tool).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    });

    it("should parse valid arguments with required userMessage", () => {
      const tool = getTool("ansible_navigator");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        userMessage: "run playbook.yml",
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should parse valid arguments with all optional parameters", () => {
      const tool = getTool("ansible_navigator");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        userMessage: "run playbook.yml",
        filePath: "/path/to/playbook.yml",
        mode: "stdout" as const,
        environment: "auto",
        disableExecutionEnvironment: false,
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should parse valid arguments with enum values", () => {
      const tool = getTool("ansible_navigator");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        userMessage: "run playbook.yml",
        mode: "interactive" as const,
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should reject invalid arguments - missing required userMessage", () => {
      const tool = getTool("ansible_navigator");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        filePath: "/path/to/playbook.yml",
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject invalid arguments - invalid enum value for mode", () => {
      const tool = getTool("ansible_navigator");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        userMessage: "run playbook.yml",
        mode: "invalid_mode", // Should be "stdout" or "interactive"
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("ade_setup_environment tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      const tool = getTool("ade_setup_environment");
      expect(tool).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    });

    it("should parse valid arguments with all optional parameters", () => {
      const tool = getTool("ade_setup_environment");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        envName: "test-env",
        pythonVersion: "3.11",
        collections: ["ansible.builtin", "community.general"],
        installRequirements: true,
        requirementsFile: "/path/to/requirements.txt",
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should parse valid arguments with empty object (all optional)", () => {
      const tool = getTool("ade_setup_environment");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {};

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should reject invalid arguments - wrong type for collections", () => {
      const tool = getTool("ade_setup_environment");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        collections: "not-an-array", // Should be array of strings
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject invalid arguments - wrong type for installRequirements", () => {
      const tool = getTool("ade_setup_environment");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        installRequirements: "yes", // Should be boolean
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("create_ansible_projects tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      const tool = getTool("create_ansible_projects");
      expect(tool).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    });

    it("should parse valid arguments with union type for projectType", () => {
      const tool = getTool("create_ansible_projects");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        projectType: "collection" as const,
        namespace: "test_org",
        collectionName: "test_coll",
        projectDirectory: "my_collection_project",
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should parse valid arguments with playbook projectType", () => {
      const tool = getTool("create_ansible_projects");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        projectType: "playbook" as const,
        namespace: "test_org",
        collectionName: "test_coll",
        projectDirectory: "my_playbook_project",
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should reject invalid arguments - invalid union value for projectType", () => {
      const tool = getTool("create_ansible_projects");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        projectType: "invalid_type", // Should be "collection" or "playbook"
        namespace: "test_org",
        collectionName: "test_coll",
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("define_and_build_execution_env tool inputSchema", () => {
    it("should have inputSchema defined", () => {
      const tool = getTool("define_and_build_execution_env");
      expect(tool).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    });

    it("should parse valid arguments with required parameters", () => {
      const tool = getTool("define_and_build_execution_env");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        baseImage: "quay.io/fedora/fedora-minimal:41",
        tag: "my-ee:latest",
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should parse valid arguments with all optional parameters", () => {
      const tool = getTool("define_and_build_execution_env");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const validArgs = {
        baseImage: "quay.io/fedora/fedora-minimal:41",
        tag: "my-ee:latest",
        destinationPath: "/path/to/dest",
        collections: ["amazon.aws", "ansible.utils"],
        systemPackages: ["git", "vim"],
        pythonPackages: ["boto3", "requests"],
        generatedYaml: "---\nversion: 3",
      };

      const result = validateWithZodSchema(schema, validArgs);
      expect(result.success).toBe(true);
    });

    it("should reject invalid arguments - missing required baseImage", () => {
      const tool = getTool("define_and_build_execution_env");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        tag: "my-ee:latest",
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject invalid arguments - missing required tag", () => {
      const tool = getTool("define_and_build_execution_env");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        baseImage: "quay.io/fedora/fedora-minimal:41",
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject invalid arguments - wrong type for collections array", () => {
      const tool = getTool("define_and_build_execution_env");
      const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

      const invalidArgs = {
        baseImage: "quay.io/fedora/fedora-minimal:41",
        tag: "my-ee:latest",
        collections: "not-an-array", // Should be array of strings
      };

      const result = validateWithZodSchema(schema, invalidArgs);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Zod schema compatibility with MCP SDK", () => {
    /**
     * This test verifies that Zod schemas can be properly accessed and validated.
     * If Zod version changes break compatibility, this test will catch it.
     */
    it("should be able to access and validate all tool schemas", () => {
      const toolsWithSchema = [
        "ansible_lint",
        "ansible_navigator",
        "ade_setup_environment",
        "create_ansible_projects",
        "define_and_build_execution_env",
      ];

      for (const toolName of toolsWithSchema) {
        const tool = getTool(toolName);
        expect(tool).toBeDefined();
        expect(tool.inputSchema).toBeDefined();

        // Verify the schema is a Zod object
        const schema = tool.inputSchema;
        expect(schema).toBeInstanceOf(z.ZodObject);
      }
    });

    /**
     * This test verifies that the MCP SDK can successfully convert Zod schemas to JSON Schema
     * during tool registration.
     *
     * By successfully creating the server and accessing all tools with schemas, we verify
     * that the Zod-to-JSON Schema conversion worked correctly.
     */
    it("should successfully register tools with Zod schemas", () => {
      const toolsWithSchema = [
        "ansible_lint",
        "ansible_navigator",
        "ade_setup_environment",
        "create_ansible_projects",
        "define_and_build_execution_env",
      ];

      // By verifying all tools are registered and accessible, we confirm
      // the conversion succeeded.
      for (const toolName of toolsWithSchema) {
        const tool = getTool(toolName);
        expect(tool).toBeDefined();
        expect(tool.inputSchema).toBeDefined();

        // Verify the schema is still a Zod object
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
     */
    it("should successfully parse valid arguments for all tools with inputSchema", () => {
      const testCases = [
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
      ];

      for (const testCase of testCases) {
        const tool = getTool(testCase.toolName);
        const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

        const result = validateWithZodSchema(schema, testCase.validArgs);
        expect(result.success).toBe(true);
      }
    });
  });
});
