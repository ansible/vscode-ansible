import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import { isError } from '../errors';
import type { TelemetryReporter } from '../telemetry';
import { LightspeedEvents } from '../telemetry';
import { getWebviewHtml } from './panelUtils';
import crypto from 'crypto';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

export class PlaybookGenPanel {
    public static currentPanel: PlaybookGenPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly api: LightspeedAPI,
        private readonly telemetry: TelemetryReporter,
        private readonly log: LogFn,
        extensionUri: vscode.Uri,
    ) {
        this._panel = panel;
        this._panel.webview.html = getWebviewHtml(extensionUri, this._panel.webview, 'playbook-generation');

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            (msg) => this._handleMessage(msg),
            null,
            this._disposables,
        );
    }

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

        PlaybookGenPanel.currentPanel = new PlaybookGenPanel(panel, api, telemetry, log, extensionUri);
    }

    private async _handleMessage(message: { type?: string; data?: any }) {
        const type = message.type as string | undefined;
        const data = message.data;
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
                this.log('info', `[playbookGen] Generating playbook: text="${text.substring(0, 100)}", createOutline=${String(createOutline)}, hasOutline=${!!outline}, generationId=${generationId}`);
                this.telemetry.sendEvent(LightspeedEvents.GENERATION_OPEN);

                const result = await this.api.playbookGenerationRequest({
                    text,
                    generationId,
                    createOutline,
                    ...(outline ? { outline } : {}),
                });

                if (isError(result)) {
                    this.log('error', `[playbookGen] API error: code=${result.code}, message=${result.message ?? 'none'}`);
                    void this._panel.webview.postMessage({
                        type: 'errorMessage',
                        data: result.message ?? result.code,
                    });
                } else {
                    this.log('info', `[playbookGen] API success: playbook length=${result.playbook?.length ?? 0}, outline length=${result.outline?.length ?? 0}`);
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
                this.log('info', `[playbookGen] Opening editor with ${content.length} chars`);
                const doc = await vscode.workspace.openTextDocument({ content, language: 'ansible' });
                await vscode.window.showTextDocument(doc, { preview: false });
                break;
            }
            case 'feedback': {
                const request = data?.request as Record<string, unknown> | undefined;
                this.log('info', `[playbookGen] Feedback: ${JSON.stringify(request)}`);
                if (request) {
                    const feedbackResult = await this.api.feedbackRequest(
                        request as any,
                        true,
                    );
                    if (isError(feedbackResult)) {
                        this.log('error', `[playbookGen] Feedback API error: code=${feedbackResult.code}, message=${feedbackResult.message ?? 'none'}`);
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
                    this.log('info', `[playbookGen] Content match request: ${suggestions.length} suggestions`);
                    const matchResult = await this.api.contentMatchesRequest({ suggestions, suggestionId });
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
                this.log('debug', `[playbookGen] Unhandled message: type=${type ?? 'undefined'}, keys=${Object.keys(message).join(',')}`);
            }
        }
    }

    private dispose() {
        PlaybookGenPanel.currentPanel = undefined;
        this._panel.dispose();
        for (const d of this._disposables) d.dispose();
    }
}
