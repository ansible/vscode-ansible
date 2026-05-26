import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface McpServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}

interface McpConfig {
    mcpServers: Record<string, McpServerConfig>;
}

/**
 * Configure Cursor to use the Ansible Environments MCP server
 */
export async function configureCursorMcp(context: vscode.ExtensionContext): Promise<void> {
    const serverPath = context.asAbsolutePath(path.join('out', 'mcp', 'server.js'));
    
    // Check if server file exists
    if (!fs.existsSync(serverPath)) {
        vscode.window.showErrorMessage(
            'MCP server not found. Please ensure the extension is properly compiled.',
            'Show Details'
        ).then(selection => {
            if (selection === 'Show Details') {
                vscode.window.showInformationMessage(`Expected server at: ${serverPath}`);
            }
        });
        return;
    }

    // Determine config location - offer choice between global and workspace
    const configChoice = await vscode.window.showQuickPick([
        {
            label: '$(home) Global Configuration',
            description: 'Apply to all Cursor workspaces',
            detail: `~/.cursor/mcp.json`,
            value: 'global'
        },
        {
            label: '$(folder) Workspace Configuration',
            description: 'Apply only to current workspace',
            detail: `.cursor/mcp.json in workspace`,
            value: 'workspace'
        }
    ], {
        title: 'Configure Cursor MCP',
        placeHolder: 'Where should the MCP configuration be saved?'
    });

    if (!configChoice) {
        return; // User cancelled
    }

    let configPath: string;
    
    if (configChoice.value === 'global') {
        configPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    } else {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        configPath = path.join(workspaceFolder.uri.fsPath, '.cursor', 'mcp.json');
    }

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    // Load existing config or create new
    let config: McpConfig = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(content);
            if (!config.mcpServers) {
                config.mcpServers = {};
            }
        } catch (error) {
            const overwrite = await vscode.window.showWarningMessage(
                `Existing config at ${configPath} could not be parsed. Overwrite?`,
                'Overwrite',
                'Cancel'
            );
            if (overwrite !== 'Overwrite') {
                return;
            }
            config = { mcpServers: {} };
        }
    }

    // Check if already configured
    if (config.mcpServers['ansible-environments']) {
        const existingPath = config.mcpServers['ansible-environments'].args?.[0];
        if (existingPath === serverPath) {
            vscode.window.showInformationMessage(
                'Cursor MCP is already configured for this extension.'
            );
            return;
        }

        const update = await vscode.window.showWarningMessage(
            `Ansible Environments MCP is already configured with a different path. Update it?`,
            'Update',
            'Cancel'
        );
        if (update !== 'Update') {
            return;
        }
    }

    // Add/update our server config
    config.mcpServers['ansible-environments'] = {
        command: 'node',
        args: [serverPath],
        env: {}
    };

    // Write config
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        
        const restartAction = await vscode.window.showInformationMessage(
            `Cursor MCP configured successfully!\n\nServer path: ${serverPath}\nConfig: ${configPath}\n\nPlease restart Cursor for changes to take effect.`,
            'Open Config',
            'OK'
        );

        if (restartAction === 'Open Config') {
            const doc = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(doc);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to write config: ${error}`);
    }
}

/**
 * Show the current Cursor MCP configuration status
 */
export async function showCursorMcpStatus(context: vscode.ExtensionContext): Promise<void> {
    const serverPath = context.asAbsolutePath(path.join('out', 'mcp', 'server.js'));
    const globalConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceConfigPath = workspaceFolder 
        ? path.join(workspaceFolder.uri.fsPath, '.cursor', 'mcp.json')
        : null;

    const lines: string[] = [
        '## Ansible Environments MCP Server Status\n',
        `**Server Path:** \`${serverPath}\``,
        `**Server Exists:** ${fs.existsSync(serverPath) ? '✅ Yes' : '❌ No'}\n`,
        '### Configuration Files\n'
    ];

    // Check global config
    if (fs.existsSync(globalConfigPath)) {
        try {
            const content = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
            const configured = content.mcpServers?.['ansible-environments'];
            if (configured) {
                const pathMatch = configured.args?.[0] === serverPath;
                lines.push(`**Global (~/.cursor/mcp.json):** ${pathMatch ? '✅ Configured correctly' : '⚠️ Path mismatch'}`);
                if (!pathMatch) {
                    lines.push(`  - Configured: \`${configured.args?.[0]}\``);
                    lines.push(`  - Expected: \`${serverPath}\``);
                }
            } else {
                lines.push('**Global (~/.cursor/mcp.json):** ❌ Not configured');
            }
        } catch {
            lines.push('**Global (~/.cursor/mcp.json):** ⚠️ Invalid JSON');
        }
    } else {
        lines.push('**Global (~/.cursor/mcp.json):** ❌ File not found');
    }

    // Check workspace config
    if (workspaceConfigPath) {
        if (fs.existsSync(workspaceConfigPath)) {
            try {
                const content = JSON.parse(fs.readFileSync(workspaceConfigPath, 'utf8'));
                const configured = content.mcpServers?.['ansible-environments'];
                if (configured) {
                    const pathMatch = configured.args?.[0] === serverPath;
                    lines.push(`**Workspace (.cursor/mcp.json):** ${pathMatch ? '✅ Configured correctly' : '⚠️ Path mismatch'}`);
                } else {
                    lines.push('**Workspace (.cursor/mcp.json):** ❌ Not configured');
                }
            } catch {
                lines.push('**Workspace (.cursor/mcp.json):** ⚠️ Invalid JSON');
            }
        } else {
            lines.push('**Workspace (.cursor/mcp.json):** ❌ File not found');
        }
    }

    // Show in a webview or output
    const panel = vscode.window.createWebviewPanel(
        'mcpStatus',
        'MCP Server Status',
        vscode.ViewColumn.One,
        {}
    );

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        h2 { color: var(--vscode-textLink-foreground); }
        h3 { margin-top: 20px; }
        code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        .status-line { margin: 8px 0; }
    </style>
</head>
<body>
    ${lines.map(line => {
        if (line.startsWith('##')) {
            return `<h2>${line.replace('## ', '')}</h2>`;
        } else if (line.startsWith('###')) {
            return `<h3>${line.replace('### ', '')}</h3>`;
        } else {
            // Convert markdown-style formatting
            const html = line
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');
            return `<div class="status-line">${html}</div>`;
        }
    }).join('\n')}
    
    <div style="margin-top: 30px;">
        <p>To configure, run: <strong>Ansible Environments: Configure Cursor MCP</strong></p>
    </div>
</body>
</html>`;

    panel.webview.html = htmlContent;
}

/**
 * Detected IDE type
 */
export type IdeType = 'cursor' | 'vscode' | 'unknown';

/**
 * Detect which IDE we're running in
 */
export function detectIde(): IdeType {
    const appName = vscode.env.appName.toLowerCase();
    if (appName.includes('cursor')) {
        return 'cursor';
    }
    if (appName.includes('visual studio code') || appName.includes('vscode')) {
        return 'vscode';
    }
    return 'unknown';
}

/**
 * MCP configuration status
 */
export interface McpStatus {
    ide: IdeType;
    vscodeAvailable: boolean;  // VS Code MCP API is available (1.99+)
    cursorGlobalConfigured: boolean;
    cursorWorkspaceConfigured: boolean;
    serverExists: boolean;
    isConfigured: boolean;  // Overall: is MCP configured for the current IDE?
}

/**
 * Get the current MCP configuration status
 */
export function getMcpStatus(context: vscode.ExtensionContext): McpStatus {
    const serverPath = context.asAbsolutePath(path.join('out', 'mcp', 'server.js'));
    const globalConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceConfigPath = workspaceFolder 
        ? path.join(workspaceFolder.uri.fsPath, '.cursor', 'mcp.json')
        : null;

    const ide = detectIde();
    const serverExists = fs.existsSync(serverPath);
    
    // Check VS Code MCP API availability
    const vscodeAvailable = typeof (vscode as unknown as { lm?: { registerTool?: unknown } }).lm?.registerTool === 'function';
    
    // Check Cursor global config
    let cursorGlobalConfigured = false;
    if (fs.existsSync(globalConfigPath)) {
        try {
            const content = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
            const configured = content.mcpServers?.['ansible-environments'];
            cursorGlobalConfigured = configured && configured.args?.[0] === serverPath;
        } catch {
            // Invalid JSON
        }
    }
    
    // Check Cursor workspace config
    let cursorWorkspaceConfigured = false;
    if (workspaceConfigPath && fs.existsSync(workspaceConfigPath)) {
        try {
            const content = JSON.parse(fs.readFileSync(workspaceConfigPath, 'utf8'));
            const configured = content.mcpServers?.['ansible-environments'];
            cursorWorkspaceConfigured = configured && configured.args?.[0] === serverPath;
        } catch {
            // Invalid JSON
        }
    }
    
    // Determine if configured for current IDE
    let isConfigured = false;
    if (ide === 'vscode') {
        isConfigured = vscodeAvailable;
    } else if (ide === 'cursor') {
        isConfigured = cursorGlobalConfigured || cursorWorkspaceConfigured;
    }
    
    return {
        ide,
        vscodeAvailable,
        cursorGlobalConfigured,
        cursorWorkspaceConfigured,
        serverExists,
        isConfigured
    };
}
