import * as vscode from 'vscode';

/**
 * Extensions known to conflict with Red Hat Ansible — they provide
 * competing language features, syntax highlighting, or file associations
 * that interfere with normal operation.
 */
export const CONFLICTING_EXTENSION_IDS: readonly string[] = Object.freeze([
    'haaaad.ansible',
    'lextudio.restructuredtext',
    'sysninja.vscode-ansible-mod',
    'tomaciazek.ansible',
    'vscoss.vscode-ansible',
    'zbr.vscode-ansible',
]);

interface ConflictInfo {
    id: string;
    displayName: string;
}

/**
 * Return metadata for every installed extension whose ID is in the
 * conflict list.
 * @returns Array of conflict info for each installed conflicting extension
 */
export function getConflictingExtensions(): ConflictInfo[] {
    const found: ConflictInfo[] = [];
    for (const id of CONFLICTING_EXTENSION_IDS) {
        const ext = vscode.extensions.getExtension(id);
        if (ext) {
            const displayName = (ext.packageJSON as { displayName?: string }).displayName ?? id;
            found.push({ id, displayName });
        }
    }
    return found;
}

/**
 * Show a single warning listing all detected conflicts. Offers a
 * "Show Extensions" button that opens the Extensions view filtered
 * to the first conflicting ID (VS Code treats multiple @id: tokens
 * as AND, so we show one at a time).
 * @param conflicts - Detected conflicting extensions to warn about
 * @returns True if the user clicked "Dismiss", false otherwise
 */
async function notifyConflicts(conflicts: ConflictInfo[]): Promise<boolean> {
    const names = conflicts.map((c) => c.displayName).join(', ');
    const selection = await vscode.window.showWarningMessage(
        `The following extensions may conflict with Ansible: ${names}. ` +
            'Consider disabling or uninstalling them for the best experience.',
        'Show Extensions',
        'Dismiss',
    );

    if (selection === 'Show Extensions') {
        await vscode.commands.executeCommand(
            'workbench.extensions.search',
            `@id:${conflicts[0].id}`,
        );
    }

    return selection === 'Dismiss';
}

/**
 * Register extension-conflict detection. Checks on activation and
 * whenever the set of installed extensions changes.
 *
 * Session-scoped state prevents redundant warnings: once the user
 * dismisses the notification, it won't reappear until a *new*
 * conflict is installed that wasn't part of the dismissed set.
 * @param context - Extension context for managing disposable subscriptions
 */
export function registerExtensionConflictDetection(context: vscode.ExtensionContext): void {
    const dismissedIds = new Set<string>();
    let notifying = false;

    const checkAndNotify = (): void => {
        if (notifying) return;

        const conflicts = getConflictingExtensions();
        const unreported = conflicts.filter((c) => !dismissedIds.has(c.id));

        if (unreported.length === 0) return;

        notifying = true;
        void notifyConflicts(unreported).then((dismissed) => {
            notifying = false;
            if (dismissed) {
                for (const c of unreported) {
                    dismissedIds.add(c.id);
                }
            }
        });
    };

    checkAndNotify();

    context.subscriptions.push(
        vscode.extensions.onDidChange(() => {
            checkAndNotify();
        }),
    );
}
