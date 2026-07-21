/**
 * Register tox-ansible features — Test Controller and Task Provider.
 *
 * Follows the feature registration pattern used by other features
 * (extensionConflicts, vault, fileAssociation).
 */

import * as vscode from 'vscode';
import { ToxTestController } from '@src/features/toxAnsible/ToxTestController';
import { ToxTaskProvider } from '@src/features/toxAnsible/ToxTaskProvider';

const TASK_TYPE = 'ansible-tox';

/**
 * Register the tox-ansible Test Controller and Task Provider.
 * @param context - Extension context for managing disposable subscriptions
 */
export function registerToxAnsible(context: vscode.ExtensionContext): void {
    const controller = new ToxTestController();
    context.subscriptions.push(controller);

    const taskProvider = vscode.tasks.registerTaskProvider(TASK_TYPE, new ToxTaskProvider());
    context.subscriptions.push(taskProvider);
}
