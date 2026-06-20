import * as vscode from 'vscode';
import { LightspeedAPI } from '../api';
import type { TelemetryReporter } from '../telemetry';
import { PlaybookGenPanel } from '../panels/playbookGenPanel';
import { RoleGenPanel } from '../panels/roleGenPanel';

type LogFn = (level: 'info' | 'debug' | 'error', message: string) => void;

export function registerGenerationCommands(
    context: vscode.ExtensionContext,
    api: LightspeedAPI,
    telemetry: TelemetryReporter,
    log: LogFn,
) {
    context.subscriptions.push(
        vscode.commands.registerCommand('ansible.lightspeed.playbookGeneration', () => {
            log('info', '[generation] Opening playbook generation panel');
            PlaybookGenPanel.createOrShow(context.extensionUri, api, telemetry, log);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ansible.lightspeed.roleGeneration', () => {
            log('info', '[generation] Opening role generation panel');
            RoleGenPanel.createOrShow(context.extensionUri, api, telemetry, log);
        }),
    );
}
