import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import type { TelemetryReporter } from '../telemetry';
import { ExplanationPanel } from '../panels/explanationPanel';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

export function registerExplanationCommands(
    context: vscode.ExtensionContext,
    api: LightspeedAPI,
    telemetry: TelemetryReporter,
    log: LogFn,
) {
    context.subscriptions.push(
        vscode.commands.registerCommand('ansible.lightspeed.playbookExplanation', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Open an Ansible playbook file to explain.');
                return;
            }

            const content = editor.document.getText();
            if (!content.trim()) {
                vscode.window.showWarningMessage('The active editor is empty.');
                return;
            }

            log('info', '[explanation] Opening playbook explanation panel');
            ExplanationPanel.createOrShow(context.extensionUri, api, telemetry, log, {
                content,
                explanationType: 'playbook',
            });
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ansible.lightspeed.roleExplanation', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Open an Ansible role file to explain.');
                return;
            }

            const content = editor.document.getText();
            if (!content.trim()) {
                vscode.window.showWarningMessage('The active editor is empty.');
                return;
            }

            log('info', '[explanation] Opening role explanation panel');
            ExplanationPanel.createOrShow(context.extensionUri, api, telemetry, log, {
                content,
                explanationType: 'role',
                fileName: editor.document.fileName,
            });
        }),
    );
}
