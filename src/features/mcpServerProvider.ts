import * as vscode from "vscode";
import { McpServerManager } from "../utils/mcpServerManager";

/**
 * MCP Server Provider for VS Code's MCP system
 */
export class AnsibleMcpServerProvider {
  private static readonly MCP_SERVER_NAME = "ansible-mcp-server";

  /**
   * Provide MCP server definitions
   */
  async provideMcpServerDefinitions(): Promise<any[]> {
    try {
      // Check if MCP server is available
      const isAvailable = await McpServerManager.isMcpServerAvailable();
      if (!isAvailable) {
        console.log("MCP server is not available");
        return [];
      }

      // Get MCP server configuration
      const config = McpServerManager.getMcpServerConfig();
      if (!config) {
        console.log("MCP server configuration not available");
        return [];
      }

      // Return MCP server definition
      return [
        {
          name: AnsibleMcpServerProvider.MCP_SERVER_NAME,
          command: config.command,
          args: config.args,
          env: config.env,
          disabled: config.disabled,
        },
      ];
    } catch (error) {
      console.error(`Failed to provide MCP server definitions: ${error}`);
      return [];
    }
  }

  /**
   * Get MCP server status
   */
  async getMcpServerStatus(): Promise<any> {
    try {
      const status = await McpServerManager.getMcpServerStatus();

      if (status.available) {
        return {
          name: AnsibleMcpServerProvider.MCP_SERVER_NAME,
          status: "running",
          details: `MCP server is available at ${status.cliPath}`,
        };
      } else {
        return {
          name: AnsibleMcpServerProvider.MCP_SERVER_NAME,
          status: "error",
          details: status.error || "MCP server is not available",
        };
      }
    } catch (error) {
      return {
        name: AnsibleMcpServerProvider.MCP_SERVER_NAME,
        status: "error",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
