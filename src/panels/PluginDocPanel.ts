import * as vscode from 'vscode';
import { CollectionsService } from '@ansible/services';
import type { PluginData } from '@ansible/services';

/**
 * Thin webview host for plugin documentation.
 *
 * All rendering is handled by PluginDocView in @ansible/ui.
 * This class owns panel lifecycle, HTML shell, and postMessage
 * RPC routing to CollectionsService.
 */
export class PluginDocPanel {
    private static _panels = new Map<string, PluginDocPanel>();
    public static readonly viewType = 'pluginDocPanel';
    private _disposables: vscode.Disposable[] = [];
    private _preloadedDoc: PluginData | undefined;

    /**
     * @param _panel - The VS Code webview panel instance.
     * @param _pluginKey - Deduplication key (fqcn:type).
     * @param _fqcn - Fully qualified plugin name.
     * @param _pluginType - Plugin type such as module or lookup.
     * @param preloadedDoc - Pre-fetched plugin data (e.g. from Galaxy docs-blob).
     */
    private constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _pluginKey: string,
        private readonly _fqcn: string,
        private readonly _pluginType: string,
        preloadedDoc?: PluginData,
    ) {
        this._preloadedDoc = preloadedDoc;
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
     * Show or reveal plugin documentation for the requested plugin.
     * @param extensionUri - Extension root used for webview resources.
     * @param pluginFullName - Fully qualified plugin name.
     * @param pluginType - Plugin type such as module or lookup.
     */
    public static show(extensionUri: vscode.Uri, pluginFullName: string, pluginType: string): void {
        const pluginKey = `${pluginFullName}:${pluginType}`;

        const existing = PluginDocPanel._panels.get(pluginKey);
        if (existing) {
            existing._preloadedDoc = undefined;
            existing._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            PluginDocPanel.viewType,
            pluginFullName,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
                retainContextWhenHidden: true,
            },
        );

        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        const enableAi = config.get<boolean>('enableAiFeatures', true);

        panel.iconPath = new vscode.ThemeIcon('book');
        panel.webview.html = PluginDocPanel._getHtml(
            panel.webview,
            extensionUri,
            pluginFullName,
            pluginType,
            enableAi,
        );

        const instance = new PluginDocPanel(panel, pluginKey, pluginFullName, pluginType);
        PluginDocPanel._panels.set(pluginKey, instance);
    }

    /**
     * Show plugin documentation with pre-fetched data (e.g. from Galaxy docs-blob).
     * The webview's getPluginDoc RPC will return this data instead of querying CollectionsService.
     * @param extensionUri - Extension root used for webview resources.
     * @param pluginFullName - Fully qualified plugin name.
     * @param pluginType - Plugin type such as module or lookup.
     * @param data - Pre-fetched plugin documentation data.
     */
    public static showWithData(
        extensionUri: vscode.Uri,
        pluginFullName: string,
        pluginType: string,
        data: PluginData,
    ): void {
        const pluginKey = `${pluginFullName}:${pluginType}`;

        const existing = PluginDocPanel._panels.get(pluginKey);
        if (existing) {
            existing._preloadedDoc = data;
            existing._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            PluginDocPanel.viewType,
            pluginFullName,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
                retainContextWhenHidden: true,
            },
        );

        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        const enableAi = config.get<boolean>('enableAiFeatures', true);

        panel.iconPath = new vscode.ThemeIcon('book');
        panel.webview.html = PluginDocPanel._getHtml(
            panel.webview,
            extensionUri,
            pluginFullName,
            pluginType,
            enableAi,
        );

        const instance = new PluginDocPanel(panel, pluginKey, pluginFullName, pluginType, data);
        PluginDocPanel._panels.set(pluginKey, instance);
    }

    /**
     * Generate the HTML shell for the webview.
     * @param webview - Webview instance for URI resolution.
     * @param extensionUri - Extension root URI.
     * @param fqcn - Fully qualified plugin name.
     * @param pluginType - Plugin type.
     * @param enableAiFeatures - Whether AI features are enabled.
     * @returns Complete HTML document string.
     */
    private static _getHtml(
        webview: vscode.Webview,
        extensionUri: vscode.Uri,
        fqcn: string,
        pluginType: string,
        enableAiFeatures: boolean,
    ): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'),
        );
        const nonce = getNonce();
        const props = JSON.stringify({ fqcn, pluginType, enableAiFeatures });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
    <title>${escapeHtml(fqcn)}</title>
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
         data-view="plugin-doc"
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
        const { id, method, params } = msg;

        if (method === 'showToast') {
            const text = params?.message;
            const safeText =
                typeof text === 'string' ? text : text != null ? JSON.stringify(text) : '';
            if (safeText) {
                void vscode.window.showInformationMessage(safeText);
            }
            return;
        }

        if (method === 'openChat') {
            const prompt = typeof params?.prompt === 'string' ? params.prompt : undefined;
            void this._openChatWithPrompt(prompt);
            return;
        }

        if (id === undefined) return;

        try {
            const result = await this._dispatch(method, params ?? {});
            void this._panel.webview.postMessage({ id, result });
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            void this._panel.webview.postMessage({ id, error: errMessage });
        }
    }

    /**
     * Route an RPC method call to the appropriate service.
     * @param method - The RPC method name.
     * @param params - Parameters from the webview.
     * @returns The result to send back to the webview.
     */
    private async _dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
        switch (method) {
            case 'getPluginDoc': {
                if (this._preloadedDoc) return this._preloadedDoc;
                const fqcn = typeof params.fqcn === 'string' ? params.fqcn : this._fqcn;
                const pType =
                    typeof params.pluginType === 'string' ? params.pluginType : this._pluginType;
                return CollectionsService.getInstance().getPluginDocumentation(fqcn, pType);
            }
            case 'copyToClipboard': {
                if (typeof params.text === 'string') {
                    await vscode.env.clipboard.writeText(params.text);
                }
                return undefined;
            }
            case 'saveViewSettings':
                return undefined;
            case 'getResolvedTheme': {
                const kind = vscode.window.activeColorTheme.kind;
                return kind === vscode.ColorThemeKind.Light ||
                    kind === vscode.ColorThemeKind.HighContrastLight
                    ? 'light'
                    : 'dark';
            }
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    /**
     * Open the chat panel with a prompt.
     * @param prompt - Optional prompt text to send to the chat provider.
     */
    private async _openChatWithPrompt(prompt?: string): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.action.chat.open', prompt ?? '');
        } catch {
            if (prompt) {
                await vscode.env.clipboard.writeText(prompt);
            }
            void vscode.window.showInformationMessage(
                'AI prompt copied to clipboard. Paste it into a chat session.',
            );
        }
    }

    /** Clean up panel resources. */
    private _dispose(): void {
        PluginDocPanel._panels.delete(this._pluginKey);
        for (const d of this._disposables) d.dispose();
        this._disposables.length = 0;
    }
}

/**
 * Generate a random nonce for CSP.
 * @returns A 32-character nonce string.
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
 * Escape HTML special characters.
 * @param s - Input string.
 * @returns Escaped string safe for HTML content.
 */
function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escape double quotes for HTML attribute values.
 * @param s - Input string.
 * @returns Escaped string safe for HTML attributes.
 */
function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
