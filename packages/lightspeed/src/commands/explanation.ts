import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import type { TelemetryReporter } from '../telemetry';
import { ExplanationPanel } from '../panels/explanationPanel';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

/**
 * Registers Ansible Lightspeed explanation commands for playbooks and roles.
 * @param context The VS Code extension context
 * @param api The Lightspeed API client instance
 * @param telemetry The telemetry service for tracking events
 * @param log The logger instance for debug output
 */
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

            const { languageId } = editor.document;
            if (languageId !== 'ansible' && languageId !== 'yaml') {
                vscode.window.showWarningMessage(
                    'Playbook explanation is only available for Ansible or YAML files.',
                );
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

            const { languageId } = editor.document;
            if (languageId !== 'ansible' && languageId !== 'yaml') {
                vscode.window.showWarningMessage(
                    'Role explanation is only available for Ansible or YAML files.',
                );
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
