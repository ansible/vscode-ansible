import * as vscode from 'vscode';
import { activate, noopReporter } from '@ansible/lightspeed';

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
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Lightspeed activation failed: ${msg}`);
        console.error('[lightspeed] Activation failed:', e);
        return undefined;
    }
}
