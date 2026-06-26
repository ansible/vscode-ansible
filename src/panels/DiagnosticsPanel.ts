import * as vscode from 'vscode';
import { getCommandService } from '@ansible/services';
import { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import { getMcpStatus } from '@src/mcp';
import type { AnsibleStatusBar } from '@src/statusBar/ansibleStatusBar';
// DiagnosticsData and DiagnosticsService live in @ansible/ui which is
// outside the tsc rootDir. The webview bridge enforces the contract at
// runtime; the host returns a structurally compatible object.
import { outputChannel, log } from '@src/extension';

/**
 * Webview panel showing Python environment, Ansible runtime, and
 * dev tools diagnostics. Singleton — only one instance at a time.
 *
 * Uses the shared React entry point (`dist/webview.js`) with the
 * `diagnostics` data-view to render the DiagnosticsView component.
 */
export class DiagnosticsPanel {
    private static _instance: DiagnosticsPanel | undefined;
    private readonly _disposables: vscode.Disposable[] = [];

    /**
     * @param _panel - The VS Code webview panel instance.
     * @param _statusBar - Unified Ansible status bar for cached metadata and env info.
     * @param _context - Extension context for MCP status queries.
     */
    private constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _statusBar: AnsibleStatusBar,
        private readonly _context: vscode.ExtensionContext,
    ) {
        this._panel.onDidDispose(
            () => {
                this._dispose();
            },
            null,
            this._disposables,
        );
        this._panel.webview.onDidReceiveMessage(
            (msg: { id?: number; method: string; params?: Record<string, unknown> }) => {
                void this._handleMessage(msg);
            },
            null,
            this._disposables,
        );
    }

    /**
     * Show the diagnostics panel, creating it if needed.
     * @param context - Extension context for resource resolution and MCP status.
     * @param statusBar - Unified Ansible status bar for metadata and env info.
     */
    static show(context: vscode.ExtensionContext, statusBar: AnsibleStatusBar): void {
        if (DiagnosticsPanel._instance) {
            DiagnosticsPanel._instance._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'ansibleDiagnostics',
            'Ansible Diagnostics',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
                retainContextWhenHidden: true,
            },
        );

        panel.iconPath = new vscode.ThemeIcon('pulse');
        panel.webview.html = DiagnosticsPanel._getHtml(panel.webview, context.extensionUri);

        DiagnosticsPanel._instance = new DiagnosticsPanel(panel, statusBar, context);
    }

    /**
     * Generate the HTML shell for the diagnostics webview.
     * @param webview - Webview instance for URI resolution.
     * @param extensionUri - Extension root URI.
     * @returns Complete HTML document string.
     */
    private static _getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'),
        );
        const nonce = getNonce();
        const props = JSON.stringify({});

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
    <title>Ansible Diagnostics</title>
    <style>
        :root {
            --host-bg-primary: var(--vscode-editor-background);
            --host-bg-surface: var(--vscode-sideBar-background, var(--vscode-editor-background));
            --host-bg-hover: var(--vscode-list-hoverBackground);
            --host-bg-active: var(--vscode-list-activeSelectionBackground);
            --host-text-primary: var(--vscode-editor-foreground);
            --host-text-secondary: var(--vscode-descriptionForeground);
            --host-text-muted: var(--vscode-disabledForeground);
            --host-text-link: var(--vscode-textLink-foreground);
            --host-border: var(--vscode-panel-border, var(--vscode-widget-border));
            --host-border-active: var(--vscode-focusBorder);
            --host-accent: var(--vscode-button-background);
            --host-accent-hover: var(--vscode-button-hoverBackground);
            --host-success: var(--vscode-testing-iconPassed, #4ec9b0);
            --host-warning: var(--vscode-editorWarning-foreground, #cca700);
            --host-error: var(--vscode-editorError-foreground, #f44747);
            --host-font-family: var(--vscode-font-family);
            --host-font-size: var(--vscode-font-size);
            --host-font-mono: var(--vscode-editor-font-family);
        }
        html, body, #root {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
    </style>
</head>
<body>
    <div id="root"
         data-view="diagnostics"
         data-props="${escapeAttr(props)}"></div>
    <script nonce="${nonce}" src="${String(scriptUri)}"></script>
</body>
</html>`;
    }

    /**
     * Handle incoming postMessage RPC from the webview.
     * @param msg - The message payload with optional correlation ID.
     * @param msg.id - Correlation ID for request/response pairing.
     * @param msg.method - The RPC method name.
     * @param msg.params - Arbitrary parameters from the webview.
     */
    private async _handleMessage(msg: {
        id?: number;
        method: string;
        params?: Record<string, unknown>;
    }): Promise<void> {
        const { id, method } = msg;

        switch (method) {
            case 'changePythonEnvironment': {
                const envService = PythonEnvironmentService.getInstance();
                if (envService.prefersEnvsExtension()) {
                    void vscode.commands.executeCommand('python-envs.select');
                } else {
                    void vscode.commands.executeCommand('python.setInterpreter');
                }
                return;
            }
            case 'upgradeDevTools':
                void vscode.commands.executeCommand('ansibleDevToolsPackages.upgrade');
                return;
            case 'resyncMetadata':
                this._statusBar.forceRefresh();
                return;
            case 'openOutput':
                outputChannel.show();
                return;
            case 'showToast': {
                const text = msg.params?.message;
                if (typeof text === 'string' && text) {
                    void vscode.window.showInformationMessage(text);
                }
                return;
            }
        }

        if (id === undefined) return;

        try {
            const result = await this._dispatch(method);
            void this._panel.webview.postMessage({ id, result });
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            log(`DiagnosticsPanel: ${method} failed: ${errMessage}`);
            void this._panel.webview.postMessage({ id, error: errMessage });
        }
    }

    /**
     * Route an RPC method call to the appropriate handler.
     * @param method - The RPC method name.
     * @returns The result to send back to the webview.
     */
    private async _dispatch(method: string): Promise<unknown> {
        switch (method) {
            case 'getDiagnostics':
                return this._gatherDiagnostics();
            case 'saveViewSettings':
                return undefined;
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    /**
     * Collect diagnostics data from status bars and CLI tools.
     * @returns Diagnostics payload for the webview.
     */
    private async _gatherDiagnostics(): Promise<Record<string, unknown>> {
        const pyInfo = this._statusBar.getEnvironmentInfo();

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        const lsRunning = this._statusBar.isLanguageServerRunning();
        const mcpStatus = getMcpStatus(this._context);

        const services: { name: string; status: string }[] = [
            {
                name: 'Language Server',
                status: lsRunning ? 'running' : 'stopped',
            },
            {
                name: 'MCP Server',
                status: mcpStatus.isConfigured ? 'configured' : 'not configured',
            },
        ];

        let ansibleVersion: string | undefined;
        try {
            const cmdService = getCommandService();
            const result = await cmdService.runTool('ansible', ['--version']);
            if (result.exitCode === 0 && result.stdout) {
                const match = /ansible\s+\[core\s+([\d.]+\S*)]/.exec(result.stdout);
                if (match) {
                    ansibleVersion = match[1];
                }
            }
        } catch {
            // ansible not available
        }

        const skipTools = new Set(['ansible-core']);
        let tools: { name: string; version: string }[] = [];
        try {
            const cmdService = getCommandService();
            const result = await cmdService.runTool('adt', ['--version']);
            if (result.exitCode === 0 && result.stdout) {
                for (const line of result.stdout.split('\n')) {
                    const match = /^(\S+)\s+([\d.]+\S*)/.exec(line.trim());
                    if (match && !skipTools.has(match[1])) {
                        tools.push({ name: match[1], version: match[2] });
                    }
                }
            }
        } catch {
            tools = [];
        }

        return {
            workspacePath,
            python: {
                envName: pyInfo.pythonEnvDisplayName,
                version: pyInfo.pythonVersion,
                path: pyInfo.pythonEnvPath,
            },
            ansible: {
                version: ansibleVersion,
            },
            services,
            tools,
        };
    }

    /** Clean up panel resources when the webview is closed. */
    private _dispose(): void {
        DiagnosticsPanel._instance = undefined;
        for (const d of this._disposables) d.dispose();
        this._disposables.length = 0;
    }
}

/**
 * Generate a random nonce for CSP script-src.
 * @returns A 32-character alphanumeric nonce string.
 */
function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}

/**
 * Escape double quotes for HTML attribute values.
 * @param s - Input string.
 * @returns Escaped string safe for HTML attributes.
 */
function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
