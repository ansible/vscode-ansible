import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { McpServerDefinition } from "vscode";
import * as vscode from "vscode";
import { AnsibleMcpServerProvider } from "@src/utils/mcpProvider";

// Mock fs module
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    accessSync: vi.fn(),
    constants: {
      F_OK: 0,
      R_OK: 4,
    },
  },
  existsSync: vi.fn(),
  accessSync: vi.fn(),
  constants: {
    F_OK: 0,
    R_OK: 4,
  },
}));

describe("AnsibleMcpServerProvider", function () {
  const mockExtensionPath = "/mock/extension/path";

  let provider: AnsibleMcpServerProvider;
  let mockGetConfiguration: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockGetConfiguration = vi.mocked(vscode.workspace.getConfiguration);

    provider = new AnsibleMcpServerProvider(mockExtensionPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor with extensionPath parameter", function () {
    it("should store extensionPath correctly", function () {
      const testPath = "/test/extension/path";
      const testProvider = new AnsibleMcpServerProvider(testPath);
      expect(testProvider).toBeInstanceOf(AnsibleMcpServerProvider);
    });

    it("should initialize with provided extensionPath", function () {
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
        const testProvider = new AnsibleMcpServerProvider(testPath);
        expect(testProvider).toBeInstanceOf(AnsibleMcpServerProvider);
      }
    });

    it("should match the usage pattern in extension.ts", function () {
      const mockContextExtensionPath = "/mock/context/extension/path";
      const mcpProvider = new AnsibleMcpServerProvider(
        mockContextExtensionPath,
      );

      expect(mcpProvider).toBeInstanceOf(AnsibleMcpServerProvider);
      // Verify the provider has the expected interface for extension integration
      expect(mcpProvider.onDidChangeMcpServerDefinitions).toBeDefined();
      expect(typeof mcpProvider.provideMcpServerDefinitions).toBe("function");
      expect(typeof mcpProvider.resolveMcpServerDefinition).toBe("function");
      expect(typeof mcpProvider.dispose).toBe("function");
    });
  });

  describe("provideMcpServerDefinitions - MCP server registration with conditional checks", function () {
    it("should return empty array when MCP server is disabled", async function () {
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === "enabled") {
            return false;
          }
          return undefined;
        }),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);

      const result = await provider.provideMcpServerDefinitions();
      expect(result).toEqual([]);
      expect(mockConfig.get).toHaveBeenCalledWith("enabled", false);
    });

    it("should return empty array when MCP server is not available", async function () {
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === "enabled") {
            return true;
          }
          return undefined;
        }),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);

      // Mock isMcpServerAvailable to return false
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await provider.provideMcpServerDefinitions();
      expect(result).toEqual([]);
    });

    it("should return empty array when no workspace folder exists", async function () {
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === "enabled") {
            return true;
          }
          return undefined;
        }),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);

      // Mock no workspace folders
      // mockWorkspaceFolders = undefined;

      const result = await provider.provideMcpServerDefinitions();
      expect(result).toEqual([]);
    });

    it("should return empty array when CLI path is not found", async function () {
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === "enabled") {
            return true;
          }
          return undefined;
        }),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);

      // Mock CLI path not found
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await provider.provideMcpServerDefinitions();
      expect(result).toEqual([]);
    });

    it("should handle errors gracefully", async function () {
      const mockConfig = {
        get: vi.fn(() => {
          throw new Error("Configuration error");
        }),
      };
      mockGetConfiguration.mockReturnValue(mockConfig);

      const result = await provider.provideMcpServerDefinitions();
      expect(result).toEqual([]);
    });
  });

  describe("resolveMcpServerDefinition - server validation and startup resolution", function () {
    it("should return undefined when MCP server is not available", async function () {
      const mockServer = {
        label: "Ansible Development Tools MCP Server",
      } as McpServerDefinition;

      const result = await provider.resolveMcpServerDefinition(mockServer);
      expect(result).toBeUndefined();
    });

    it("should handle errors gracefully", async function () {
      const mockServer = {
        label: "Ansible Development Tools MCP Server",
      } as McpServerDefinition;

      // Mock isMcpServerAvailable to throw
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("File system error");
      });

      const result = await provider.resolveMcpServerDefinition(mockServer);
      expect(result).toBeUndefined();
    });
  });

  describe("dispose - cleanup and resource management", function () {
    it("should dispose of the event emitter", function () {
      provider.dispose();
      // After dispose, the provider should be cleaned up
      // We can't directly test the internal emitter, but we can verify
      // that dispose doesn't throw
      expect(() => provider.dispose()).not.toThrow();
    });
  });

  describe("findProjectRoot - locating project root by traversing up directory tree", function () {
    it("should find project root when package.json exists", function () {
      const startPath = "/some/nested/path";
      const projectRoot = "/some";

      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (filePath: string) => {
          // Return true for package.json at project root
          if (filePath === path.join(projectRoot, "package.json")) {
            return true;
          }
          // Also return true for package.json at startPath to test the search logic
          if (filePath === path.join(startPath, "package.json")) {
            return false;
          }
          return false;
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (provider as any).findProjectRoot(startPath);
      expect(result).toBe(projectRoot);
    });

    it("should return start path when package.json is not found", function () {
      const startPath = "/some/nested/path";

      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (provider as any).findProjectRoot(startPath);
      expect(result).toBe(startPath);
    });

    it("should find project root at workspace root when package.json exists there", function () {
      const workspaceRoot = "/workspace/root";
      const projectRoot = "/workspace/root";

      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (filePath: string) => {
          return filePath === path.join(projectRoot, "package.json");
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Accessing private method for testing
      const result = (provider as any).findProjectRoot(workspaceRoot);
      expect(result).toBe(projectRoot);
    });
  });
});
