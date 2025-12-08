import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class AnsibleMcpServerProvider {
  private static readonly MCP_SERVER_NAME =
    "Ansible Developer Tools MCP Server";
  // Development path (relative to project root)
  private static readonly CLI_PATH_DEV =
    "packages/ansible-mcp-server/out/server/src/cli.js";
  // Packaged extension path (relative to extension path)
  private static readonly CLI_PATH_PACKAGED = "out/mcp/cli.js";

  private extensionPath: string;
  private didChangeEmitter = new vscode.EventEmitter<void>();

  public readonly onDidChangeMcpServerDefinitions = this.didChangeEmitter.event;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  /**
   * Provide MCP server definitions
   */
  public async provideMcpServerDefinitions(): Promise<
    vscode.McpServerDefinition[]
  > {
    const servers: vscode.McpServerDefinition[] = [];

    try {
      // Check if MCP server is enabled in settings
      const mcpConfig = vscode.workspace.getConfiguration("ansible.mcpServer");
      const isEnabled = mcpConfig.get("enabled", false);

      if (!isEnabled) {
        console.log(
          "MCP server is disabled in settings, skipping registration",
        );
        return servers;
      }

      // Check if MCP server is available
      const isAvailable = await this.isMcpServerAvailable();
      if (!isAvailable) {
        console.log("MCP server is not available, skipping registration");
        return servers;
      }

      // Get workspace root
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        console.log(
          "No workspace folder found, skipping MCP server registration",
        );
        return servers;
      }

      // Find the CLI path - check both packaged and development locations
      const cliPath = this.findCliPath();
      if (!cliPath) {
        console.log("MCP server CLI file not found, skipping registration");
        return servers;
      }

      // Use process.execPath which points to the Node.js executable that VS Code is using
      // This ensures we can find Node.js even if it's not in the system PATH
      const nodeExecutable = process.execPath;

      // Create stdio server definition
      // Use extension path as the cwd for the server process
      const stdioServer = new vscode.McpStdioServerDefinition(
        AnsibleMcpServerProvider.MCP_SERVER_NAME,
        nodeExecutable,
        [cliPath, "--stdio"],
        {
          WORKSPACE_ROOT: workspaceRoot,
        },
        path.dirname(cliPath),
      );

      servers.push(stdioServer);

      console.log(
        `Registered MCP server: ${AnsibleMcpServerProvider.MCP_SERVER_NAME}`,
      );
    } catch (error) {
      console.error(`Failed to provide MCP server definitions: ${error}`);
    }

    return servers;
  }

  /**
   * Resolve MCP server definition when it needs to be started
   */
  public async resolveMcpServerDefinition(
    server: vscode.McpServerDefinition,
  ): Promise<vscode.McpServerDefinition | undefined> {
    try {
      // Validate that the MCP server is still available
      const isAvailable = await this.isMcpServerAvailable();
      if (!isAvailable) {
        const errorMessage =
          "MCP server is not available. Please ensure the server is built by running 'yarn build'.";
        vscode.window.showErrorMessage(errorMessage);
        console.error(errorMessage);
        return undefined;
      }

      // Check if this is our Ansible MCP server
      if (server.label === AnsibleMcpServerProvider.MCP_SERVER_NAME) {
        // For now, we don't require authentication, but this is where we could add it
        // if needed in the future
        console.log(`Starting MCP server: ${server.label}`);
        return server;
      }

      return server;
    } catch (error) {
      const errorMessage = `Failed to resolve MCP server definition: ${error}`;
      console.error(errorMessage);
      vscode.window.showErrorMessage(errorMessage);
      return undefined;
    }
  }

  /**
   * Check if MCP server is currently available
   */
  private async isMcpServerAvailable(): Promise<boolean> {
    try {
      const cliPath = this.findCliPath();
      if (!cliPath) {
        return false;
      }

      // Check if the file is accessible
      try {
        fs.accessSync(cliPath, fs.constants.F_OK | fs.constants.R_OK);
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    } catch (error) {
      console.error(`Failed to check MCP server availability: ${error}`);
      return false;
    }
  }

  /**
   * Find the CLI path - checks both packaged and development locations
   */
  private findCliPath(): string | undefined {
    // First, check if we're in a packaged extension (out/mcp/cli.js)
    const packagedPath = path.join(
      this.extensionPath,
      AnsibleMcpServerProvider.CLI_PATH_PACKAGED,
    );
    if (fs.existsSync(packagedPath)) {
      console.log(`Found MCP server CLI at packaged path: ${packagedPath}`);
      return packagedPath;
    }

    // If not found, check development path (packages/ansible-mcp-server/out/server/src/cli.js)
    // We need to find the project root first
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let devPath: string | undefined;
    if (workspaceRoot) {
      const projectRoot = this.findProjectRoot(workspaceRoot);
      devPath = path.join(projectRoot, AnsibleMcpServerProvider.CLI_PATH_DEV);
      if (fs.existsSync(devPath)) {
        console.log(`Found MCP server CLI at development path: ${devPath}`);
        return devPath;
      }
    }

    console.error(
      `MCP server CLI not found at either location:\n  - Packaged: ${packagedPath}\n  - Development: ${devPath || "N/A"}`,
    );
    return undefined;
  }

  /**
   * Find the project root by looking for package.json
   */
  private findProjectRoot(startPath: string): string {
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
   * Trigger a change event to refresh server definitions
   */
  public refresh(): void {
    this.didChangeEmitter.fire();
  }

  /**
   * Dispose of the provider
   */
  public dispose(): void {
    this.didChangeEmitter.dispose();
  }
}
