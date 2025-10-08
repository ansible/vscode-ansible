import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface McpServerConfig {
  command: string;
  args: string[];
  env: {
    WORKSPACE_ROOT: string;
  };
  disabled: boolean;
}

export class McpServerManager {
  private static readonly MCP_SERVER_NAME = "ansible-mcp-server";
  private static readonly CLI_PATH =
    "packages/ansible-mcp-server/out/server/src/cli.js";

  /**
   * Configure MCP server (enable only) - Legacy method for backward compatibility
   * @deprecated Use programmatic registration instead
   */
  public static async configureMcpServer(): Promise<void> {
    try {
      // Validate MCP server is available
      await this.validateMcpServer();

      console.log(
        "MCP server is ready to be used through VS Code's programmatic MCP system",
      );

      // Show success notification
      vscode.window.showInformationMessage(
        "Ansible MCP Server has been enabled successfully. The server is now available for AI assistants that support MCP.",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to configure MCP server: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Disable MCP server - Legacy method for backward compatibility
   * @deprecated Use programmatic registration instead
   */
  public static async disableMcpServer(): Promise<void> {
    try {
      console.log("MCP server has been disabled");

      vscode.window.showInformationMessage(
        "Ansible MCP Server has been disabled successfully.",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to disable MCP server: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Validate that the MCP server CLI is available and executable
   */
  private static async validateMcpServer(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error("No workspace folder found");
    }

    // Get the actual project root (where package.json is located)
    const projectRoot = this.findProjectRoot(workspaceRoot);
    const cliPath = path.join(projectRoot, this.CLI_PATH);

    if (!fs.existsSync(cliPath)) {
      throw new Error(
        `MCP server CLI not found at ${cliPath}. Please ensure the MCP server is built by running 'yarn mcp-compile' in the project root.`,
      );
    }

    // Check if the file is executable (has proper permissions)
    try {
      fs.accessSync(cliPath, fs.constants.F_OK | fs.constants.R_OK);
    } catch (error) {
      throw new Error(
        `MCP server CLI is not accessible at ${cliPath}. Please check file permissions.`,
      );
    }
  }

  /**
   * Find the project root by looking for package.json
   */
  private static findProjectRoot(startPath: string): string {
    let currentPath = startPath;

    while (currentPath !== path.dirname(currentPath)) {
      const packageJsonPath = path.join(currentPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
    }

    // If not found, return the original path
    return startPath;
  }

  /**
   * Check if MCP server is currently available
   */
  public static async isMcpServerAvailable(): Promise<boolean> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return false;
      }

      const projectRoot = this.findProjectRoot(workspaceRoot);
      const cliPath = path.join(projectRoot, this.CLI_PATH);

      if (!fs.existsSync(cliPath)) {
        return false;
      }

      // Check if the file is accessible
      try {
        fs.accessSync(cliPath, fs.constants.F_OK | fs.constants.R_OK);
        return true;
      } catch (error) {
        return false;
      }
    } catch (error) {
      console.error(`Failed to check MCP server availability: ${error}`);
      return false;
    }
  }

  /**
   * Get MCP server status information
   */
  public static async getMcpServerStatus(): Promise<{
    available: boolean;
    cliPath: string | null;
    error?: string;
  }> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return {
          available: false,
          cliPath: null,
          error: "No workspace folder found",
        };
      }

      const projectRoot = this.findProjectRoot(workspaceRoot);
      const cliPath = path.join(projectRoot, this.CLI_PATH);

      if (!fs.existsSync(cliPath)) {
        return {
          available: false,
          cliPath,
          error:
            "MCP server CLI not found. Run 'yarn mcp-compile' to build it.",
        };
      }

      // Check if the file is accessible
      try {
        fs.accessSync(cliPath, fs.constants.F_OK | fs.constants.R_OK);
        return {
          available: true,
          cliPath,
        };
      } catch (error) {
        return {
          available: false,
          cliPath,
          error: "MCP server CLI is not accessible. Check file permissions.",
        };
      }
    } catch (error) {
      return {
        available: false,
        cliPath: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
