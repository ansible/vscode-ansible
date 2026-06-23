import * as vscode from 'vscode';
import { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import { isAnsibleEditor, type AnsibleEnvironmentInfo } from '@src/statusBar/statusBarUtils';
import { log } from '@src/extension';

const COMMAND_ID = 'ansible.statusBar.pythonClick';

/**
 * Status bar item displaying the active Python environment for Ansible.
 *
 * Visible only when an Ansible file is open. Clicking opens a QuickPick
 * with environment details and actions (change, refresh) instead of relying
 * on hover tooltips which are unreliable across platforms.
 *
 * Exposes {@link getEnvironmentInfo} for telemetry consumption.
 */
export class PythonStatusBar implements vscode.Disposable {
    private readonly _item: vscode.StatusBarItem;
    private readonly _disposables: vscode.Disposable[] = [];
    private _cachedDisplayName?: string;
    private _cachedVersion?: string;
    private _cachedPath?: string;

    /**
     * Create and register the Python environment status bar item.
     * @param context - Extension context for subscription lifecycle.
     * @param _envService - Python environment service for querying the active env.
     */
    constructor(
        context: vscode.ExtensionContext,
        private readonly _envService: PythonEnvironmentService,
    ) {
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._item.command = COMMAND_ID;
        context.subscriptions.push(this._item);

        this._disposables.push(
            vscode.commands.registerCommand(COMMAND_ID, () => {
                void this._showQuickPick();
            }),
        );

        this._disposables.push(
            this._envService.onDidChangeEnvironment(() => {
                void this.update();
            }),
        );

        context.subscriptions.push(...this._disposables);
        void this.update();
    }

    /**
     * Refresh the status bar text and visibility based on the current
     * Python environment and active editor.
     */
    public async update(): Promise<void> {
        if (!isAnsibleEditor(vscode.window.activeTextEditor)) {
            this._item.hide();
            return;
        }

        try {
            const activeUri = vscode.window.activeTextEditor?.document.uri;
            const env = await this._envService.getEnvironment(activeUri);
            if (env) {
                this._cachedDisplayName = env.displayName || env.name;
                this._cachedVersion = env.version;
                this._cachedPath = env.execInfo.run.executable;

                this._item.text = `$(python) ${this._cachedDisplayName}`;
                this._item.backgroundColor = undefined;
            } else {
                this._cachedDisplayName = undefined;
                this._cachedVersion = undefined;
                this._cachedPath = undefined;

                this._item.text = '$(warning) Select Python';
                this._item.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.warningBackground',
                );
            }
            this._item.show();
        } catch (e: unknown) {
            log(`PythonStatusBar update failed: ${e instanceof Error ? e.message : String(e)}`);
            this._item.hide();
        }
    }

    /**
     * Returns cached Python environment data for telemetry or other consumers.
     * @returns Partial environment info with Python-specific fields populated.
     */
    public getEnvironmentInfo(): Partial<AnsibleEnvironmentInfo> {
        return {
            pythonEnvDisplayName: this._cachedDisplayName,
            pythonVersion: this._cachedVersion,
            pythonEnvPath: this._cachedPath,
        };
    }

    /**
     * Show a QuickPick with Python environment details and actions.
     */
    private async _showQuickPick(): Promise<void> {
        const items: vscode.QuickPickItem[] = [];

        if (this._cachedDisplayName) {
            items.push({
                label: `$(python) ${this._cachedDisplayName}`,
                description: this._cachedVersion ? `v${this._cachedVersion}` : '',
                detail: this._cachedPath,
                kind: vscode.QuickPickItemKind.Default,
            });
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        }

        items.push({
            label: '$(gear) Change Python Environment',
            description: 'Select a different Python interpreter',
        });
        items.push({
            label: '$(refresh) Refresh Environment',
            description: 'Re-read the current environment',
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Python Environment',
            placeHolder: 'Select an action',
        });

        if (!selected) return;

        if (selected.label.includes('Change Python')) {
            void vscode.commands.executeCommand('python-envs.select');
        } else if (selected.label.includes('Refresh')) {
            void this.update();
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
