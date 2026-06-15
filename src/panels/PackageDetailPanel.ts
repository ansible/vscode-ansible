import * as vscode from 'vscode';
import { ExecutionEnvService } from '@ansible/core';
import { log } from '@src/extension';

type PackageType = 'python' | 'system';

/**
 * Webview panel that renders Python or system package detail views.
 *
 * Reuses the shared webview.js bundle, selecting the appropriate
 * view via the data-view attribute. Each unique eeName+packageName
 * combination gets its own panel.
 */
export class PackageDetailPanel {
    private static _panels = new Map<string, PackageDetailPanel>();
    private _disposables: vscode.Disposable[] = [];

    /**
     * @param _panel - The VS Code webview panel instance.
     * @param _eeName - Execution environment image name.
     * @param _packageName - Package name for detail lookup.
     * @param _packageType - Whether this is a python or system package.
     * @param _extensionUri - Extension root URI for opening child panels.
     */
    private constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _eeName: string,
        private readonly _packageName: string,
        private readonly _packageType: PackageType,
        private readonly _extensionUri: vscode.Uri,
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
     * Show the package detail panel. Reuses an existing panel for the same package.
     * @param extensionUri - Extension root URI for webview resource resolution.
     * @param eeName - Full image name of the execution environment.
     * @param packageName - Package name to display.
     * @param packageType - Whether this is a python or system package.
     */
    static show(
        extensionUri: vscode.Uri,
        eeName: string,
        packageName: string,
        packageType: PackageType,
    ): void {
        const key = `${packageType}:${eeName}:${packageName}`;
        const existing = PackageDetailPanel._panels.get(key);
        if (existing) {
            existing._panel.reveal();
            return;
        }

        const viewType =
            packageType === 'python' ? 'python-package-detail' : 'system-package-detail';
        const icon = packageType === 'python' ? 'symbol-package' : 'archive';

        const panel = vscode.window.createWebviewPanel(
            viewType,
            packageName,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
                retainContextWhenHidden: true,
            },
        );

        panel.iconPath = new vscode.ThemeIcon(icon);
        panel.webview.html = PackageDetailPanel._getHtml(
            panel.webview,
            extensionUri,
            eeName,
            packageName,
            viewType,
        );

        const instance = new PackageDetailPanel(
            panel,
            eeName,
            packageName,
            packageType,
            extensionUri,
        );
        PackageDetailPanel._panels.set(key, instance);
    }

    /**
     * Generate the HTML content for the webview panel.
     * @param webview - Webview instance for URI resolution.
     * @param extensionUri - Extension root URI.
     * @param eeName - EE image name.
     * @param packageName - Package name.
     * @param viewType - View identifier for the React router.
     * @returns Complete HTML document string.
     */
    private static _getHtml(
        webview: vscode.Webview,
        extensionUri: vscode.Uri,
        eeName: string,
        packageName: string,
        viewType: string,
    ): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'),
        );
        const nonce = getNonce();
        const props = JSON.stringify({ eeName, packageName });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
    <title>${escapeHtml(packageName)}</title>
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
         data-view="${viewType}"
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

        if (method === 'openPackageDetail') {
            const pkgName = typeof params?.packageName === 'string' ? params.packageName : '';
            const pkgType = params?.packageType === 'system' ? 'system' : 'python';
            if (pkgName) {
                PackageDetailPanel.show(
                    this._extensionUri,
                    typeof params?.eeName === 'string' ? params.eeName : this._eeName,
                    pkgName,
                    pkgType,
                );
            }
            return;
        }

        if (id === undefined) return;

        try {
            const result = await this._dispatch(method, params ?? {});
            void this._panel.webview.postMessage({ id, result });
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            log(`PackageDetailPanel: ${method} failed: ${errMessage}`);
            void this._panel.webview.postMessage({ id, error: errMessage });
        }
    }

    /**
     * Route an RPC method call to the appropriate service method.
     * @param method - The RPC method name.
     * @param params - Arbitrary parameters from the webview.
     * @returns The result to send back to the webview.
     */
    private async _dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
        const svc = ExecutionEnvService.getInstance();
        const eeName = typeof params.eeName === 'string' ? params.eeName : this._eeName;
        const pkgName =
            typeof params.packageName === 'string' ? params.packageName : this._packageName;

        switch (method) {
            case 'getPythonPackageDetail':
                return svc.getPythonPackageDetail(eeName, pkgName);
            case 'getSystemPackageDetail':
                return svc.getSystemPackageDetail(eeName, pkgName);
            case 'openFile': {
                if (typeof params.path !== 'string') {
                    throw new Error('openFile requires a string path parameter');
                }
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(params.path));
                return undefined;
            }
            case 'saveViewSettings':
                return undefined;
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    /**
     * Clean up panel resources when the webview is closed.
     */
    private _dispose(): void {
        const key = `${this._packageType}:${this._eeName}:${this._packageName}`;
        PackageDetailPanel._panels.delete(key);
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
