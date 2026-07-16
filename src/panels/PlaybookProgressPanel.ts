/**
 * Thin webview host for PlaybookProgressView.
 * Keeps: socket server, terminal spawning, event forwarding.
 * Delegates: all UI rendering to @ansible/ui PlaybookProgressView.
 */

import * as vscode from 'vscode';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { log } from '@src/extension';
import type { ProgressEvent } from '@ansible/developer-services';
import { buildTaskAnalysisPrompt, buildNavigatorEECommand } from '@ansible/developer-services';
import { openChatWithPrompt } from '@src/features/chatProvider';

/**
 * Single-quote a value for safe interpolation into a POSIX shell command.
 * @param value - The string to quote.
 * @returns Shell-safe single-quoted string.
 */
function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

export interface PlaybookRunOptions {
    playbookPath: string;
    playbookName: string;
    workspaceFolder: vscode.Uri;
    command: string;
    extensionPath: string;
    executor?: 'ansible-playbook' | 'ansible-navigator';
}

/** Thin webview host that streams ansible-playbook events to PlaybookProgressView. */
export class PlaybookProgressPanel {
    private static _currentPanel: PlaybookProgressPanel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _socketServer: net.Server | undefined;
    private _socketPath: string | undefined;
    private _isRunning = false;
    private _terminal: vscode.Terminal | undefined;
    private _lastOptions: PlaybookRunOptions | undefined;

    /**
     * Show or reuse the playbook progress panel and start a new run.
     * @param extensionUri - Extension root used for webview resources
     * @param options - Playbook path, command, and workspace metadata
     * @returns The active progress panel instance
     */
    public static async show(
        extensionUri: vscode.Uri,
        options: PlaybookRunOptions,
    ): Promise<PlaybookProgressPanel> {
        if (PlaybookProgressPanel._currentPanel) {
            PlaybookProgressPanel._currentPanel._panel.reveal();
            await PlaybookProgressPanel._currentPanel._startRun(options);
            return PlaybookProgressPanel._currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'playbookProgress',
            `Playbook: ${options.playbookName}`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
            },
        );

        const progressPanel = new PlaybookProgressPanel(panel, extensionUri, options);
        PlaybookProgressPanel._currentPanel = progressPanel;

        await progressPanel._startRun(options);
        return progressPanel;
    }

    /**
     * Construct the panel, attach message and dispose handlers.
     * @param panel - The VS Code webview panel instance.
     * @param extensionUri - Extension root for resolving resources.
     * @param options - Initial playbook run configuration.
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        options: PlaybookRunOptions,
    ) {
        this._panel = panel;
        this._panel.webview.html = this._getHtml(extensionUri, options);

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
     * Route incoming webview messages to the appropriate handler.
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
        const { method, params } = msg;

        switch (method) {
            case 'toggleTerminal':
                if (this._terminal) {
                    const active = vscode.window.activeTerminal;
                    if (active === this._terminal) {
                        this._terminal.hide();
                    } else {
                        this._terminal.show();
                    }
                }
                break;
            case 'stopPlaybook':
                if (this._terminal && this._isRunning) {
                    this._terminal.sendText('\x03', false);
                    this._isRunning = false;
                    void this._panel.webview.postMessage({ method: 'playbookStopped' });
                }
                break;
            case 'rerun':
                if (this._lastOptions) {
                    await this._startRun(this._lastOptions);
                }
                break;
            case 'editSource':
                if (typeof params?.path === 'string') {
                    const lastColon = params.path.lastIndexOf(':');
                    const filePath = lastColon > 0 ? params.path.slice(0, lastColon) : params.path;
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
                }
                break;
            case 'analyzeWithAi':
                if (params?.data) {
                    void this._generateAiPrompt(params.data as Record<string, unknown>);
                }
                break;
            case 'showToast':
                if (typeof params?.message === 'string') {
                    void vscode.window.showInformationMessage(params.message);
                }
                break;
        }
    }

    /**
     * Start (or restart) a playbook run: create socket server, spawn terminal.
     * @param options - Playbook run configuration.
     */
    private async _startRun(options: PlaybookRunOptions): Promise<void> {
        this._lastOptions = options;
        this._isRunning = true;
        this._panel.title = `Playbook: ${options.playbookName}`;

        if (this._socketServer) {
            this._socketServer.close();
            this._socketServer = undefined;
        }
        if (this._socketPath) {
            try {
                fs.unlinkSync(this._socketPath);
            } catch {
                /* ignore */
            }
        }

        await this._createSocketServer();

        const callbackPath = path.join(options.extensionPath, 'resources', 'callback_plugins');
        const executorLabel =
            options.executor === 'ansible-navigator' ? 'ansible-navigator' : 'ansible-playbook';
        log(
            `PlaybookProgress: Starting with socket ${this._socketPath ?? ''} (executor: ${executorLabel})`,
        );

        const { TerminalService } = await import('../services/TerminalService');
        const terminalService = TerminalService.getInstance();

        const managed = await terminalService.createActivatedTerminal({
            name: `${executorLabel}: ${options.playbookName}`,
            cwd: options.workspaceFolder,
            show: false,
        });

        this._terminal = managed.terminal;

        // For the progress viewer, we force --execution-environment false on
        // navigator commands. The env-var prefix (ANSIBLE_CALLBACK_PLUGINS,
        // ANSIBLE_ENV_SOCKET) only works when ansible-playbook runs on the
        // host — env vars don't cross the container boundary. The EE volume-
        // mount path (_startNavigatorEERun) handles the containerized case
        // but is reserved for future use.
        let terminalCommand = options.command;
        if (options.executor === 'ansible-navigator') {
            terminalCommand = this._injectNavigatorNoEE(terminalCommand);
        }

        managed.terminal.sendText(
            `ANSIBLE_CALLBACK_PLUGINS=${shellQuote(callbackPath)} ` +
                `ANSIBLE_CALLBACKS_ENABLED=vscode_progress ` +
                `ANSIBLE_ENV_SOCKET=${shellQuote(this._socketPath ?? '')} ` +
                terminalCommand,
        );
    }

    /**
     * Insert `--execution-environment false` into an ansible-navigator command
     * so the playbook runs on the host (not in a container). Placed before the
     * `--` passthrough separator if one exists.
     */
    private _injectNavigatorNoEE(command: string): string {
        const eeFlag = '--execution-environment false';
        const separatorIdx = command.indexOf(' -- ');
        if (separatorIdx !== -1) {
            return (
                command.slice(0, separatorIdx) +
                ` ${eeFlag}` +
                command.slice(separatorIdx)
            );
        }
        return `${command} ${eeFlag}`;
    }

    /**
     * Start a navigator run with EE volume mounts for the callback plugin and socket.
     * Used when ansible-navigator runs with execution environments enabled, where
     * shell env vars don't cross the container boundary.
     *
     * @param terminal - VS Code terminal to send the command to.
     * @param options - Playbook run configuration.
     * @param callbackPath - Host path to the callback plugin directory.
     */
    private async _startNavigatorEERun(
        terminal: vscode.Terminal,
        options: PlaybookRunOptions,
        callbackPath: string,
    ): Promise<void> {
        const socketDir = path.dirname(this._socketPath ?? '');
        const containerCallbackPath = '/tmp/vscode-callback-plugins';
        const containerSocketDir = '/tmp/vscode-ansible-progress';
        const containerSocketPath = path.join(
            containerSocketDir,
            path.basename(this._socketPath ?? ''),
        );

        const { PlaybooksService } = await import('../services/PlaybooksService');
        const playbooksService = PlaybooksService.getInstance();
        const workspaceFolderPath = options.workspaceFolder.fsPath;
        const playbookRelativePath = path.relative(workspaceFolderPath, options.playbookPath);
        const config = playbooksService.getPlaybookConfig(playbookRelativePath);

        const command = buildNavigatorEECommand(playbookRelativePath, config, {
            volumeMounts: [
                { src: callbackPath, dest: containerCallbackPath, options: 'ro' },
                { src: socketDir, dest: containerSocketDir, options: 'Z' },
            ],
            setEnvVars: {
                ANSIBLE_CALLBACK_PLUGINS: containerCallbackPath,
                ANSIBLE_CALLBACKS_ENABLED: 'vscode_progress',
                ANSIBLE_ENV_SOCKET: containerSocketPath,
            },
        });

        terminal.sendText(command);
    }

    /** Create a Unix socket server to receive callback plugin events. */
    private async _createSocketServer(): Promise<void> {
        if (this._socketServer) {
            this._socketServer.close();
        }

        const socketDir = path.join(os.tmpdir(), 'vscode-ansible-progress');
        if (!fs.existsSync(socketDir)) {
            fs.mkdirSync(socketDir, { recursive: true });
        }
        this._socketPath = path.join(socketDir, `run-${String(Date.now())}.sock`);

        try {
            if (fs.existsSync(this._socketPath)) {
                fs.unlinkSync(this._socketPath);
            }
        } catch {
            /* ignore */
        }

        return new Promise((resolve, reject) => {
            this._socketServer = net.createServer((socket) => {
                let buffer = '';

                socket.on('data', (data) => {
                    buffer += data.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const event = JSON.parse(line) as ProgressEvent;
                                this._handleEvent(event);
                            } catch (e) {
                                log(
                                    `PlaybookProgress: Failed to parse event: ${e instanceof Error ? e.message : String(e)}`,
                                );
                            }
                        }
                    }
                });

                socket.on('error', (err) => {
                    log(
                        `PlaybookProgress: Socket error: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
            });

            this._socketServer.on('error', (err) => {
                log(
                    `PlaybookProgress: Server error: ${err instanceof Error ? err.message : String(err)}`,
                );
                reject(err);
            });

            this._socketServer.listen(this._socketPath, () => {
                log(`PlaybookProgress: Socket server listening on ${this._socketPath ?? ''}`);
                resolve();
            });
        });
    }

    /**
     * Forward a parsed progress event to the webview, tracking run completion.
     * @param event - The progress event from the callback plugin.
     */
    private _handleEvent(event: ProgressEvent): void {
        if (event.type === 'playbook_complete') {
            this._isRunning = false;
        }

        void this._panel.webview.postMessage({
            method: 'progressEvent',
            params: event,
        });
    }

    /**
     * Build and send an AI analysis prompt for a task execution result.
     * @param data - Task execution data from the webview.
     */
    private async _generateAiPrompt(data: Record<string, unknown>): Promise<void> {
        const args = data.args != null ? (data.args as Record<string, unknown>) : {};
        const result = data.result != null ? (data.result as Record<string, unknown>) : {};
        const prompt = buildTaskAnalysisPrompt({
            taskName: typeof data.taskName === 'string' ? data.taskName : '',
            module: typeof data.module === 'string' ? data.module : '',
            host: typeof data.host === 'string' ? data.host : '',
            status: typeof data.status === 'string' ? data.status : '',
            args,
            result,
            path: typeof data.path === 'string' ? data.path : undefined,
        });

        await openChatWithPrompt(prompt);
    }

    /**
     * Generate the webview HTML shell with CSP and injected props.
     * @param extensionUri - Extension root for resolving resource URIs.
     * @param options - Playbook run configuration for embedding in data attrs.
     * @returns Complete HTML string for the webview content.
     */
    private _getHtml(extensionUri: vscode.Uri, options: PlaybookRunOptions): string {
        const webviewUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'),
        );
        const nonce = getNonce();

        const propsJson = JSON.stringify({
            playbookName: options.playbookName,
            playbookPath: options.playbookPath,
            workspacePath: options.workspaceFolder.fsPath,
        });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Playbook Progress</title>
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
            overflow: hidden;
        }
        #root { height: 100vh; }
    </style>
</head>
<body>
    <div id="root" data-view="playbook-progress" data-props='${propsJson.replace(/'/g, '&#39;')}'></div>
    <script nonce="${nonce}" src="${webviewUri.toString()}"></script>
</body>
</html>`;
    }

    /** Dispose the panel, socket server, and static reference. */
    public dispose(): void {
        PlaybookProgressPanel._currentPanel = undefined;

        if (this._socketServer) {
            this._socketServer.close();
            this._socketServer = undefined;
        }
        if (this._socketPath) {
            try {
                fs.unlinkSync(this._socketPath);
            } catch {
                /* ignore */
            }
            this._socketPath = undefined;
        }

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
