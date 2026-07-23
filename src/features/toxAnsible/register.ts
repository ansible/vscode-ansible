/**
 * Register tox-ansible features — Test Controller and Task Provider.
 *
 * Follows the feature registration pattern used by other features
 * (extensionConflicts, vault, fileAssociation).
 */

import * as vscode from 'vscode';
import { ToxTestController } from '@src/features/toxAnsible/ToxTestController';
import { ToxTaskProvider } from '@src/features/toxAnsible/ToxTaskProvider';
import type { TelemetryService } from '@src/services/TelemetryService';

const TASK_TYPE = 'ansible-tox';

/**
 * Register the tox-ansible Test Controller and Task Provider.
 * @param context - Extension context for managing disposable subscriptions
 * @param telemetry - TelemetryService for emitting TOX_DISCOVER/TOX_RUN events
 */
export function registerToxAnsible(
    context: vscode.ExtensionContext,
    telemetry: TelemetryService,
): void {
    const emitter = (name: string, props?: Record<string, string>) => {
        telemetry.sendEvent(name as Parameters<typeof telemetry.sendEvent>[0], props);
    };

    const controller = new ToxTestController(undefined, emitter);
    context.subscriptions.push(controller);

    const taskProvider = vscode.tasks.registerTaskProvider(TASK_TYPE, new ToxTaskProvider());
    context.subscriptions.push(taskProvider);
}
