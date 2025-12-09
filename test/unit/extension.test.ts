import { describe, it, expect } from "vitest";
import { AnsibleMcpServerProvider } from "../../src/utils/mcpProvider";

/**
 * Tests for extension.ts MCP provider integration
 *
 * These tests verify that the AnsibleMcpServerProvider is correctly
 * instantiated with the extensionPath parameter.
 */
describe("Extension Activation - MCP Provider Integration", function () {
  describe("AnsibleMcpServerProvider constructor with extensionPath", function () {
    it("should accept extensionPath as constructor parameter", function () {
      // This test verifies the constructor signature change from PR #2363
      // Before: new AnsibleMcpServerProvider()
      // After: new AnsibleMcpServerProvider(context.extensionPath)
      const mockExtensionPath = "/test/extension/path";
      const provider = new AnsibleMcpServerProvider(mockExtensionPath);

      expect(provider).toBeInstanceOf(AnsibleMcpServerProvider);
    });

    it("should handle different extension path formats", function () {
      const testPaths = [
        "/path/to/extension",
        "/another/path",
        "C:\\Windows\\Path\\To\\Extension",
        "/usr/local/share/vscode/extensions/ansible.ansible",
      ];

      for (const testPath of testPaths) {
        const provider = new AnsibleMcpServerProvider(testPath);
        expect(provider).toBeInstanceOf(AnsibleMcpServerProvider);
      }
    });

    it("should store extensionPath for use in findCliPath", function () {
      // The extensionPath is used internally to resolve the CLI path
      // This test ensures the provider can be created with a path
      const mockExtensionPath = "/test/extension/path";
      const provider = new AnsibleMcpServerProvider(mockExtensionPath);

      // Verify provider is created successfully
      expect(provider).toBeDefined();
      expect(provider.onDidChangeMcpServerDefinitions).toBeDefined();
    });

    it("should match the usage pattern in extension.ts line 672", function () {
      // This test documents the expected usage pattern:
      // const mcpProvider = new AnsibleMcpServerProvider(context.extensionPath);
      const mockContextExtensionPath = "/mock/context/extension/path";
      const mcpProvider = new AnsibleMcpServerProvider(
        mockContextExtensionPath,
      );

      expect(mcpProvider).toBeInstanceOf(AnsibleMcpServerProvider);
      // Verify the provider has the expected interface
      expect(mcpProvider.onDidChangeMcpServerDefinitions).toBeDefined();
      expect(typeof mcpProvider.provideMcpServerDefinitions).toBe("function");
      expect(typeof mcpProvider.resolveMcpServerDefinition).toBe("function");
      expect(typeof mcpProvider.dispose).toBe("function");
    });
  });
});
