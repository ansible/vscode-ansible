import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import { isError } from '../errors';
import { RoleFileType } from '../interfaces';
import type { TelemetryReporter } from '../telemetry';
import { LightspeedEvents } from '../telemetry';
import { getWebviewHtml } from './panelUtils';
import crypto from 'crypto';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

export class ExplanationPanel {
    public static currentPanel: ExplanationPanel | undefined;
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
        this._panel.webview.html = getWebviewHtml(extensionUri, this._panel.webview, 'explanation');

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
        options?: { content: string; explanationType: 'playbook' | 'role'; fileName?: string },
    ) {
        if (ExplanationPanel.currentPanel) {
            ExplanationPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            if (options) {
                ExplanationPanel.currentPanel._requestExplanation(options);
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'lightspeedExplanation',
            'Ansible Explanation',
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

        ExplanationPanel.currentPanel = new ExplanationPanel(panel, api, telemetry, log, extensionUri);

        if (options) {
            ExplanationPanel.currentPanel._requestExplanation(options);
        }
    }

    private async _requestExplanation(options: {
        content: string;
        explanationType: 'playbook' | 'role';
        fileName?: string;
    }) {
        const explanationId = crypto.randomUUID();
        const responseType = options.explanationType === 'role' ? 'explainRole' : 'explainPlaybook';

        this.log('info', `[explanation] Requesting ${options.explanationType} explanation, id=${explanationId}, content length=${options.content.length}`);

        let result;
        if (options.explanationType === 'role') {
            result = await this.api.roleExplanationRequest({
                files: [{ path: options.fileName ?? 'main.yml', file_type: RoleFileType.Task, content: options.content }],
                explanationId,
                roleName: 'current-role',
            });
        } else {
            result = await this.api.explanationRequest({
                content: options.content,
                explanationId,
            });
        }

        if (isError(result)) {
            this.log('error', `[explanation] API returned error: code=${result.code}, message=${result.message ?? 'none'}`);
            void this._panel.webview.postMessage({
                type: 'errorMessage',
                data: result.message ?? result.code,
            });
        } else {
            this.log('info', `[explanation] API success: content length=${result.content?.length ?? 0}, format=${result.format ?? 'none'}`);
            this.telemetry.sendEvent(LightspeedEvents.EXPLANATION_REQUESTED);
            void this._panel.webview.postMessage({
                type: responseType,
                data: { content: result.content, format: result.format, explanationId },
            });
        }
    }

    private async _handleMessage(message: { type?: string; data?: unknown; [key: string]: unknown }) {
        const type = message.type as string | undefined;
        this.log('debug', `[explanation] Received webview message: type=${type ?? 'undefined'}`);

        switch (type) {
            case 'explainPlaybook': {
                this.log('info', '[explanation] Webview requested playbook explanation');
                const data = message.data as { content?: string; explanationId?: string } | undefined;
                const content = data?.content;
                if (content) {
                    await this._requestExplanation({ content, explanationType: 'playbook' });
                } else {
                    this.log('error', '[explanation] explainPlaybook message had no content');
                }
                break;
            }
            case 'explainRole': {
                this.log('info', '[explanation] Webview requested role explanation');
                const data = message.data as { content?: string; explanationId?: string; files?: unknown[] } | undefined;
                const content = data?.content;
                if (content) {
                    await this._requestExplanation({ content, explanationType: 'role' });
                } else {
                    this.log('error', '[explanation] explainRole message had no content');
                }
                break;
            }
            case 'explanationThumbsUp':
            case 'explanationThumbsDown': {
                const data = message.data as { action?: number; explanationId?: string; explanationType?: string } | undefined;
                this.log('info', `[explanation] Feedback ${type}: action=${data?.action}, explanationId=${data?.explanationId}, explanationType=${data?.explanationType}`);

                if (!data) {
                    this.log('error', '[explanation] Feedback message had no data');
                    break;
                }

                const feedbackPayload: Record<string, unknown> = {};
                const feedbackEvent = {
                    action: data.action,
                    explanationId: data.explanationId,
                };

                if (data.explanationType === 'role') {
                    feedbackPayload.roleExplanationFeedback = feedbackEvent;
                } else {
                    feedbackPayload.playbookExplanationFeedback = feedbackEvent;
                }

                this.log('info', `[explanation] Sending feedback to API: ${JSON.stringify(feedbackPayload)}`);
                const feedbackResult = await this.api.feedbackRequest(
                    feedbackPayload as any,
                    true,
                );

                if (isError(feedbackResult)) {
                    this.log('error', `[explanation] Feedback API error: code=${feedbackResult.code}, message=${feedbackResult.message ?? 'none'}`);
                } else {
                    this.log('info', `[explanation] Feedback API success: ${JSON.stringify(feedbackResult)}`);
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
                this.log('debug', `[explanation] Unhandled message type: ${type ?? 'undefined'}, keys: ${Object.keys(message).join(',')}`);
            }
        }
    }

    private dispose() {
        ExplanationPanel.currentPanel = undefined;
        this._panel.dispose();
        for (const d of this._disposables) d.dispose();
    }
}
