import * as path from 'path';
import * as vscode from 'vscode';
import { log } from '@src/extension';
import { PlaybooksService } from '@src/services/PlaybooksService';
import { TerminalService } from '@src/services/TerminalService';
import { emitJourneyOutcome } from '@src/services/journeyTelemetry';
import { TelemetryEvents } from '@ansible/common';
import type { PlaybookExecutor } from '@ansible/developer-services';

/**
 * Convert an unknown thrown value into a log-safe error message.
 * @param error - Error object or value to stringify
 * @returns Human-readable error message text
 */
function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve which file a "Run Playbook via..." context-menu command should target.
 * The editor/context menu does not pass an argument, so fall back to the active editor.
 * @param uri - Resource URI passed by the explorer context menu, if any
 * @returns The playbook file URI to run, or undefined if none can be resolved
 */
export function resolvePlaybookRunUri(uri?: vscode.Uri): vscode.Uri | undefined {
    return uri?.fsPath ? uri : vscode.window.activeTextEditor?.document.uri;
}

/**
 * Compute the same lookup key `PlaybooksService` uses to key saved per-playbook
 * configuration, without depending on workspace discovery having completed.
 * Mirrors the `displayPath` built in `PlaybooksService._discoverPlaybooks()`.
 * @param workspaceFolder - Workspace folder containing the playbook
 * @param playbookRelativePath - Path to the playbook, relative to `workspaceFolder`
 * @returns The per-playbook config key (folder-prefixed only in multi-root workspaces)
 */
export function toPlaybookConfigKey(
    workspaceFolder: vscode.WorkspaceFolder,
    playbookRelativePath: string,
): string {
    const isMultiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    return isMultiRoot ? `${workspaceFolder.name}/${playbookRelativePath}` : playbookRelativePath;
}

/**
 * Run a playbook file with a specific executor, invoked from the editor or explorer
 * context menu. Reuses saved per-playbook configuration (keyed the same way as the
 * Playbooks tree view), falling back to the workspace default configuration when none
 * has been saved for this file.
 * @param uri - Resource URI from the context menu, or undefined for the active editor
 * @param executor - Executor to force for this run, overriding the saved config
 */
export async function runPlaybookFileWithExecutor(
    uri: vscode.Uri | undefined,
    executor: PlaybookExecutor,
): Promise<void> {
    const startedAt = Date.now();
    const targetUri = resolvePlaybookRunUri(uri);

    if (!targetUri?.fsPath) {
        vscode.window.showErrorMessage('No playbook file selected to run.');
        return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetUri);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Playbook must be inside an open workspace folder to run.');
        return;
    }

    try {
        const playbooksService = PlaybooksService.getInstance();
        const playbookRelativePath = path.relative(workspaceFolder.uri.fsPath, targetUri.fsPath);
        const configKey = toPlaybookConfigKey(workspaceFolder, playbookRelativePath);
        const config = {
            ...playbooksService.getPlaybookConfig(configKey),
            executor,
        };

        const command =
            executor === 'ansible-navigator'
                ? playbooksService.buildNavigatorCommand(playbookRelativePath, config)
                : playbooksService.buildCommand(playbookRelativePath, config);

        log(`Running playbook from context menu: ${command} in ${workspaceFolder.uri.fsPath}`);

        const terminalService = TerminalService.getInstance();
        const managed = await terminalService.createActivatedTerminal({
            name: `${executor}: ${path.basename(targetUri.fsPath)}`,
            cwd: workspaceFolder.uri,
            show: true,
        });

        await managed.sendCommand(command, { waitForCompletion: false });
        emitJourneyOutcome(TelemetryEvents.PLAYBOOK_RUN, 'success', {
            startedAt,
            extra: { source: 'contextMenu', executor },
        });
    } catch (error) {
        emitJourneyOutcome(TelemetryEvents.PLAYBOOK_RUN, 'error', {
            startedAt,
            errorCode: 'launch_failed',
            extra: { source: 'contextMenu', executor },
        });
        vscode.window.showErrorMessage(`Failed to run playbook: ${formatError(error)}`);
        throw error;
    }
}

/**
 * Register the editor/explorer "Run Ansible Playbook via..." context-menu commands.
 * @param context - Extension context used to register and dispose the commands
 */
export function registerPlaybookContextMenuCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'ansiblePlaybooks.runFileWithAnsiblePlaybook',
            async (uri?: vscode.Uri) => {
                await runPlaybookFileWithExecutor(uri, 'ansible-playbook');
            },
        ),
        vscode.commands.registerCommand(
            'ansiblePlaybooks.runFileWithNavigator',
            async (uri?: vscode.Uri) => {
                await runPlaybookFileWithExecutor(uri, 'ansible-navigator');
            },
        ),
    );
}
