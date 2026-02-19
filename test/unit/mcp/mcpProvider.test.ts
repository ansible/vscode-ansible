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
    statSync: vi.fn(),
    accessSync: vi.fn(),
    constants: {
      F_OK: 0,
      R_OK: 4,
    },
  },
  existsSync: vi.fn(),
  statSync: vi.fn(),
  accessSync: vi.fn(),
  constants: {
    F_OK: 0,
    R_OK: 4,
  },
}));

// Mock node:module for createRequire
const mockRequireResolve = vi.fn();
vi.mock("node:module", () => ({
  createRequire: vi.fn(() => ({
    resolve: mockRequireResolve,
  })),
}));

describe("AnsibleMcpServerProvider", function () {
  const mockExtensionPath = "/mock/extension/path";

  let provider: AnsibleMcpServerProvider;
  let mockGetConfiguration: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockGetConfiguration = vi.mocked(vscode.workspace.getConfiguration);

    // Reset the require.resolve mock
    mockRequireResolve.mockReset();

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

  describe("findCliPath - CLI discovery via module resolution", function () {
    it("should find CLI via module resolution", function () {
      const resolvedServerPath =
        "/mock/extension/path/node_modules/@ansible/ansible-mcp-server/out/server/src/server.js";
      const expectedCliPath =
        "/mock/extension/path/node_modules/@ansible/ansible-mcp-server/out/server/src/cli.js";

      // Mock require.resolve to return the server module path
      mockRequireResolve.mockReturnValue(resolvedServerPath);

      // Mock fs to verify CLI exists
      vi.mocked(fs.existsSync).mockImplementation(
        (filePath) => filePath.toString() === expectedCliPath,
      );
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (provider as any).findCliPath();
      expect(result).toBe(expectedCliPath);
      expect(mockRequireResolve).toHaveBeenCalledWith(
        "@ansible/ansible-mcp-server",
      );
    });

    it("should return null when package cannot be resolved", function () {
      // Mock require.resolve to throw (package not found)
      mockRequireResolve.mockImplementation(() => {
        throw new Error("Cannot find module '@ansible/ansible-mcp-server'");
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (provider as any).findCliPath();
      expect(result).toBeNull();
    });

    it("should return null when CLI file does not exist at resolved path", function () {
      const resolvedServerPath =
        "/mock/extension/path/node_modules/@ansible/ansible-mcp-server/out/server/src/server.js";

      mockRequireResolve.mockReturnValue(resolvedServerPath);

      // CLI file doesn't exist
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (provider as any).findCliPath();
      expect(result).toBeNull();
    });

    it("should handle statSync errors gracefully", function () {
      const resolvedServerPath =
        "/mock/extension/path/node_modules/@ansible/ansible-mcp-server/out/server/src/server.js";
      const expectedCliPath =
        "/mock/extension/path/node_modules/@ansible/ansible-mcp-server/out/server/src/cli.js";

      mockRequireResolve.mockReturnValue(resolvedServerPath);
      vi.mocked(fs.existsSync).mockImplementation(
        (filePath) => filePath.toString() === expectedCliPath,
      );
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (provider as any).findCliPath();
      expect(result).toBeNull();
    });

    it("should return null when resolved file is not a file", function () {
      const resolvedServerPath =
        "/mock/extension/path/node_modules/@ansible/ansible-mcp-server/out/server/src/server.js";
      const expectedCliPath =
        "/mock/extension/path/node_modules/@ansible/ansible-mcp-server/out/server/src/cli.js";

      mockRequireResolve.mockReturnValue(resolvedServerPath);
      vi.mocked(fs.existsSync).mockImplementation(
        (filePath) => filePath.toString() === expectedCliPath,
      );
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => false, // It's a directory, not a file
      } as fs.Stats);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (provider as any).findCliPath();
      expect(result).toBeNull();
    });
  });
});
