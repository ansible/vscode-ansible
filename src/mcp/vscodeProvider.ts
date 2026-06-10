/**
 * VS Code MCP Provider
 *
 * Registers the Ansible Environments MCP server with VS Code's
 * language model API (for Copilot integration).
 *
 * Based on: https://github.com/microsoft/vscode-extension-samples/tree/main/mcp-extension-sample
 */

import * as vscode from 'vscode';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-condition -- VS Code MCP API is not yet stable/typed */

/**
 * Register the MCP server with VS Code.
 *
 * This makes the Ansible Environments tools available to VS Code Copilot
 * and other AI features that support MCP.
 *
 * @param context Extension context for subscriptions and paths
 */
export function registerMcpServerProvider(context: vscode.ExtensionContext): void {
    if (
        !vscode.lm ||
        typeof (vscode.lm as any).registerMcpServerDefinitionProvider !== 'function'
    ) {
        console.log('Ansible Environments: VS Code MCP API not available');
        return;
    }

    if (!(vscode as any).McpStdioServerDefinition) {
        console.log('Ansible Environments: McpStdioServerDefinition not available');
        return;
    }

    const didChangeEmitter = new vscode.EventEmitter<void>();

    const serverPath = context.asAbsolutePath(
        path.join('packages', 'mcp-server', 'out', 'server.js'),
    );

    context.subscriptions.push(
        (vscode.lm as any).registerMcpServerDefinitionProvider('ansibleEnvironments', {
            onDidChangeMcpServerDefinitions: didChangeEmitter.event,
            provideMcpServerDefinitions: (): any[] => {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

                if (!workspaceFolder) {
                    console.log(
                        'Ansible Environments: No workspace folder, MCP server not available',
                    );
                    return [];
                }

                return [
                    new (vscode as any).McpStdioServerDefinition(
                        'Ansible Environments',
                        'node',
                        [serverPath],
                        {
                            ANSIBLE_ENV_WORKSPACE: workspaceFolder,
                            ANSIBLE_ENV_EXTENSION_PATH: context.extensionPath,
                        },
                    ),
                ];
            },
        }),
    );

    context.subscriptions.push(didChangeEmitter);
    console.log('Ansible Environments: MCP server provider registered');
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-condition */

/**
 * Check if VS Code MCP is available
 */
export function isMcpAvailable(): boolean {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- VS Code MCP API is not yet stable/typed */
    return typeof (vscode.lm as any).registerMcpServerDefinitionProvider === 'function';
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
}
