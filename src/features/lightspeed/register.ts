import * as vscode from 'vscode';
import { activate } from '@ansible/lightspeed';
import type { TelemetryService } from '@src/services/TelemetryService';

/**
 * Conditionally activates the Lightspeed package when the
 * `ansible.lightspeed.enabled` setting is true.
 *
 * @param context - The VS Code extension context.
 * @param telemetry - The extension's telemetry service.
 * @returns A disposable for cleanup, or undefined if disabled.
 */
export async function registerLightspeed(
    context: vscode.ExtensionContext,
    telemetry: TelemetryService,
): Promise<vscode.Disposable | undefined> {
    const config = vscode.workspace.getConfiguration('ansible.lightspeed');
    const enabled = config.get<boolean>('enabled', false);
    if (!enabled) {
        return undefined;
    }

    try {
        return await activate(context, telemetry.asLightspeedReporter());
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Lightspeed activation failed: ${msg}`);
        console.error('[lightspeed] Activation failed:', e);
        return undefined;
    }
}
