import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AnsibleMcpServerProvider } from "../../../src/utils/mcpProvider";

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
  // Make workspaceRoot a subdirectory of projectRoot so findProjectRoot can traverse up
  const mockProjectRoot = "/mock/project/root";
  const mockWorkspaceRoot = path.join(mockProjectRoot, "workspace");
  const mockPackagedCliPath = path.join(
    mockExtensionPath,
    "out/mcp/cli.js",
  );
  const mockDevCliPath = path.join(
    mockProjectRoot,
    "packages/ansible-mcp-server/out/server/src/cli.js",
  );

  let provider: AnsibleMcpServerProvider;
  let mockGetConfiguration: ReturnType<typeof vi.fn>;
  let mockWorkspaceFolders: vscode.WorkspaceFolder[] | undefined;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockGetConfiguration = vi.fn();
    mockWorkspaceFolders = [
      {
        uri: { fsPath: mockWorkspaceRoot } as vscode.Uri,
        name: "test-workspace",
        index: 0,
      },
    ];

    // Mock vscode.workspace
    (vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>) =
      mockGetConfiguration;
    (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[] | undefined) =
      mockWorkspaceFolders;

    // Mock fs.existsSync to return false by default
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (fs.accessSync as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    provider = new AnsibleMcpServerProvider(mockExtensionPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", function () {
    it("should store extensionPath correctly", function () {
      const testPath = "/test/extension/path";
      const testProvider = new AnsibleMcpServerProvider(testPath);
      expect(testProvider).toBeInstanceOf(AnsibleMcpServerProvider);
    });

    it("should initialize with provided extensionPath", function () {
      expect(provider).toBeInstanceOf(AnsibleMcpServerProvider);
    });
  });

  describe("findCliPath", function () {
    let consoleLogSpy: ReturnType<typeof vi.spyOn> | null = null;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      if (consoleLogSpy) {
        consoleLogSpy.mockRestore();
        consoleLogSpy = null;
      }
      if (consoleErrorSpy) {
        consoleErrorSpy.mockRestore();
        consoleErrorSpy = null;
      }
    });

    it("should find CLI at packaged path when it exists", function () {
      // Mock packaged path exists
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (filePath: string) => {
          return filePath === mockPackagedCliPath;
        },
      );

      const result = (provider as any).findCliPath();
      
      expect(result).toBe(mockPackagedCliPath);
      expect(consoleLogSpy!).toHaveBeenCalledWith(
        `Found MCP server CLI at packaged path: ${mockPackagedCliPath}`,
      );
      expect(consoleErrorSpy!).not.toHaveBeenCalled();
    });

    it("should find CLI at development path when packaged path doesn't exist", function () {
      // Mock packaged path doesn't exist, but dev path does
      // findProjectRoot traverses up from workspaceRoot, so we need to mock that
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (filePath: string) => {
          if (filePath === mockPackagedCliPath) {
            return false;
          }
          if (filePath === mockDevCliPath) {
            return true;
          }
          // Mock package.json exists at project root (findProjectRoot will traverse up from workspaceRoot)
          if (filePath === path.join(mockProjectRoot, "package.json")) {
            return true;
          }
          // Return false for intermediate paths during traversal
          if (filePath === path.join(mockWorkspaceRoot, "package.json")) {
            return false; // workspace root doesn't have package.json
          }
          return false;
        },
      );

      // Ensure workspace folders are set
      (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[] | undefined) =
        mockWorkspaceFolders;

      const result = (provider as any).findCliPath();
      
      expect(result).toBe(mockDevCliPath);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `Found MCP server CLI at development path: ${mockDevCliPath}`,
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should return undefined when neither path exists (no workspace)", function () {
      // Mock both paths don't exist
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      
      // Clear workspace folders to simulate no workspace scenario
      (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[] | undefined) =
        undefined;

      const result = (provider as any).findCliPath();
      
      expect(result).toBeUndefined();
      expect(consoleErrorSpy!).toHaveBeenCalledWith(
        `MCP server CLI not found at either location:\n  - Packaged: ${mockPackagedCliPath}\n  - Development: N/A`,
      );
    });

    it("should return undefined and log error when neither path exists (with workspace)", function () {
      // Mock both paths don't exist, but workspace exists
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (filePath: string) => {
          // Return false for both CLI paths
          if (filePath === mockPackagedCliPath || filePath === mockDevCliPath) {
            return false;
          }
          // But allow package.json to exist so findProjectRoot works
          if (filePath === path.join(mockProjectRoot, "package.json")) {
            return true;
          }
          // Return false for workspace package.json during traversal
          if (filePath === path.join(mockWorkspaceRoot, "package.json")) {
            return false;
          }
          return false;
        },
      );
      
      // Ensure workspace folders are set
      (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[] | undefined) =
        mockWorkspaceFolders;

      const result = (provider as any).findCliPath();
      
      expect(result).toBeUndefined();
      // Should log error with both paths (packaged and development)
      // The devPath will be calculated from projectRoot (via findProjectRoot)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`MCP server CLI not found at either location:`),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`- Packaged: ${mockPackagedCliPath}`),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`- Development: ${mockDevCliPath}`),
      );
    });

    it("should prioritize packaged path over development path", function () {
      // Mock both paths exist
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (filePath: string) => {
          return (
            filePath === mockPackagedCliPath || filePath === mockDevCliPath
          );
        },
      );

      const result = (provider as any).findCliPath();
      
      expect(result).toBe(mockPackagedCliPath);
      // Should log packaged path, not dev path
      expect(consoleLogSpy!).toHaveBeenCalledWith(
        `Found MCP server CLI at packaged path: ${mockPackagedCliPath}`,
      );
      expect(consoleLogSpy!).not.toHaveBeenCalledWith(
        expect.stringContaining("development path"),
      );
    });

    it("should check packaged path before development path", function () {
      // Track the order of existsSync calls
      const callOrder: string[] = [];
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (filePath: string) => {
          callOrder.push(filePath);
          return filePath === mockPackagedCliPath;
        },
      );

      const result = (provider as any).findCliPath();
      
      expect(result).toBe(mockPackagedCliPath);
      // Verify packaged path is checked first
      expect(callOrder[0]).toBe(mockPackagedCliPath);
    });

    it("should use extensionPath for packaged path resolution", function () {
      const customExtensionPath = "/custom/extension/path";
      const customProvider = new AnsibleMcpServerProvider(customExtensionPath);
      const expectedPackagedPath = path.join(
        customExtensionPath,
        "out/mcp/cli.js",
      );

      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (filePath: string) => {
          return filePath === expectedPackagedPath;
        },
      );

      const result = (customProvider as any).findCliPath();
      
      expect(result).toBe(expectedPackagedPath);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `Found MCP server CLI at packaged path: ${expectedPackagedPath}`,
      );
    });
  });

  describe("isMcpServerAvailable", function () {
    it("should return true when CLI path exists and is accessible", async function () {
      // Mock findCliPath to return a path
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.accessSync as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = await (provider as any).isMcpServerAvailable();
      expect(result).toBe(true);
    });

    it("should return false when CLI path doesn't exist", async function () {
      // Mock findCliPath to return undefined
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await (provider as any).isMcpServerAvailable();
      expect(result).toBe(false);
    });

    it("should return false when CLI path exists but is not accessible", async function () {
      // Mock findCliPath to return a path but accessSync throws
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.accessSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const result = await (provider as any).isMcpServerAvailable();
      expect(result).toBe(false);
    });
  });

  describe("provideMcpServerDefinitions", function () {
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
      (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[] | undefined) =
        undefined;

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

  describe("resolveMcpServerDefinition", function () {
    it("should return undefined when MCP server is not available", async function () {
      const mockServer = {
        label: "Ansible Developer Tools MCP Server",
      } as vscode.McpServerDefinition;

      // Mock isMcpServerAvailable to return false
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await provider.resolveMcpServerDefinition(mockServer);
      expect(result).toBeUndefined();
    });

    it("should return server when it is available and matches our server", async function () {
      const mockServer = {
        label: "Ansible Developer Tools MCP Server",
      } as vscode.McpServerDefinition;

      // Mock isMcpServerAvailable to return true
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.accessSync as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = await provider.resolveMcpServerDefinition(mockServer);
      expect(result).toBe(mockServer);
    });

    it("should return server when label doesn't match our server", async function () {
      const mockServer = {
        label: "Other MCP Server",
      } as vscode.McpServerDefinition;

      // Mock isMcpServerAvailable to return true
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.accessSync as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = await provider.resolveMcpServerDefinition(mockServer);
      expect(result).toBe(mockServer);
    });

    it("should handle errors gracefully", async function () {
      const mockServer = {
        label: "Ansible Developer Tools MCP Server",
      } as vscode.McpServerDefinition;

      // Mock isMcpServerAvailable to throw
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("File system error");
      });

      const result = await provider.resolveMcpServerDefinition(mockServer);
      expect(result).toBeUndefined();
    });
  });

  // TODO: Fix refresh test - EventEmitter mock needs to be properly configured
  // describe("refresh", function () {
  //   it("should fire didChange event", function () {
  //     let eventFired = false;
  //     
  //     // Register the event listener directly using the event property
  //     const disposable = provider.onDidChangeMcpServerDefinitions(() => {
  //       eventFired = true;
  //     });

  //     // Verify the event listener was registered
  //     expect(disposable).toBeDefined();
  //     expect(typeof disposable.dispose).toBe("function");
  //     
  //     // Call refresh which should fire the event
  //     provider.refresh();
  //     expect(eventFired).toBe(true);
  //     
  //     // Clean up
  //     disposable.dispose();
  //   });
  // });

  describe("dispose", function () {
    it("should dispose of the event emitter", function () {
      provider.dispose();
      // After dispose, the provider should be cleaned up
      // We can't directly test the internal emitter, but we can verify
      // that dispose doesn't throw
      expect(() => provider.dispose()).not.toThrow();
    });
  });

  describe("findProjectRoot", function () {
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

      const result = (provider as any).findProjectRoot(startPath);
      expect(result).toBe(projectRoot);
    });

    it("should return start path when package.json is not found", function () {
      const startPath = "/some/nested/path";

      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

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

      const result = (provider as any).findProjectRoot(workspaceRoot);
      expect(result).toBe(projectRoot);
    });
  });
});
