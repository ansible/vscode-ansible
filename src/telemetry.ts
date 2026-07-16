import * as vscode from 'vscode';
import type { TelemetryService } from '@src/services/TelemetryService';
import { TelemetryEvents } from '@ansible/common';

/**
 * Register a command that tracks walkthrough open events via telemetry.
 * @param context - The VS Code extension context
 * @param telemetry - The telemetry service for recording events
 */
export function registerWalkthroughTelemetry(
    context: vscode.ExtensionContext,
    telemetry: TelemetryService,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'ansible.telemetry.trackWalkthroughOpen',
            (walkthroughId?: string) => {
                telemetry.sendEvent(TelemetryEvents.WALKTHROUGH_OPEN, {
                    ...(walkthroughId ? { walkthroughId } : {}),
                });
                void vscode.commands.executeCommand(
                    'workbench.action.openWalkthrough',
                    walkthroughId,
                );
            },
        ),
    );
}
