import * as vscode from 'vscode';
import { activate, noopReporter } from '@ansible/lightspeed';

/**
 * Conditionally activates the Lightspeed package when the
 * `ansible.lightspeed.enabled` setting is true.
 *
 * @param context - The VS Code extension context.
 * @returns A disposable for cleanup, or undefined if disabled.
 */
export async function registerLightspeed(
    context: vscode.ExtensionContext,
): Promise<vscode.Disposable | undefined> {
    const config = vscode.workspace.getConfiguration('ansible.lightspeed');
    const enabled = config.get<boolean>('enabled', false);
    if (!enabled) {
        return undefined;
    }

    try {
        return await activate(context, noopReporter);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Lightspeed activation failed: ${msg}`);
        console.error('[lightspeed] Activation failed:', e);
        return undefined;
    }
}
