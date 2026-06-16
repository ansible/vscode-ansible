import * as vscode from 'vscode';
import {
    PlaybooksService,
    type PlaybookInfo,
    type PlaybookConfig,
} from '@src/services/PlaybooksService';
import { PlaybookProgressPanel, type PlaybookRunOptions } from '@src/panels/PlaybookProgressPanel';
import { buildPlaybookCommand } from '@ansible/core';
import { log } from '@src/extension';

/** Thin webview host for the playbook configuration form. Delegates UI to @ansible/ui PlaybookConfigView. */
export class PlaybookConfigPanel {
    public static currentPanel: PlaybookConfigPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    /**
     * Show or replace the playbook configuration panel.
     * @param extensionUri - Extension root used for webview resources
     * @param playbook - Playbook to configure, or undefined for global defaults
     */
    public static show(extensionUri: vscode.Uri, playbook?: PlaybookInfo): void {
        const isGlobal = !playbook;
        const title = isGlobal ? 'Playbook Defaults' : `Config: ${playbook.name}`;

        if (PlaybookConfigPanel.currentPanel) {
            PlaybookConfigPanel.currentPanel._panel.dispose();
        }

        const panel = vscode.window.createWebviewPanel(
            'playbookConfig',
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
            },
        );

        PlaybookConfigPanel.currentPanel = new PlaybookConfigPanel(
            panel,
            extensionUri,
            playbook,
            isGlobal,
        );
    }

    /**
     * Create the playbook config panel and wire webview message handlers.
     * @param panel - Webview panel hosting the configuration form
     * @param extensionUri - Extension root used for webview resources
     * @param _playbook - Playbook being configured
     * @param _isGlobal - Whether editing workspace-wide defaults
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private readonly _playbook: PlaybookInfo | undefined,
        private readonly _isGlobal: boolean,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.webview.html = this._getHtml(extensionUri);

        this._panel.webview.onDidReceiveMessage(
            (msg: { id?: number; method: string; params?: Record<string, unknown> }) => {
                void this._handleMessage(msg);
            },
            null,
            this._disposables,
        );

        this._panel.onDidDispose(
            () => {
                this.dispose();
            },
            null,
            this._disposables,
        );
    }

    /**
     * Handle RPC messages from the webview.
     * @param msg - Message with method name and optional params/id.
     * @param msg.id - Optional request ID for RPC responses.
     * @param msg.method - The method name to dispatch.
     * @param msg.params - Optional parameters for the method.
     */
    private async _handleMessage(msg: {
        id?: number;
        method: string;
        params?: Record<string, unknown>;
    }): Promise<void> {
        const { id, method, params } = msg;

        if (method === 'showToast' && typeof params?.message === 'string') {
            void vscode.window.showInformationMessage(params.message);
            return;
        }

        if (id !== undefined) {
            try {
                const result = await this._dispatch(method, params ?? {});
                this._panel.webview.postMessage({ id, result });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this._panel.webview.postMessage({ id, error: message });
            }
        }
    }

    /**
     * Dispatch RPC method to the appropriate service call.
     * @param method - The RPC method name.
     * @param params - Parameters passed from the webview.
     * @returns The result to send back to the webview.
     */
    private async _dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
        const service = PlaybooksService.getInstance();

        switch (method) {
            case 'loadConfig':
                return this._isGlobal
                    ? service.getGlobalConfig()
                    : service.getPlaybookConfig(this._playbook?.relativePath ?? '');

            case 'saveConfig': {
                const config = params.config as PlaybookConfig;
                if (this._isGlobal) {
                    service.saveGlobalConfig(config);
                    void vscode.window.showInformationMessage('Global playbook defaults saved.');
                } else if (this._playbook) {
                    service.savePlaybookConfig(this._playbook.relativePath, config);
                    void vscode.window.showInformationMessage(
                        `Configuration saved for ${this._playbook.name}.`,
                    );
                }
                return undefined;
            }

            case 'runPlaybook': {
                const config = params.config as PlaybookConfig;
                await this._runPlaybook(config);
                return undefined;
            }

            case 'resetToDefaults':
                return service.getGlobalConfig();

            case 'openFile':
                if (typeof params.path === 'string') {
                    await vscode.commands.executeCommand(
                        'vscode.open',
                        vscode.Uri.file(params.path),
                    );
                }
                return undefined;

            case 'saveViewSettings':
                return undefined;

            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    /**
     * Build the playbook command and open the progress panel.
     * @param config - Playbook run configuration from the form.
     */
    private async _runPlaybook(config: PlaybookConfig): Promise<void> {
        if (!this._playbook) return;
        const command = buildPlaybookCommand(this._playbook.relativePath, config);
        log(`PlaybookConfigPanel: Running: ${command}`);

        const runOptions: PlaybookRunOptions = {
            playbookPath: this._playbook.path,
            playbookName: this._playbook.name,
            workspaceFolder: this._playbook.workspaceFolder,
            command,
            extensionPath: this._extensionUri.fsPath,
        };

        await PlaybookProgressPanel.show(this._extensionUri, runOptions);
        this._panel.dispose();
    }

    /**
     * Generate the webview HTML shell with CSP and injected props.
     * @param extensionUri - Extension root for resolving resource URIs.
     * @returns Complete HTML string for the webview content.
     */
    private _getHtml(extensionUri: vscode.Uri): string {
        const webviewUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'),
        );
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? './';
        const nonce = getNonce();

        const propsJson = JSON.stringify({
            workspacePath,
            isGlobal: this._isGlobal,
            playbookName: this._playbook?.name ?? 'Global Defaults',
            playbookPath: this._playbook?.relativePath ?? '',
        });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Playbook Config</title>
    <style>
        :root {
            --host-bg-primary: var(--vscode-editor-background);
            --host-bg-surface: var(--vscode-sideBar-background, rgba(128, 128, 128, 0.08));
            --host-text-primary: var(--vscode-editor-foreground);
            --host-text-secondary: var(--vscode-descriptionForeground);
            --host-border: var(--vscode-panel-border);
            --host-accent: var(--vscode-button-background);
        }
        body {
            margin: 0;
            padding: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }
    </style>
</head>
<body>
    <div id="root" data-view="playbook-config" data-props='${propsJson.replace(/'/g, '&#39;')}'></div>
    <script nonce="${nonce}" src="${webviewUri.toString()}"></script>
</body>
</html>`;
    }

    /** Dispose the panel, listeners, and static current-panel reference. */
    public dispose(): void {
        PlaybookConfigPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            x?.dispose();
        }
    }
}

/**
 * Generate a random nonce for CSP script-src.
 * @returns A 32-character alphanumeric string.
 */
function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
