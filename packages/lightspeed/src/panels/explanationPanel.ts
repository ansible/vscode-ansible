import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import { isError, type IError } from '../errors';
import { RoleFileType } from '../interfaces';
import type { TelemetryReporter } from '../telemetry';
import { LightspeedEvents } from '../telemetry';
import { getWebviewHtml } from './panelUtils';
import crypto from 'crypto';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

/**
 * Manages the Ansible Lightspeed explanation webview panel.
 */
export class ExplanationPanel {
    public static currentPanel: ExplanationPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    /**
     * Creates an ExplanationPanel instance and wires up disposal and message handling.
     * @param panel - The VS Code webview panel to wrap.
     * @param api - Lightspeed API client for explanation requests.
     * @param telemetry - Telemetry reporter for tracking events.
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
        this._panel.webview.html = getWebviewHtml(extensionUri, this._panel.webview, 'explanation');

        this._panel.onDidDispose(
            () => {
                this.dispose();
            },
            null,
            this._disposables,
        );
        this._panel.webview.onDidReceiveMessage(
            (msg: { type?: string; data?: unknown; [key: string]: unknown }) =>
                this._handleMessage(msg),
            null,
            this._disposables,
        );
    }

    /**
     * Creates a new explanation panel or reveals the existing one and optionally requests an explanation.
     * @param extensionUri - Root URI of the extension for resolving webview resources.
     * @param api - Lightspeed API client for explanation requests.
     * @param telemetry - Telemetry reporter for tracking events.
     * @param log - Logging function for diagnostic output.
     * @param options - Optional content and type for an immediate explanation request.
     * @param options.content - The Ansible content to explain.
     * @param options.explanationType - Whether to explain a playbook or role.
     * @param options.fileName - Optional file name associated with the content.
     */
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
                void ExplanationPanel.currentPanel._requestExplanation(options);
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

        ExplanationPanel.currentPanel = new ExplanationPanel(
            panel,
            api,
            telemetry,
            log,
            extensionUri,
        );

        if (options) {
            void ExplanationPanel.currentPanel._requestExplanation(options);
        }
    }

    /**
     * Sends an explanation request to the Lightspeed API and posts the result to the webview.
     * @param options - The explanation request parameters.
     * @param options.content - The Ansible content to explain.
     * @param options.explanationType - Whether to explain a playbook or role.
     * @param options.fileName - Optional file name associated with the content.
     */
    private async _requestExplanation(options: {
        content: string;
        explanationType: 'playbook' | 'role';
        fileName?: string;
    }) {
        const explanationId = crypto.randomUUID();
        const responseType = options.explanationType === 'role' ? 'explainRole' : 'explainPlaybook';

        this.log(
            'info',
            `[explanation] Requesting ${options.explanationType} explanation, id=${explanationId}, content length=${String(options.content.length)}`,
        );

        let result;
        if (options.explanationType === 'role') {
            result = await this.api.roleExplanationRequest({
                files: [
                    {
                        path: options.fileName ?? 'main.yml',
                        file_type: RoleFileType.Task,
                        content: options.content,
                    },
                ],
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
            this.log(
                'error',
                `[explanation] API returned error: code=${result.code}, message=${result.message ?? 'none'}`,
            );
            const userMessage = this._getUserErrorMessage(result);
            void this._panel.webview.postMessage({
                type: 'errorMessage',
                data: userMessage,
            });
        } else {
            this.log(
                'info',
                `[explanation] API success: content length=${String(result.content.length)}, format=${result.format}`,
            );
            this.telemetry.sendEvent(LightspeedEvents.EXPLANATION_REQUESTED);
            void this._panel.webview.postMessage({
                type: responseType,
                data: { content: result.content, format: result.format, explanationId },
            });
        }
    }

    /**
     * Handles incoming messages from the explanation webview.
     * @param message - The message object received from the webview.
     * @param message.type - The message type identifier.
     * @param message.data - The message payload.
     */
    private async _handleMessage(message: {
        type?: string;
        data?: unknown;
        [key: string]: unknown;
    }) {
        const type = message.type;
        this.log('debug', `[explanation] Received webview message: type=${type ?? 'undefined'}`);

        switch (type) {
            case 'explainPlaybook': {
                this.log('info', '[explanation] Webview requested playbook explanation');
                const data = message.data as
                    { content?: string; explanationId?: string } | undefined;
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
                const data = message.data as
                    { content?: string; explanationId?: string; files?: unknown[] } | undefined;
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
                const data = message.data as
                    | { action?: number; explanationId?: string; explanationType?: string }
                    | undefined;
                this.log(
                    'info',
                    `[explanation] Feedback ${type}: action=${String(data?.action ?? '')}, explanationId=${data?.explanationId ?? ''}, explanationType=${data?.explanationType ?? ''}`,
                );

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

                this.log(
                    'info',
                    `[explanation] Sending feedback to API: ${JSON.stringify(feedbackPayload)}`,
                );
                const feedbackResult = await this.api.feedbackRequest(feedbackPayload, true);

                if (isError(feedbackResult)) {
                    this.log(
                        'error',
                        `[explanation] Feedback API error: code=${feedbackResult.code}, message=${feedbackResult.message ?? 'none'}`,
                    );
                } else {
                    this.log(
                        'info',
                        `[explanation] Feedback API success: ${JSON.stringify(feedbackResult)}`,
                    );
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
                    `[explanation] Unhandled message type: ${type ?? 'undefined'}, keys: ${Object.keys(message).join(',')}`,
                );
            }
        }
    }

    /**
     * Maps an API error to a user-friendly message with actionable guidance.
     * @param error - The structured error from the API client.
     * @returns A user-facing error string.
     */
    private _getUserErrorMessage(error: IError): string {
        const code = error.code;
        if (
            code === 'fallback__unauthorized' ||
            code === 'permission_denied__user_not_authenticated' ||
            error.message?.includes('authentication failed') ||
            error.message?.includes('Token refresh failed')
        ) {
            void vscode.window
                .showWarningMessage('Your Ansible Lightspeed session has expired.', 'Sign In')
                .then((selection) => {
                    if (selection === 'Sign In') {
                        void vscode.commands.executeCommand('ansible.lightspeed.oauth');
                    }
                });
            return 'Session expired. Please sign in again using the "Ansible Lightspeed: Sign In" command.';
        }
        if (code === 'fallback__bad_request') {
            return `Request failed: ${error.message ?? 'Bad request. Please check your input and try again.'}`;
        }
        if (code === 'fallback__too_many_requests') {
            return 'Too many requests. Please wait a moment and try again.';
        }
        return (
            error.message ??
            'An unexpected error occurred. Check the Ansible Lightspeed output channel for details.'
        );
    }

    /**
     * Cleans up the panel and all associated disposables.
     */
    private dispose() {
        ExplanationPanel.currentPanel = undefined;
        this._panel.dispose();
        for (const d of this._disposables) d.dispose();
    }
}
