import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let _outputChannel: vscode.OutputChannel | undefined;

function log(message: string): void {
    _outputChannel ??= vscode.window.createOutputChannel('Ansible Environments');
    _outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Cursor extension API is not typed in @types/vscode */

const MCP_SERVER_NAME = 'ansible-environments';

// -------------------------------------------------------------------------
// Cursor extension API types
// -------------------------------------------------------------------------

interface CursorMcpApi {
    registerServer(config: {
        name: string;
        server: { command: string; args?: string[]; env?: Record<string, string> };
    }): void;
    unregisterServer(name: string): void;
}

interface CursorNamespace {
    mcp?: CursorMcpApi;
}

function getCursorMcpApi(): CursorMcpApi | undefined {
    const cursor = (vscode as any).cursor as CursorNamespace | undefined;
    if (cursor?.mcp && typeof cursor.mcp.registerServer === 'function') {
        return cursor.mcp;
    }
    return undefined;
}

// -------------------------------------------------------------------------
// Primary: Cursor extension API registration
// -------------------------------------------------------------------------

/**
 * Register the MCP server via Cursor's extension API.
 * The server is immediately available and enabled -- no config files,
 * no manual toggle needed.
 */
function registerViaCursorApi(serverPath: string): boolean {
    const api = getCursorMcpApi();
    if (!api) {
        return false;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    try {
        api.registerServer({
            name: MCP_SERVER_NAME,
            server: {
                command: 'node',
                args: [serverPath],
                env: {
                    ...(workspaceFolder ? { ANSIBLE_ENV_WORKSPACE: workspaceFolder } : {}),
                },
            },
        });
        log('MCP server registered via Cursor extension API');
        return true;
    } catch (error) {
        log(
            `Cursor MCP API registration failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
    }
}

// -------------------------------------------------------------------------
// Auto-registration at activation
// -------------------------------------------------------------------------

/**
 * Automatically register the MCP server when running in Cursor.
 * Called during extension activation, mirrors registerMcpServerProvider()
 * for VS Code.
 */
export function registerCursorMcpServer(context: vscode.ExtensionContext): boolean {
    const serverPath = context.asAbsolutePath(
        path.join('packages', 'mcp-server', 'out', 'server.js'),
    );

    if (!fs.existsSync(serverPath)) {
        log(`MCP server binary not found at ${serverPath}`);
        return false;
    }

    return registerViaCursorApi(serverPath);
}

// -------------------------------------------------------------------------
// Fallback: mcp.json file-based configuration
// -------------------------------------------------------------------------

interface McpServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}

interface McpConfig {
    mcpServers: Record<string, McpServerConfig>;
}

/**
 * Write the MCP server entry to a Cursor mcp.json file.
 * Used as a fallback when the Cursor extension API is unavailable.
 */
async function configureViaMcpJson(context: vscode.ExtensionContext): Promise<void> {
    const serverPath = context.asAbsolutePath(
        path.join('packages', 'mcp-server', 'out', 'server.js'),
    );

    if (!fs.existsSync(serverPath)) {
        vscode.window.showErrorMessage(`MCP server not found at: ${serverPath}`);
        return;
    }

    const configChoice = await vscode.window.showQuickPick(
        [
            {
                label: '$(home) Global Configuration',
                description: 'Apply to all Cursor workspaces',
                detail: '~/.cursor/mcp.json',
                value: 'global',
            },
            {
                label: '$(folder) Workspace Configuration',
                description: 'Apply only to current workspace',
                detail: '.cursor/mcp.json in workspace',
                value: 'workspace',
            },
        ],
        {
            title: 'Configure Cursor MCP',
            placeHolder: 'Where should the MCP configuration be saved?',
        },
    );

    if (!configChoice) {
        return;
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

    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    let config: McpConfig = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(content) as Partial<McpConfig>;
            config = { ...parsed, mcpServers: parsed.mcpServers ?? {} };
        } catch {
            const overwrite = await vscode.window.showWarningMessage(
                `Existing config at ${configPath} could not be parsed. Overwrite?`,
                'Overwrite',
                'Cancel',
            );
            if (overwrite !== 'Overwrite') {
                return;
            }
            config = { mcpServers: {} };
        }
    }

    if (MCP_SERVER_NAME in config.mcpServers) {
        const existingServer = config.mcpServers[MCP_SERVER_NAME];
        const existingPath = existingServer.args[0];
        if (existingPath === serverPath) {
            vscode.window.showInformationMessage(
                'Cursor MCP is already configured for this extension.',
            );
            return;
        }

        const update = await vscode.window.showWarningMessage(
            'Ansible Environments MCP is already configured with a different path. Update it?',
            'Update',
            'Cancel',
        );
        if (update !== 'Update') {
            return;
        }
    }

    config.mcpServers[MCP_SERVER_NAME] = {
        command: 'node',
        args: [serverPath],
        env: {},
    };

    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

        const action = await vscode.window.showInformationMessage(
            'Ansible MCP server added. Enable it in Cursor Settings (Ctrl+Shift+J) under Features > MCP.',
            'Open MCP Settings',
            'Open Config File',
        );

        if (action === 'Open MCP Settings') {
            await openCursorMcpSettings();
        } else if (action === 'Open Config File') {
            const doc = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(doc);
        }
    } catch (error) {
        vscode.window.showErrorMessage(
            `Failed to write config: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// -------------------------------------------------------------------------
// Public command handler
// -------------------------------------------------------------------------

/**
 * Configure Cursor to use the Ansible Environments MCP server.
 * Tries the Cursor extension API first; falls back to mcp.json.
 */
export async function configureCursorMcp(context: vscode.ExtensionContext): Promise<void> {
    const serverPath = context.asAbsolutePath(
        path.join('packages', 'mcp-server', 'out', 'server.js'),
    );

    if (!fs.existsSync(serverPath)) {
        vscode.window.showErrorMessage(`MCP server not found at: ${serverPath}`);
        return;
    }

    if (registerViaCursorApi(serverPath)) {
        vscode.window.showInformationMessage(
            'Ansible Environments MCP server registered and ready.',
        );
        return;
    }

    await configureViaMcpJson(context);
}

// -------------------------------------------------------------------------
// Settings helper
// -------------------------------------------------------------------------

async function openCursorMcpSettings(): Promise<void> {
    try {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'mcp');
    } catch {
        vscode.window.showInformationMessage(
            'Open Cursor Settings (Ctrl+Shift+J) and navigate to Features > MCP.',
        );
    }
}

// -------------------------------------------------------------------------
// Status
// -------------------------------------------------------------------------

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Show the current Cursor MCP configuration status
 */
export function showCursorMcpStatus(context: vscode.ExtensionContext): void {
    const serverPath = context.asAbsolutePath(
        path.join('packages', 'mcp-server', 'out', 'server.js'),
    );
    const globalConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceConfigPath = workspaceFolder
        ? path.join(workspaceFolder.uri.fsPath, '.cursor', 'mcp.json')
        : null;

    const cursorApi = getCursorMcpApi();

    const lines: string[] = [
        '## Ansible Environments MCP Server Status\n',
        `**Server Path:** \`${escapeHtml(serverPath)}\``,
        `**Server Exists:** ${fs.existsSync(serverPath) ? 'Yes' : 'No'}`,
        `**Cursor Extension API:** ${cursorApi ? 'Available' : 'Not available'}\n`,
        '### Configuration Files\n',
    ];

    for (const [label, cfgPath] of [
        ['Global (~/.cursor/mcp.json)', globalConfigPath],
        ['Workspace (.cursor/mcp.json)', workspaceConfigPath],
    ] as const) {
        if (!cfgPath) {
            continue;
        }
        if (!fs.existsSync(cfgPath)) {
            lines.push(`**${label}:** File not found`);
            continue;
        }
        try {
            const content = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as McpConfig;
            if (MCP_SERVER_NAME in content.mcpServers) {
                const configured = content.mcpServers[MCP_SERVER_NAME];
                const pathMatch = configured.args[0] === serverPath;
                lines.push(`**${label}:** ${pathMatch ? 'Configured correctly' : 'Path mismatch'}`);
                if (!pathMatch) {
                    lines.push(`  - Configured: \`${escapeHtml(configured.args[0])}\``);
                    lines.push(`  - Expected: \`${escapeHtml(serverPath)}\``);
                }
            } else {
                lines.push(`**${label}:** Not configured`);
            }
        } catch {
            lines.push(`**${label}:** Invalid JSON`);
        }
    }

    const panel = vscode.window.createWebviewPanel(
        'mcpStatus',
        'MCP Server Status',
        vscode.ViewColumn.One,
        {},
    );

    panel.webview.html = `
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
    ${lines
        .map((line) => {
            if (line.startsWith('###')) {
                return `<h3>${line.replace('### ', '')}</h3>`;
            } else if (line.startsWith('##')) {
                return `<h2>${line.replace('## ', '')}</h2>`;
            }
            const html = line
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');
            return `<div class="status-line">${html}</div>`;
        })
        .join('\n')}

    <div style="margin-top: 30px;">
        <p>To configure, run: <strong>Ansible Environments: Configure Cursor MCP</strong></p>
    </div>
</body>
</html>`;
}

// -------------------------------------------------------------------------
// IDE detection & status types
// -------------------------------------------------------------------------

export type IdeType = 'cursor' | 'vscode' | 'unknown';

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

export interface McpStatus {
    ide: IdeType;
    vscodeAvailable: boolean;
    cursorApiAvailable: boolean;
    cursorGlobalConfigured: boolean;
    cursorWorkspaceConfigured: boolean;
    serverExists: boolean;
    isConfigured: boolean;
}

export function getMcpStatus(context: vscode.ExtensionContext): McpStatus {
    const serverPath = context.asAbsolutePath(
        path.join('packages', 'mcp-server', 'out', 'server.js'),
    );
    const globalConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceConfigPath = workspaceFolder
        ? path.join(workspaceFolder.uri.fsPath, '.cursor', 'mcp.json')
        : null;

    const ide = detectIde();
    const serverExists = fs.existsSync(serverPath);
    const cursorApiAvailable = !!getCursorMcpApi();

    const vscodeAvailable =
        typeof (vscode as unknown as { lm?: { registerTool?: unknown } }).lm?.registerTool ===
        'function';

    let cursorGlobalConfigured = false;
    if (fs.existsSync(globalConfigPath)) {
        try {
            const content = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8')) as McpConfig;
            const configured = content.mcpServers[MCP_SERVER_NAME];
            cursorGlobalConfigured = configured.args[0] === serverPath;
        } catch {
            /* invalid JSON */
        }
    }

    let cursorWorkspaceConfigured = false;
    if (workspaceConfigPath && fs.existsSync(workspaceConfigPath)) {
        try {
            const content = JSON.parse(fs.readFileSync(workspaceConfigPath, 'utf8')) as McpConfig;
            const configured = content.mcpServers[MCP_SERVER_NAME];
            cursorWorkspaceConfigured = configured.args[0] === serverPath;
        } catch {
            /* invalid JSON */
        }
    }

    let isConfigured = false;
    if (ide === 'vscode') {
        isConfigured = vscodeAvailable;
    } else if (ide === 'cursor') {
        isConfigured = cursorApiAvailable || cursorGlobalConfigured || cursorWorkspaceConfigured;
    }

    return {
        ide,
        vscodeAvailable,
        cursorApiAvailable,
        cursorGlobalConfigured,
        cursorWorkspaceConfigured,
        serverExists,
        isConfigured,
    };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
