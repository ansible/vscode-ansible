/**
 * VS Code MCP Provider
 *
 * Registers the Ansible MCP server with VS Code's
 * language model API (for Copilot integration).
 *
 * Based on: https://github.com/microsoft/vscode-extension-samples/tree/main/mcp-extension-sample
 */

import * as vscode from 'vscode';
import { resolveMcpServerPath } from '@src/mcp/cursorConfig';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-condition -- VS Code MCP API is not yet stable/typed */

/**
 * Register the MCP server with VS Code.
 *
 * This makes the Ansible tools available to VS Code Copilot
 * and other AI features that support MCP.
 *
 * @param context Extension context for subscriptions and paths
 */
export function registerMcpServerProvider(context: vscode.ExtensionContext): void {
    if (
        !vscode.lm ||
        typeof (vscode.lm as any).registerMcpServerDefinitionProvider !== 'function'
    ) {
        console.log('Ansible: VS Code MCP API not available');
        return;
    }

    if (!(vscode as any).McpStdioServerDefinition) {
        console.log('Ansible: McpStdioServerDefinition not available');
        return;
    }

    const didChangeEmitter = new vscode.EventEmitter<void>();

    const serverPath = resolveMcpServerPath(context);

    context.subscriptions.push(
        (vscode.lm as any).registerMcpServerDefinitionProvider('ansibleEnvironments', {
            onDidChangeMcpServerDefinitions: didChangeEmitter.event,
            provideMcpServerDefinitions: (): any[] => {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

                if (!workspaceFolder) {
                    console.log('Ansible: No workspace folder, MCP server not available');
                    return [];
                }

                const env: Record<string, string> = {
                    ANSIBLE_ENV_WORKSPACE: workspaceFolder,
                    ANSIBLE_ENV_EXTENSION_PATH: context.extensionPath,
                };

                // Forward skill sources to the MCP server process
                const skillSources = vscode.workspace
                    .getConfiguration('ansibleEnvironments')
                    .get('skillSources');
                if (skillSources) {
                    env.ANSIBLE_SKILL_SOURCES = JSON.stringify(skillSources);
                }

                return [
                    new (vscode as any).McpStdioServerDefinition(
                        'Ansible',
                        'node',
                        [serverPath],
                        env,
                    ),
                ];
            },
        }),
    );

    context.subscriptions.push(didChangeEmitter);
    console.log('Ansible: MCP server provider registered');
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-condition */

/**
 * Check if VS Code MCP is available
 * @returns True when the MCP server definition provider API is present
 */
export function isMcpAvailable(): boolean {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- VS Code MCP API is not yet stable/typed */
    return typeof (vscode.lm as any).registerMcpServerDefinitionProvider === 'function';
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
}
