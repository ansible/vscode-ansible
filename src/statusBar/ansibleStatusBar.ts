import * as vscode from 'vscode';
import { LanguageClient, NotificationType } from 'vscode-languageclient/node';
import { isAnsibleEditor, type AnsibleEnvironmentInfo } from '@src/statusBar/statusBarUtils';
import { log, outputChannel } from '@src/extension';
import { getCommandService } from '@ansible/services';

const COMMAND_ID = 'ansible.statusBar.ansibleClick';
const METADATA_NOTIFICATION = 'update/ansible-metadata';

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
 * A single tool entry parsed from `adt --version` output.
 */
interface AdtToolEntry {
    /** Tool name (e.g., "ansible-core"). */
    name: string;
    /** Version string (e.g., "2.19.11"). */
    version: string;
}

/**
 * Status bar item displaying the Ansible version and tool health.
 *
 * Communicates with the language server to fetch metadata for the active
 * file. Visible only when an Ansible file is open. Clicking opens a
 * QuickPick with detailed version info, ADT tool inventory, and actions
 * (resync, open output).
 *
 * Exposes {@link getMetadata} for telemetry consumption.
 */
export class AnsibleStatusBar implements vscode.Disposable {
    private readonly _item: vscode.StatusBarItem;
    private readonly _disposables: vscode.Disposable[] = [];
    private _metadata: AnsibleMetadata | undefined;
    private _loading = false;
    private _lastRequestedUri: string | undefined;
    private _adtTools: AdtToolEntry[] | undefined;
    private _adtFetched = false;

    /**
     * Create and register the Ansible metadata status bar item.
     * @param context - Extension context for subscription lifecycle.
     * @param _client - Language client for server communication.
     */
    constructor(
        context: vscode.ExtensionContext,
        private readonly _client: LanguageClient,
    ) {
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        this._item.command = COMMAND_ID;
        context.subscriptions.push(this._item);

        this._disposables.push(
            vscode.commands.registerCommand(COMMAND_ID, () => {
                void this._showQuickPick();
            }),
        );

        this._registerNotificationHandler();
        context.subscriptions.push(...this._disposables);
        this.update();
    }

    /**
     * Register the handler for metadata notifications from the language
     * server. Fires each time the LS responds with updated metadata.
     */
    private _registerNotificationHandler(): void {
        this._client.onNotification(
            new NotificationType<AnsibleMetadata[]>(METADATA_NOTIFICATION),
            (dataList: AnsibleMetadata[]) => {
                if (dataList.length > 0) {
                    this._metadata = dataList[0];
                    this._loading = false;
                    this._render();
                }
            },
        );
    }

    /**
     * Refresh the status bar for the current editor. Only requests fresh
     * metadata from the LS when the active file changes. Re-renders from
     * cache for the same file to avoid spinner flicker.
     */
    public update(): void {
        if (!isAnsibleEditor(vscode.window.activeTextEditor)) {
            this._item.hide();
            return;
        }

        const activeUri = vscode.window.activeTextEditor?.document.uri.toString();
        if (activeUri && activeUri !== this._lastRequestedUri) {
            this._lastRequestedUri = activeUri;
            void this._requestMetadata(activeUri);
        }

        this._render();
    }

    /**
     * Force a metadata re-fetch regardless of cache state.
     * Called when Python environment changes or user clicks "Resync".
     */
    public forceRefresh(): void {
        this._metadata = undefined;
        this._lastRequestedUri = undefined;
        this._adtTools = undefined;
        this._adtFetched = false;
        this.update();
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
     * Fetch the ADT tool inventory by running `adt --version`.
     * Caches the result; only runs once per env change cycle.
     * @returns Array of tool entries, or undefined if adt is not available.
     */
    private async _fetchAdtTools(): Promise<AdtToolEntry[] | undefined> {
        if (this._adtFetched && this._adtTools) {
            return this._adtTools;
        }

        try {
            const cmdService = getCommandService();
            const result = await cmdService.runTool('adt', ['--version']);
            if (result.exitCode !== 0 || !result.stdout) {
                return undefined;
            }

            const tools: AdtToolEntry[] = [];
            for (const line of result.stdout.split('\n')) {
                const match = /^(\S+)\s+([\d.]+\S*)/.exec(line.trim());
                if (match) {
                    tools.push({ name: match[1], version: match[2] });
                }
            }
            this._adtTools = tools.length > 0 ? tools : undefined;
            return this._adtTools;
        } catch {
            return undefined;
        }
    }

    /**
     * Fetch Python version via `python3 --version` as a fallback when
     * LS metadata is not yet available.
     * @returns Version string (e.g., "3.12.5") or undefined.
     */
    private async _fetchPythonVersion(): Promise<string | undefined> {
        try {
            const cmdService = getCommandService();
            const result = await cmdService.runTool('python3', ['--version']);
            if (result.exitCode === 0 && result.stdout) {
                const match = /Python\s+([\d.]+)/.exec(result.stdout);
                return match ? match[1] : undefined;
            }
        } catch {
            // python3 not available
        }
        return undefined;
    }

    /**
     * Update the status bar item text and background from current state.
     */
    private _render(): void {
        if (!isAnsibleEditor(vscode.window.activeTextEditor)) {
            this._item.hide();
            return;
        }

        if (this._loading && !this._metadata) {
            this._item.text = '$(sync~spin) Ansible';
            this._item.backgroundColor = undefined;
            this._item.show();
            return;
        }

        const meta = this._metadata;
        if (!meta?.ansibleVersion) {
            this._item.text = '$(error) Ansible';
            this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this._item.show();
            return;
        }

        const eeTag = meta.executionEnvironmentEnabled ? ' [EE]' : '';
        if (meta.ansibleLintVersion) {
            this._item.text = `$(ansible-logo)${eeTag} ${meta.ansibleVersion}`;
            this._item.backgroundColor = undefined;
        } else {
            this._item.text = `$(warning)${eeTag} ${meta.ansibleVersion}`;
            this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }

        this._item.show();
    }

    /**
     * Show a QuickPick with Ansible environment details, ADT tool
     * inventory, and actions.
     */
    private async _showQuickPick(): Promise<void> {
        const meta = this._metadata;
        const items: vscode.QuickPickItem[] = [];

        // Tool versions — prefer ADT inventory when available, fall back to LS metadata
        const adtTools = await this._fetchAdtTools();

        if (adtTools && adtTools.length > 0) {
            // Python version from LS metadata or python --version
            const pythonVer = meta?.pythonVersion ?? (await this._fetchPythonVersion());
            if (pythonVer) {
                items.push({
                    label: `$(python) Python: ${pythonVer}`,
                });
            }
            items.push({ label: 'Ansible Dev Tools', kind: vscode.QuickPickItemKind.Separator });
            for (const tool of adtTools) {
                const displayName = tool.name === 'ansible-core' ? 'Ansible Core' : tool.name;
                items.push({
                    label: `$(package) ${displayName}`,
                    description: tool.version,
                });
            }
        } else {
            if (meta?.ansibleVersion) {
                items.push({
                    label: `$(bracket-dot) Ansible Core: ${meta.ansibleVersion}`,
                    description: meta.executionEnvironmentEnabled ? 'Execution Environment' : '',
                });
            } else {
                items.push({
                    label: '$(error) Ansible not found',
                    description: 'Check your Python environment',
                });
            }

            if (meta?.pythonVersion) {
                items.push({
                    label: `$(python) Python: ${meta.pythonVersion}`,
                });
            }

            if (meta?.ansibleLintVersion) {
                items.push({
                    label: `$(check) ansible-lint: ${meta.ansibleLintVersion}`,
                });
            } else {
                items.push({
                    label: '$(warning) ansible-lint: not found',
                    description: 'Install for playbook validation',
                });
            }
        }

        // Actions
        items.push({ label: 'Actions', kind: vscode.QuickPickItemKind.Separator });

        items.push({
            label: '$(refresh) Resync Metadata',
            description: 'Re-fetch version info from language server',
        });
        items.push({
            label: '$(output) Open Ansible Output',
            description: 'View extension logs',
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Ansible Environment',
            placeHolder: 'Select an action',
        });

        if (!selected) return;

        if (selected.label.includes('Resync')) {
            this.forceRefresh();
        } else if (selected.label.includes('Open Ansible Output')) {
            outputChannel.show();
        }
    }

    /**
     * Dispose all owned resources.
     */
    public dispose(): void {
        this._item.dispose();
        for (const d of this._disposables) d.dispose();
    }
}
