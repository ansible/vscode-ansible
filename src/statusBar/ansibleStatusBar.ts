import * as vscode from 'vscode';
import { LanguageClient, NotificationType } from 'vscode-languageclient/node';
import type { AnsibleEnvironmentInfo } from '@src/statusBar/statusBarUtils';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import { log } from '@src/extension';

const METADATA_NOTIFICATION = 'update/ansible-metadata';
const LOADING_TIMEOUT_MS = 15_000;

/**
 * Raw metadata received from the Ansible Language Server via the
 * `update/ansible-metadata` notification. The server returns an array
 * of these; we use the first entry.
 */
interface AnsibleMetadata {
    /** Ansible core version (e.g., "2.17.0"). */
    ansibleVersion?: string;
    /** Python version used by ansible (e.g., "3.12.5"). */
    pythonVersion?: string;
    /** ansible-lint version, absent when not installed. */
    ansibleLintVersion?: string;
    /** Whether an Execution Environment is active. */
    executionEnvironmentEnabled?: boolean;
    /** Additional key-value pairs the server may include. */
    [key: string]: unknown;
}

/**
 * Unified Ansible status bar item — the single entry point for all
 * Ansible-related status in the editor footer.
 *
 * Always visible when a workspace is open. Displays the Ansible logo
 * icon; background color reflects tool health (green when healthy,
 * warning when ansible-lint is missing, error when ansible is not
 * found). Hovering shows a Markdown tooltip with clickable command
 * links for quick actions (sidebar, diagnostics, LLM config, output
 * log, refresh).
 *
 * Exposes {@link getMetadata} and {@link getEnvironmentInfo} for
 * telemetry and the diagnostics panel.
 */
export class AnsibleStatusBar implements vscode.Disposable {
    private readonly _item: vscode.StatusBarItem;
    private readonly _disposables: vscode.Disposable[] = [];
    private _metadata: AnsibleMetadata | undefined;
    private _loading = false;
    private _loadingTimer: ReturnType<typeof setTimeout> | undefined;
    private _lastRequestedUri: string | undefined;
    private _cachedPythonName?: string;
    private _cachedPythonVersion?: string;
    private _cachedPythonPath?: string;

    /**
     * Create and register the unified Ansible status bar item.
     * @param context - Extension context for subscription lifecycle.
     * @param _client - Language client for server communication.
     * @param _envService - Python environment service for env info.
     */
    constructor(
        context: vscode.ExtensionContext,
        private readonly _client: LanguageClient,
        private readonly _envService: PythonEnvironmentService,
    ) {
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._item.command = 'ansible.showDiagnostics';
        context.subscriptions.push(this._item);

        this._disposables.push(this._registerNotificationHandler());

        this._disposables.push(
            this._envService.onDidChangeEnvironment(() => {
                this.forceRefresh();
            }),
        );

        context.subscriptions.push(...this._disposables);
        void this._updatePythonCache();
        this.update();
    }

    /**
     * Register the handler for metadata notifications from the language
     * server. Returns a disposable for cleanup.
     * @returns Disposable that unregisters the notification handler.
     */
    private _registerNotificationHandler(): vscode.Disposable {
        return this._client.onNotification(
            new NotificationType<AnsibleMetadata[]>(METADATA_NOTIFICATION),
            (dataList: AnsibleMetadata[]) => {
                if (dataList.length > 0) {
                    this._metadata = dataList[0];
                    this._loading = false;
                    if (this._loadingTimer) {
                        clearTimeout(this._loadingTimer);
                        this._loadingTimer = undefined;
                    }
                    this._render();
                }
            },
        );
    }

    /**
     * Refresh the status bar for the current editor. Requests fresh
     * metadata from the LS when the active Ansible file changes.
     * Always shows the item regardless of editor language.
     */
    public update(): void {
        const editor = vscode.window.activeTextEditor;
        const isAnsible = editor?.document.languageId === 'ansible';

        if (isAnsible) {
            const activeUri = editor.document.uri.toString();
            if (activeUri !== this._lastRequestedUri) {
                this._metadata = undefined;
                this._lastRequestedUri = activeUri;
                void this._requestMetadata(activeUri);
            }
        }

        this._render();
    }

    /**
     * Force a metadata re-fetch regardless of cache state.
     * Called when Python environment changes or user clicks "Refresh".
     */
    public forceRefresh(): void {
        this._metadata = undefined;
        this._lastRequestedUri = undefined;
        void this._updatePythonCache();
        this.update();
    }

    /**
     * Whether the language client is currently running.
     * @returns True when the language server connection is active.
     */
    public isLanguageServerRunning(): boolean {
        return this._client.isRunning();
    }

    /**
     * Returns cached Ansible metadata for telemetry or other consumers.
     * @returns Partial environment info with Ansible-specific fields populated.
     */
    public getMetadata(): Partial<AnsibleEnvironmentInfo> {
        return {
            ansibleVersion: this._metadata?.ansibleVersion,
            pythonVersion: this._metadata?.pythonVersion,
            ansibleLintVersion: this._metadata?.ansibleLintVersion,
            executionEnvironmentEnabled: this._metadata?.executionEnvironmentEnabled,
        };
    }

    /**
     * Returns cached Python environment data for telemetry or diagnostics.
     * @returns Partial environment info with Python-specific fields populated.
     */
    public getEnvironmentInfo(): Partial<AnsibleEnvironmentInfo> {
        return {
            pythonEnvDisplayName: this._cachedPythonName,
            pythonVersion: this._cachedPythonVersion,
            pythonEnvPath: this._cachedPythonPath,
        };
    }

    /**
     * Send an `update/ansible-metadata` notification to the language server.
     * The response arrives asynchronously via the notification handler.
     * @param fileUri - The URI of the active file to fetch metadata for.
     */
    private async _requestMetadata(fileUri: string): Promise<void> {
        if (!this._client.isRunning()) {
            return;
        }

        this._loading = true;
        this._render();

        if (this._loadingTimer) clearTimeout(this._loadingTimer);
        this._loadingTimer = setTimeout(() => {
            if (this._loading) {
                this._loading = false;
                this._render();
            }
        }, LOADING_TIMEOUT_MS);

        try {
            await this._client.sendNotification(
                new NotificationType<string[]>(METADATA_NOTIFICATION),
                [fileUri],
            );
        } catch (e: unknown) {
            log(
                `AnsibleStatusBar metadata request failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            this._loading = false;
            this._render();
        }
    }

    /**
     * Refresh the cached Python environment info from the env service.
     */
    private async _updatePythonCache(): Promise<void> {
        try {
            const activeUri =
                vscode.window.activeTextEditor?.document.uri ??
                vscode.workspace.workspaceFolders?.[0]?.uri;
            const env = await this._envService.getEnvironment(activeUri);
            if (env) {
                this._cachedPythonName = env.displayName || env.name;
                this._cachedPythonVersion = env.version;
                this._cachedPythonPath = env.execInfo.run.executable;
            } else {
                this._cachedPythonName = undefined;
                this._cachedPythonVersion = undefined;
                this._cachedPythonPath = undefined;
            }
        } catch (e: unknown) {
            log(
                `AnsibleStatusBar Python cache update failed: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
        this._render();
    }

    /**
     * Update the status bar item text, tooltip, and background from
     * current state. Always visible — shows Ansible logo with version
     * when available. Tooltip shows a rich Markdown summary with
     * clickable action links.
     */
    private _render(): void {
        const editor = vscode.window.activeTextEditor;
        const isAnsible = editor?.document.languageId === 'ansible';

        if (isAnsible && this._loading && !this._metadata) {
            this._item.text = '$(sync~spin)';
            this._item.tooltip = 'Loading Ansible metadata…';
            this._item.backgroundColor = undefined;
            this._item.show();
            return;
        }

        const meta = this._metadata;
        if (isAnsible && meta && !meta.ansibleVersion) {
            this._item.text = '$(ansible-logo)';
            this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (isAnsible && meta?.ansibleVersion && !meta.ansibleLintVersion) {
            this._item.text = '$(ansible-logo)';
            this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this._item.text = '$(ansible-logo)';
            this._item.backgroundColor = undefined;
        }

        this._item.tooltip = this._buildTooltip();
        this._item.show();
    }

    /**
     * Build a rich MarkdownString tooltip with status summary and
     * clickable command links for quick actions.
     * @returns MarkdownString tooltip for the status bar item.
     */
    private _buildTooltip(): vscode.MarkdownString {
        const llmCmd = 'ansibleEnvironments.configureLlmProvider';
        const sidebarCmd = 'workbench.view.extension.ansible-environments';

        const md = new vscode.MarkdownString('', true);
        md.isTrusted = {
            enabledCommands: [
                sidebarCmd,
                'ansible.showDiagnostics',
                llmCmd,
                'ansible.open-output',
                'ansible.statusBar.refresh',
            ],
        };

        md.appendMarkdown(`$(list-tree) [Open Sidebar](command:${sidebarCmd})\n\n`);
        md.appendMarkdown(`$(pulse) [Diagnostics](command:ansible.showDiagnostics)\n\n`);
        md.appendMarkdown(`$(hubot) [Configure LLM](command:${llmCmd})\n\n`);
        md.appendMarkdown(`$(output) [Output Log](command:ansible.open-output)\n\n`);
        md.appendMarkdown(`$(refresh) [Refresh](command:ansible.statusBar.refresh)`);

        return md;
    }

    /**
     * Dispose all owned resources.
     */
    public dispose(): void {
        if (this._loadingTimer) clearTimeout(this._loadingTimer);
        this._item.dispose();
        for (const d of this._disposables) d.dispose();
    }
}
