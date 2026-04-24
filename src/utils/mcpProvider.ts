import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { createRequire } from "node:module";

export class AnsibleMcpServerProvider {
  private static readonly MCP_SERVER_NAME =
    "Ansible Development Tools MCP Server";
  private static readonly MCP_PACKAGE_NAME = "@ansible/ansible-mcp-server";

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

      const cliPath = this.findCliPath();
      if (!cliPath) {
        console.log("MCP server CLI file not found, skipping registration");
        return servers;
      }

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
          "MCP server is not available. Please ensure the server is built by running 'pnpm build'.";
        vscode.window.showErrorMessage(errorMessage);
        console.error(errorMessage);
        return undefined;
      }

      // Check if this is our Ansible Development Tools MCP server
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
      return true;
    } catch (error) {
      console.error(`Failed to check MCP server availability: ${error}`);
      return false;
    }
  }

  /**
   * Find the CLI path using Node.js module resolution.
   * This avoids hardcoded paths and uses the package's bin entry point.
   */
  private static readonly MCP_CLI_FILENAME = "cli.cjs";

  private findCliPath(): string | null {
    // Try module resolution first (works in development with pnpm workspace symlinks)
    try {
      const require = createRequire(
        path.join(this.extensionPath, "package.json"),
      );

      const packageMainPath = require.resolve(
        AnsibleMcpServerProvider.MCP_PACKAGE_NAME,
      );

      // require.resolve returns the "main" entry (dist/cli.cjs); use its directory
      const packageDir = path.dirname(packageMainPath);
      const cliPath = path.join(
        packageDir,
        AnsibleMcpServerProvider.MCP_CLI_FILENAME,
      );

      if (fs.existsSync(cliPath) && fs.statSync(cliPath).isFile()) {
        console.log(`Found MCP server CLI via module resolution: ${cliPath}`);
        return cliPath;
      }
    } catch {
      // Module resolution fails in the packaged extension (no node_modules/)
    }

    // Fallback: check the packaged extension path where vsce bundles the workspace package
    const packagedCliPath = path.join(
      this.extensionPath,
      "packages",
      "ansible-mcp-server",
      "dist",
      AnsibleMcpServerProvider.MCP_CLI_FILENAME,
    );

    if (
      fs.existsSync(packagedCliPath) &&
      fs.statSync(packagedCliPath).isFile()
    ) {
      console.log(`Found MCP server CLI at packaged path: ${packagedCliPath}`);
      return packagedCliPath;
    }

    console.error(
      "MCP server CLI not found via module resolution or packaged path",
    );
    return null;
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
