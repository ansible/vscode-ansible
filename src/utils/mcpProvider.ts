import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class AnsibleMcpServerProvider {
  private static readonly MCP_SERVER_NAME =
    "Ansible Development Tools MCP Server";
  private static readonly CLI_PATH =
    "packages/ansible-mcp-server/out/server/src/cli.js";

  private didChangeEmitter = new vscode.EventEmitter<void>();

  public readonly onDidChangeMcpServerDefinitions = this.didChangeEmitter.event;

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

      // Find project root
      const projectRoot = this.findProjectRoot(workspaceRoot);
      const cliPath = path.join(projectRoot, AnsibleMcpServerProvider.CLI_PATH);

      // Use process.execPath which points to the Node.js executable that VS Code is using
      // This ensures we can find Node.js even if it's not in the system PATH
      const nodeExecutable = process.execPath;

      // Create stdio server definition
      const stdioServer = new vscode.McpStdioServerDefinition(
        AnsibleMcpServerProvider.MCP_SERVER_NAME,
        nodeExecutable,
        [cliPath, "--stdio"],
        {
          WORKSPACE_ROOT: workspaceRoot,
        },
        projectRoot,
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

      // Check if this is our Ansible Development ToolsMCP server
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
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return false;
      }

      const projectRoot = this.findProjectRoot(workspaceRoot);
      const cliPath = path.join(projectRoot, AnsibleMcpServerProvider.CLI_PATH);

      if (!fs.existsSync(cliPath)) {
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
