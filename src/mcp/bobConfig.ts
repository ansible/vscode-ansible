/**
 * IBM Bob MCP Configuration
 *
 * Writes the Ansible MCP server entry to Bob's mcp.json so Bob can
 * discover and invoke Ansible tools via MCP.
 *
 * Config paths (from Bob docs):
 *   Global:    ~/.bob/settings/mcp.json
 *   Workspace: .bob/mcp.json
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveMcpServerPath } from '@src/mcp/cursorConfig';

const MCP_SERVER_NAME = 'ansible-environments';

interface McpServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
    disabled?: boolean;
}

interface McpConfig {
    mcpServers: Record<string, McpServerConfig>;
}

/**
 * Read, merge, and write the Ansible server entry into a Bob mcp.json file.
 * Creates parent directories as needed. Returns true on success.
 * @param configPath - Absolute path to the target mcp.json
 * @param serverPath - Absolute path to the MCP server entry script
 * @param env - Environment variables to pass to the server process
 * @returns True when the config was written successfully
 */
function writeServerEntry(
    configPath: string,
    serverPath: string,
    env: Record<string, string>,
): boolean {
    let config: McpConfig = { mcpServers: {} };

    if (fs.existsSync(configPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<McpConfig>;
            config = { mcpServers: parsed.mcpServers ?? {} };
        } catch {
            config = { mcpServers: {} };
        }
    }

    if (
        (config.mcpServers[MCP_SERVER_NAME] as McpServerConfig | undefined)?.args[0] === serverPath
    ) {
        return true;
    }

    config.mcpServers[MCP_SERVER_NAME] = {
        command: 'node',
        args: [serverPath],
        env,
    };

    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
}

/**
 * Build the environment variables block for the MCP server process.
 * @param context - Extension context for path resolution
 * @returns Environment record with workspace and skill source paths
 */
function buildMcpEnv(context: vscode.ExtensionContext): Record<string, string> {
    const env: Record<string, string> = {};

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
        env.ANSIBLE_ENV_WORKSPACE = workspaceFolder;
    }
    env.ANSIBLE_ENV_EXTENSION_PATH = context.extensionPath;

    const skillSources = vscode.workspace
        .getConfiguration('ansibleEnvironments')
        .get('skillSources');
    if (skillSources) {
        env.ANSIBLE_SKILL_SOURCES = JSON.stringify(skillSources);
    }

    return env;
}

/**
 * Automatically register the Ansible MCP server in Bob's global config.
 *
 * Writes to `~/.bob/settings/mcp.json` so the server is available in
 * every Bob workspace. Bob hot-reloads MCP config on file change —
 * no restart required.
 *
 * @param context - Extension context for server path and env resolution
 * @returns True when registration succeeds
 */
export function registerBobMcpServer(context: vscode.ExtensionContext): boolean {
    const serverPath = resolveMcpServerPath(context);

    if (!fs.existsSync(serverPath)) {
        return false;
    }

    const globalConfig = path.join(os.homedir(), '.bob', 'settings', 'mcp.json');
    const env = buildMcpEnv(context);

    try {
        return writeServerEntry(globalConfig, serverPath, env);
    } catch {
        return false;
    }
}
