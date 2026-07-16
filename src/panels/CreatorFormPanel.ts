import * as vscode from 'vscode';
import { log } from '@src/extension';
import { buildCommandArgs, getCommandService, type SchemaNode } from '@ansible/developer-services';
import { TelemetryEvents, buildOutcomeProperties } from '@ansible/common';
import { TelemetryService } from '@src/services/TelemetryService';

/** Thin webview host for the creator form. Delegates UI to @ansible/ui SchemaForm. */
export class CreatorFormPanel {
    public static currentPanel: CreatorFormPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    /** True after a terminal creator.complete outcome was emitted for this panel. */
    private _outcomeSent = false;

    /**
     * Show or replace the creator form panel for a schema command.
     * @param extensionUri - Extension root used for webview resources
     * @param commandPath - ansible-creator command path segments
     * @param schema - Schema definition used to build the form
     */
    public static show(extensionUri: vscode.Uri, commandPath: string[], schema: SchemaNode): void {
        if (CreatorFormPanel.currentPanel) {
            CreatorFormPanel.currentPanel._panel.dispose();
        }

        const title = `Create: ${commandPath.join(' → ')}`;

        const panel = vscode.window.createWebviewPanel(
            'creatorForm',
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
            },
        );

        CreatorFormPanel.currentPanel = new CreatorFormPanel(
            panel,
            extensionUri,
            commandPath,
            schema,
        );
    }

    /**
     * Create the creator form panel and wire webview message handlers.
     *
     * @param panel - Webview panel hosting the creator form.
     * @param extensionUri - Extension root used for webview resources.
     * @param _commandPath - ansible-creator command path segments.
     * @param _schema - Schema definition used to build the form.
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private readonly _commandPath: string[],
        private readonly _schema: SchemaNode,
    ) {
        this._panel = panel;
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
     * Routes incoming webview messages to the appropriate handler.
     *
     * @param msg - Webview message.
     * @param msg.id - Correlation ID for RPC requests.
     * @param msg.method - RPC method name.
     * @param msg.params - Method parameters.
     */
    private async _handleMessage(msg: {
        id?: number;
        method: string;
        params?: Record<string, unknown>;
    }): Promise<void> {
        const { id, method, params } = msg;

        // Fire-and-forget messages
        if (method === 'showToast' && typeof params?.message === 'string') {
            void vscode.window.showInformationMessage(params.message);
            return;
        }
        if (method === 'cancel') {
            // Cancellation telemetry is emitted once from dispose() if no
            // success/error outcome was already recorded.
            this._panel.dispose();
            return;
        }

        // RPC requests
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
     * Dispatches an RPC method to the correct handler.
     *
     * @param method - RPC method name.
     * @param params - Method parameters from the webview.
     * @returns Method result to send back to the webview.
     */
    private async _dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
        switch (method) {
            case 'execute': {
                const commandPath = params.commandPath as string[];
                const values = params.values as Record<string, unknown>;
                await this._executeCommand(commandPath, values);
                return undefined;
            }
            case 'openFile': {
                if (typeof params.path === 'string') {
                    await vscode.commands.executeCommand(
                        'vscode.open',
                        vscode.Uri.file(params.path),
                    );
                }
                return undefined;
            }
            case 'saveViewSettings':
                return undefined;
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    /**
     * Builds and runs the ansible-creator command from submitted form values.
     *
     * @param commandPath - Command path segments.
     * @param values - Form field values keyed by schema parameter name.
     */
    private async _executeCommand(
        commandPath: string[],
        values: Record<string, unknown>,
    ): Promise<void> {
        const startedAt = Date.now();
        const commandKey = commandPath.join('/');
        const args = buildCommandArgs(commandPath, this._schema, values);
        log(`CreatorFormPanel: Executing: ansible-creator ${args.join(' ')}`);

        this._panel.webview.postMessage({
            method: 'executionStarted',
            params: { command: `ansible-creator ${args.join(' ')}` },
        });

        try {
            const commandService = getCommandService();
            const toolPath = await commandService.getToolPath('ansible-creator');
            if (!toolPath) {
                this._panel.webview.postMessage({
                    method: 'executionFinished',
                    params: {
                        exitCode: 1,
                        output: 'ansible-creator not found. Install ansible-dev-tools first.',
                    },
                });
                this._sendCreatorOutcome('error', {
                    startedAt,
                    errorCode: 'tool_missing',
                    command: commandKey,
                });
                return;
            }

            const result = await commandService.runCommandArgs(toolPath, args);
            const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

            this._panel.webview.postMessage({
                method: 'executionFinished',
                params: { exitCode: result.exitCode, output },
            });

            if (result.exitCode === 0) {
                void vscode.window.showInformationMessage(
                    `ansible-creator ${commandPath.join(' ')} completed successfully`,
                );
                this._sendCreatorOutcome('success', { startedAt, command: commandKey });
            } else {
                void vscode.window.showErrorMessage(
                    `ansible-creator ${commandPath.join(' ')} failed (exit code ${String(result.exitCode)})`,
                );
                this._sendCreatorOutcome('error', {
                    startedAt,
                    errorCode: 'exit_nonzero',
                    command: commandKey,
                });
            }
        } catch (error) {
            this._sendCreatorOutcome('error', {
                startedAt,
                errorCode: 'execute_failed',
                command: commandKey,
            });
            throw error;
        }
    }

    /**
     * Emit creator.complete once for this panel.
     *
     * @param result - success | cancel | error
     * @param options - Timing / command / error metadata
     * @param options.startedAt - Epoch ms when execute began
     * @param options.errorCode - Coarse non-PII failure category
     * @param options.command - Creator command path key
     */
    private _sendCreatorOutcome(
        result: 'success' | 'cancel' | 'error',
        options: { startedAt?: number; errorCode?: string; command: string },
    ): void {
        if (this._outcomeSent) return;
        this._outcomeSent = true;
        try {
            TelemetryService.getInstance().sendEvent(
                TelemetryEvents.CREATOR_COMPLETE,
                buildOutcomeProperties(result, {
                    startedAt: options.startedAt,
                    errorCode: options.errorCode,
                    extra: { command: options.command },
                }),
            );
        } catch {
            // Telemetry optional if service not initialized
        }
    }

    /**
     * Generates the HTML shell that loads the shared webview bundle.
     *
     * @param extensionUri - Extension root for resolving resource URIs.
     * @returns HTML document string for the webview.
     */
    private _getHtml(extensionUri: vscode.Uri): string {
        const webviewUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'),
        );
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? './';
        const nonce = getNonce();

        const propsJson = JSON.stringify({
            commandPath: this._commandPath,
            schema: this._schema,
            workspacePath,
        });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>ansible-creator</title>
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
    <div id="root" data-view="creator-form" data-props='${propsJson.replace(/'/g, '&#39;')}'></div>
    <script nonce="${nonce}" src="${webviewUri.toString()}"></script>
</body>
</html>`;
    }

    /** Dispose the panel, listeners, and static current-panel reference. */
    public dispose(): void {
        if (!this._outcomeSent) {
            this._sendCreatorOutcome('cancel', { command: this._commandPath.join('/') });
        }
        CreatorFormPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            x?.dispose();
        }
    }
}

/**
 * Generates a random nonce string for Content Security Policy.
 *
 * @returns 32-character alphanumeric nonce.
 */
function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
