/**
 * Cursor-safe Getting Started UI backed by contributes.walkthroughs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TelemetryEvents } from '@ansible/common';
import type { TelemetryService } from '@src/services/TelemetryService';
import {
    buildWalkthroughHtml,
    getContributedWalkthrough,
    walkthroughFqn,
    type ExtensionPackageJson,
    type WalkthroughContribution,
} from '@src/features/walkthroughContent';

export const GETTING_STARTED_COMMAND = 'ansible.walkthrough.openGettingStarted';
export const DEFAULT_WALKTHROUGH_ID = 'ansible-getting-started';

/**
 * Register the palette / status-bar command that opens Getting Started.
 *
 * @param context - Extension context
 * @param telemetry - Telemetry service for walkthrough.open
 * @returns void
 */
export function registerGettingStarted(
    context: vscode.ExtensionContext,
    telemetry: TelemetryService,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(GETTING_STARTED_COMMAND, (walkthroughId?: string) => {
            openGettingStarted(context, telemetry, walkthroughId);
        }),
    );
}

/**
 * Open the getting-started panel for a contributed walkthrough.
 *
 * @param context - Extension context
 * @param telemetry - Telemetry service
 * @param walkthroughId - Short id or FQN; defaults to ansible-getting-started
 * @returns void
 */
export function openGettingStarted(
    context: vscode.ExtensionContext,
    telemetry: TelemetryService,
    walkthroughId: string = DEFAULT_WALKTHROUGH_ID,
): void {
    const packageJson = context.extension.packageJSON as ExtensionPackageJson;
    const walkthrough = getContributedWalkthrough(packageJson, walkthroughId);
    if (!walkthrough) {
        void vscode.window.showErrorMessage(`Ansible walkthrough not found: ${walkthroughId}`);
        return;
    }

    const fqn = walkthroughFqn(packageJson, walkthrough.id);
    telemetry.sendEvent(TelemetryEvents.WALKTHROUGH_OPEN, { walkthroughId: fqn });

    GettingStartedPanel.show(context, walkthrough);
}

/**
 * Thin webview host that renders a contributed walkthrough.
 */
class GettingStartedPanel {
    private static _current: GettingStartedPanel | undefined;
    private readonly _disposables: vscode.Disposable[] = [];

    /**
     * @param _panel - Webview panel
     */
    private constructor(private readonly _panel: vscode.WebviewPanel) {
        this._panel.onDidDispose(
            () => {
                GettingStartedPanel._current = undefined;
                while (this._disposables.length) {
                    this._disposables.pop()?.dispose();
                }
            },
            null,
            this._disposables,
        );
    }

    /**
     * Show (or reveal) the getting-started panel for a walkthrough.
     *
     * @param context - Extension context for media paths
     * @param walkthrough - Contribution from package.json
     * @returns void
     */
    public static show(
        context: vscode.ExtensionContext,
        walkthrough: WalkthroughContribution,
    ): void {
        if (GettingStartedPanel._current) {
            GettingStartedPanel._current._panel.reveal(vscode.ViewColumn.One);
            GettingStartedPanel._current._render(context, walkthrough);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'ansibleGettingStarted',
            walkthrough.title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                enableCommandUris: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri],
            },
        );
        panel.iconPath = new vscode.ThemeIcon('rocket');
        GettingStartedPanel._current = new GettingStartedPanel(panel);
        GettingStartedPanel._current._render(context, walkthrough);
    }

    /**
     * @param context - Extension context
     * @param walkthrough - Walkthrough contribution
     * @returns void
     */
    private _render(context: vscode.ExtensionContext, walkthrough: WalkthroughContribution): void {
        const mediaByPath: Record<string, string> = {};
        for (const step of walkthrough.steps) {
            const rel = step.media?.markdown;
            if (!rel || mediaByPath[rel]) continue;
            const abs = path.join(context.extensionPath, rel);
            try {
                mediaByPath[rel] = fs.readFileSync(abs, 'utf8');
            } catch {
                mediaByPath[rel] = '';
            }
        }

        const nonce = getNonce();
        this._panel.title = walkthrough.title;
        this._panel.webview.html = buildWalkthroughHtml(walkthrough, mediaByPath, nonce);
    }
}

/**
 * @returns Random CSP nonce
 */
function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
