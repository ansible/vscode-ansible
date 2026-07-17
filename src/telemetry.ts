import * as vscode from 'vscode';
import type { TelemetryService } from '@src/services/TelemetryService';
import { openGettingStarted } from '@src/features/gettingStarted';

/**
 * Register a command that tracks walkthrough open events via telemetry
 * and opens the shared Getting Started panel (Cursor-safe).
 *
 * Content comes from `contributes.walkthroughs` — the same definition
 * VS Code Welcome uses when that host UI is available.
 *
 * @param context - The VS Code extension context
 * @param telemetry - The telemetry service for recording events
 * @returns void
 */
export function registerWalkthroughTelemetry(
    context: vscode.ExtensionContext,
    telemetry: TelemetryService,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'ansible.telemetry.trackWalkthroughOpen',
            (walkthroughId?: string) => {
                openGettingStarted(context, telemetry, walkthroughId);
            },
        ),
    );
}
