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
   * Configure MCP server (enable only)
   */
  public static async configureMcpServer(): Promise<void> {
    try {
      // Validate MCP server is available
      await this.validateMcpServer();

      // Create MCP configuration files for AI assistants to discover
      await this.createMcpConfigurationFiles();

      console.log(
        "MCP server is ready to be used through VS Code's MCP system",
      );

      // Show success notification
      vscode.window
        .showInformationMessage(
          "Ansible MCP Server has been enabled successfully. The server is now available for AI assistants that support MCP.",
          "Open Settings",
        )
        .then((selection) => {
          if (selection === "Open Settings") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "ansible.mcpServer",
            );
          }
        });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to configure MCP server: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Disable MCP server
   */
  public static async disableMcpServer(): Promise<void> {
    try {
      // Remove MCP configuration files
      await this.removeMcpConfigurationFiles();

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
   * Create MCP configuration files for AI assistants to discover
   */
  private static async createMcpConfigurationFiles(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error("No workspace folder found");
    }

    const projectRoot = this.findProjectRoot(workspaceRoot);
    const config = this.getMcpServerConfig();
    if (!config) {
      throw new Error("MCP server configuration not available");
    }

    // Create workspace MCP configuration
    await this.createWorkspaceMcpConfig(projectRoot, config);

    // Create global MCP configuration for AI assistants to discover
    await this.createGlobalMcpConfig(config);
  }

  /**
   * Remove MCP configuration files
   */
  private static async removeMcpConfigurationFiles(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return;
    }

    const projectRoot = this.findProjectRoot(workspaceRoot);

    // Remove workspace MCP configuration
    await this.removeWorkspaceMcpConfig(projectRoot);

    // Remove global MCP configuration
    await this.removeGlobalMcpConfig();
  }

  /**
   * Create workspace MCP configuration
   */
  private static async createWorkspaceMcpConfig(
    projectRoot: string,
    config: McpServerConfig,
  ): Promise<void> {
    const mcpJsonPath = path.join(projectRoot, "mcp.json");

    try {
      let mcpConfig: any = {};

      // Read existing configuration if it exists
      if (fs.existsSync(mcpJsonPath)) {
        const existingContent = fs.readFileSync(mcpJsonPath, "utf8");
        mcpConfig = JSON.parse(existingContent);
      }

      // Initialize mcpServers object if it doesn't exist
      if (!mcpConfig.mcpServers) {
        mcpConfig.mcpServers = {};
      }

      // Add our MCP server configuration
      mcpConfig.mcpServers[this.MCP_SERVER_NAME] = config;

      // Write updated configuration
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));

      console.log(`Workspace MCP configuration created: ${mcpJsonPath}`);
    } catch (error) {
      console.error(`Failed to create workspace MCP configuration: ${error}`);
      throw error;
    }
  }

  /**
   * Create global MCP configuration for supported editors
   */
  private static async createGlobalMcpConfig(
    config: McpServerConfig,
  ): Promise<void> {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      console.warn(
        "Could not determine home directory for global MCP configuration",
      );
      return;
    }

    // Create MCP configuration for different editors
    const editorConfigs = this.getEditorConfigPaths(homeDir);

    for (const editorConfig of editorConfigs) {
      try {
        await this.createEditorMcpConfig(editorConfig, config);
      } catch (error) {
        console.warn(
          `Failed to create MCP configuration for ${editorConfig.name}: ${error}`,
        );
        // Continue with other editors even if one fails
      }
    }
  }

  /**
   * Get editor configuration paths
   */
  private static getEditorConfigPaths(
    homeDir: string,
  ): Array<{ name: string; path: string }> {
    const configs = [];

    // Cursor (primary location)
    configs.push({
      name: "Cursor",
      path: path.join(homeDir, ".cursor", "mcp.json"),
    });

    // Cursor (alternative location)
    configs.push({
      name: "Cursor (config)",
      path: path.join(homeDir, ".config", "cursor", "mcp.json"),
    });

    // Note: VS Code global MCP configuration is not needed as VS Code extensions handle MCP differently

    return configs;
  }

  /**
   * Create MCP configuration for a specific editor
   */
  private static async createEditorMcpConfig(
    editorConfig: { name: string; path: string },
    config: McpServerConfig,
  ): Promise<void> {
    try {
      let globalConfig: any = {};

      // Read existing global configuration if it exists
      if (fs.existsSync(editorConfig.path)) {
        const existingContent = fs.readFileSync(editorConfig.path, "utf8");
        globalConfig = JSON.parse(existingContent);
      }

      if (!globalConfig.mcpServers) {
        globalConfig.mcpServers = {};
      }

      // Add our MCP server configuration
      globalConfig.mcpServers[this.MCP_SERVER_NAME] = config;

      // Ensure editor config directory exists
      const editorDir = path.dirname(editorConfig.path);
      if (!fs.existsSync(editorDir)) {
        fs.mkdirSync(editorDir, { recursive: true });
      }

      // Write updated global configuration
      fs.writeFileSync(
        editorConfig.path,
        JSON.stringify(globalConfig, null, 2),
      );

      console.log(
        `Global MCP configuration created for ${editorConfig.name}: ${editorConfig.path}`,
      );
    } catch (error) {
      console.error(
        `Failed to create global MCP configuration for ${editorConfig.name}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Remove workspace MCP configuration
   */
  private static async removeWorkspaceMcpConfig(
    projectRoot: string,
  ): Promise<void> {
    const mcpJsonPath = path.join(projectRoot, "mcp.json");

    try {
      if (!fs.existsSync(mcpJsonPath)) {
        return;
      }

      let mcpConfig: any = {};
      const existingContent = fs.readFileSync(mcpJsonPath, "utf8");
      mcpConfig = JSON.parse(existingContent);

      if (mcpConfig.mcpServers && mcpConfig.mcpServers[this.MCP_SERVER_NAME]) {
        delete mcpConfig.mcpServers[this.MCP_SERVER_NAME];

        // If no other servers, remove the file
        if (Object.keys(mcpConfig.mcpServers).length === 0) {
          fs.unlinkSync(mcpJsonPath);
          console.log(`Removed workspace MCP configuration: ${mcpJsonPath}`);
        } else {
          fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
          console.log(`Updated workspace MCP configuration: ${mcpJsonPath}`);
        }
      }
    } catch (error) {
      console.error(`Failed to remove workspace MCP configuration: ${error}`);
    }
  }

  /**
   * Remove global MCP configuration
   */
  private static async removeGlobalMcpConfig(): Promise<void> {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      return;
    }

    const editorConfigs = this.getEditorConfigPaths(homeDir);

    for (const editorConfig of editorConfigs) {
      try {
        await this.removeEditorMcpConfig(editorConfig);
      } catch (error) {
        console.warn(
          `Failed to remove MCP configuration for ${editorConfig.name}: ${error}`,
        );
      }
    }
  }

  /**
   * Remove MCP configuration for a specific editor
   */
  private static async removeEditorMcpConfig(editorConfig: {
    name: string;
    path: string;
  }): Promise<void> {
    try {
      if (!fs.existsSync(editorConfig.path)) {
        return;
      }

      let globalConfig: any = {};
      const existingContent = fs.readFileSync(editorConfig.path, "utf8");
      globalConfig = JSON.parse(existingContent);

      if (
        globalConfig.mcpServers &&
        globalConfig.mcpServers[this.MCP_SERVER_NAME]
      ) {
        delete globalConfig.mcpServers[this.MCP_SERVER_NAME];

        // If no other servers, remove the file
        if (Object.keys(globalConfig.mcpServers).length === 0) {
          fs.unlinkSync(editorConfig.path);
          console.log(
            `Removed global MCP configuration for ${editorConfig.name}: ${editorConfig.path}`,
          );
        } else {
          fs.writeFileSync(
            editorConfig.path,
            JSON.stringify(globalConfig, null, 2),
          );
          console.log(
            `Updated global MCP configuration for ${editorConfig.name}: ${editorConfig.path}`,
          );
        }
      }
    } catch (error) {
      console.error(
        `Failed to remove global MCP configuration for ${editorConfig.name}: ${error}`,
      );
    }
  }

  /**
   * Get MCP server configuration for VS Code's MCP system
   */
  public static getMcpServerConfig(): McpServerConfig | null {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return null;
    }

    const projectRoot = this.findProjectRoot(workspaceRoot);
    const cliPath = path.join(projectRoot, this.CLI_PATH);

    return {
      command: "node",
      args: [cliPath, "--stdio"],
      env: {
        WORKSPACE_ROOT: workspaceRoot,
      },
      disabled: false,
    };
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
   * Check if MCP server is currently configured (has configuration files)
   */
  public static async isMcpServerConfigured(): Promise<boolean> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return false;
      }

      const projectRoot = this.findProjectRoot(workspaceRoot);

      // Check if workspace MCP configuration exists
      const workspaceMcpPath = path.join(projectRoot, "mcp.json");
      if (fs.existsSync(workspaceMcpPath)) {
        const content = fs.readFileSync(workspaceMcpPath, "utf8");
        const mcpConfig = JSON.parse(content);
        if (
          mcpConfig.mcpServers &&
          mcpConfig.mcpServers[this.MCP_SERVER_NAME]
        ) {
          return true;
        }
      }

      // Check if global MCP configuration exists
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (homeDir) {
        const globalPaths = [
          path.join(homeDir, ".cursor", "mcp.json"),
          path.join(homeDir, ".vscode", "mcp.json"),
          path.join(homeDir, ".config", "cursor", "mcp.json"),
        ];

        for (const globalPath of globalPaths) {
          if (fs.existsSync(globalPath)) {
            const content = fs.readFileSync(globalPath, "utf8");
            const mcpConfig = JSON.parse(content);
            if (
              mcpConfig.mcpServers &&
              mcpConfig.mcpServers[this.MCP_SERVER_NAME]
            ) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      console.error(`Failed to check MCP server configuration: ${error}`);
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
