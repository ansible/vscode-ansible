import * as vscode from 'vscode';
import { CreatorService } from '@ansible/developer-services';
import { CreatorFormPanel } from '@src/panels/CreatorFormPanel';

/** Schema path for ansible-creator single-file playbook scaffolding. */
export const SIMPLE_PLAYBOOK_COMMAND_PATH = ['add', 'resource', 'playbook'] as const;

/**
 * Open the Creator form for simple playbook creation when the installed
 * ansible-creator schema exposes `add resource playbook`.
 *
 * @param extensionUri - Extension root URI for the Creator webview
 * @returns True when the form was opened; false when creator support is missing
 */
export async function openSimplePlaybookCreatorForm(extensionUri: vscode.Uri): Promise<boolean> {
    const service = CreatorService.getInstance();
    await service.loadSchema();

    const schema = service.getSchemaNode([...SIMPLE_PLAYBOOK_COMMAND_PATH]);
    if (!schema) {
        return handleMissingSimplePlaybookSupport(service.getStatus());
    }

    CreatorFormPanel.show(extensionUri, [...SIMPLE_PLAYBOOK_COMMAND_PATH], schema);
    return true;
}

/**
 * Guide the user when `add resource playbook` is unavailable.
 *
 * @param status - Current ansible-creator readiness from CreatorService
 * @returns Always false (form was not opened)
 */
async function handleMissingSimplePlaybookSupport(
    status: 'unknown' | 'not-installed' | 'outdated' | 'ready',
): Promise<false> {
    if (status === 'not-installed') {
        const action = await vscode.window.showErrorMessage(
            'ansible-creator is required to create a simple playbook. ' +
                'Install ansible-dev-tools, then try again.',
            'Install ansible-dev-tools',
        );
        if (action === 'Install ansible-dev-tools') {
            await vscode.commands.executeCommand('ansibleDevToolsPackages.install');
        }
        return false;
    }

    const action = await vscode.window.showErrorMessage(
        'Simple playbook creation requires ansible-creator with ' +
            '`add resource playbook` support. Upgrade ansible-dev-tools, ' +
            'then refresh Creator.',
        'Upgrade ansible-dev-tools',
        'Refresh Creator',
    );
    if (action === 'Upgrade ansible-dev-tools') {
        await vscode.commands.executeCommand('ansibleDevToolsPackages.upgrade');
    } else if (action === 'Refresh Creator') {
        await vscode.commands.executeCommand('ansibleCreator.refresh');
    }
    return false;
}
