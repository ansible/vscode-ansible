import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import { isError } from '../errors';
import type { TelemetryReporter } from '../telemetry';
import { LightspeedEvents } from '../telemetry';
import { getWebviewHtml } from './panelUtils';
import crypto from 'crypto';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

/**
 *
 */
export class PlaybookGenPanel {
    public static currentPanel: PlaybookGenPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    /**
     * Create a new PlaybookGenPanel instance.
     * @param panel - The webview panel to wrap.
     * @param api - Lightspeed API client for generation requests.
     * @param telemetry - Telemetry reporter for event tracking.
     * @param log - Logging function for diagnostic output.
     * @param extensionUri - Root URI of the extension for resolving webview resources.
     */
    private constructor(
        panel: vscode.WebviewPanel,
        private readonly api: LightspeedAPI,
        private readonly telemetry: TelemetryReporter,
        private readonly log: LogFn,
        extensionUri: vscode.Uri,
    ) {
        this._panel = panel;
        this._panel.webview.html = getWebviewHtml(
            extensionUri,
            this._panel.webview,
            'playbook-generation',
        );

        this._panel.onDidDispose(
            () => {
                this.dispose();
            },
            null,
            this._disposables,
        );
        this._panel.webview.onDidReceiveMessage(
            (msg: unknown) => this._handleMessage(msg as { type?: string; data?: unknown }),
            null,
            this._disposables,
        );
    }

    /**
     * Show an existing panel or create a new one.
     * @param extensionUri - Root URI of the extension for resolving webview resources.
     * @param api - Lightspeed API client for generation requests.
     * @param telemetry - Telemetry reporter for event tracking.
     * @param log - Logging function for diagnostic output.
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        api: LightspeedAPI,
        telemetry: TelemetryReporter,
        log: LogFn,
    ) {
        if (PlaybookGenPanel.currentPanel) {
            PlaybookGenPanel.currentPanel._panel.reveal(vscode.ViewColumn.Active);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'lightspeedPlaybookGen',
            'Generate Ansible Playbook',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                enableCommandUris: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'packages', 'lightspeed', 'dist'),
                ],
            },
        );

        PlaybookGenPanel.currentPanel = new PlaybookGenPanel(
            panel,
            api,
            telemetry,
            log,
            extensionUri,
        );
    }

    /**
     * Handle incoming webview messages and dispatch by type.
     * @param message - The message object received from the webview.
     * @param message.type - The message type identifier.
     * @param message.data - The message payload.
     */
    private async _handleMessage(message: { type?: string; data?: unknown }) {
        const type = message.type;
        const data = message.data as Record<string, unknown> | undefined;
        this.log('debug', `[playbookGen] Received message: type=${type ?? 'undefined'}`);

        switch (type) {
            case 'generatePlaybook': {
                const text = data?.text as string;
                const outline = data?.outline as string | undefined;
                if (!text) {
                    this.log('error', '[playbookGen] generatePlaybook: no text in data');
                    break;
                }
                const generationId = crypto.randomUUID();
                const createOutline = !outline;
                this.log(
                    'info',
                    `[playbookGen] Generating playbook: text="${text.substring(0, 100)}", createOutline=${String(createOutline)}, hasOutline=${String(!!outline)}, generationId=${generationId}`,
                );
                this.telemetry.sendEvent(LightspeedEvents.GENERATION_OPEN);

                const result = await this.api.playbookGenerationRequest({
                    text,
                    generationId,
                    createOutline,
                    ...(outline ? { outline } : {}),
                });

                if (isError(result)) {
                    this.log(
                        'error',
                        `[playbookGen] API error: code=${result.code}, message=${result.message ?? 'none'}`,
                    );
                    void this._panel.webview.postMessage({
                        type: 'errorMessage',
                        data: result.message ?? result.code,
                    });
                } else {
                    this.log(
                        'info',
                        `[playbookGen] API success: playbook length=${String(result.playbook.length)}, outline length=${String(result.outline?.length ?? 0)}`,
                    );
                    void this._panel.webview.postMessage({
                        type: 'generatePlaybook',
                        data: { ...result, generationId },
                    });
                }
                break;
            }
            case 'openEditor': {
                const content = data?.content as string;
                if (!content) break;
                this.log(
                    'info',
                    `[playbookGen] Opening editor with ${String(content.length)} chars`,
                );
                const doc = await vscode.workspace.openTextDocument({
                    content,
                    language: 'ansible',
                });
                await vscode.window.showTextDocument(doc, { preview: false });
                break;
            }
            case 'feedback': {
                const request = data?.request as Record<string, unknown> | undefined;
                this.log('info', `[playbookGen] Feedback: ${JSON.stringify(request)}`);
                if (request) {
                    const feedbackResult = await this.api.feedbackRequest(request, true);
                    if (isError(feedbackResult)) {
                        this.log(
                            'error',
                            `[playbookGen] Feedback API error: code=${feedbackResult.code}, message=${feedbackResult.message ?? 'none'}`,
                        );
                    } else {
                        this.log('info', '[playbookGen] Feedback API success');
                    }
                }
                break;
            }
            case 'contentMatch': {
                const suggestions = data?.suggestions as string[] | undefined;
                const suggestionId = data?.suggestionId as string | undefined;
                if (suggestions && suggestionId) {
                    this.log(
                        'info',
                        `[playbookGen] Content match request: ${String(suggestions.length)} suggestions`,
                    );
                    const matchResult = await this.api.contentMatchesRequest({
                        suggestions,
                        suggestionId,
                    });
                    if (!isError(matchResult)) {
                        void this._panel.webview.postMessage({
                            type: 'contentMatchesResponse',
                            data: matchResult,
                        });
                    }
                }
                break;
            }
            case 'getTelemetryStatus': {
                void this._panel.webview.postMessage({
                    type: 'telemetryStatus',
                    data: { enabled: true },
                });
                break;
            }
            default: {
                this.log(
                    'debug',
                    `[playbookGen] Unhandled message: type=${type ?? 'undefined'}, keys=${Object.keys(message).join(',')}`,
                );
            }
        }
    }

    /**
     *
     */
    private dispose() {
        PlaybookGenPanel.currentPanel = undefined;
        this._panel.dispose();
        for (const d of this._disposables) d.dispose();
    }
}
