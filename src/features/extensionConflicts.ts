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
 * to the conflicting IDs so the user can disable or uninstall them.
 * @param conflicts - Detected conflicting extensions to warn about
 */
async function notifyConflicts(conflicts: ConflictInfo[]): Promise<void> {
    const names = conflicts.map((c) => c.displayName).join(', ');
    const selection = await vscode.window.showWarningMessage(
        `The following extensions may conflict with Ansible: ${names}. ` +
            'Consider disabling or uninstalling them for the best experience.',
        'Show Extensions',
        'Dismiss',
    );

    if (selection === 'Show Extensions') {
        const query = conflicts.map((c) => `@id:${c.id}`).join(' ');
        await vscode.commands.executeCommand('workbench.extensions.search', query);
    }
}

function checkAndNotify(): void {
    const conflicts = getConflictingExtensions();
    if (conflicts.length > 0) {
        void notifyConflicts(conflicts);
    }
}

/**
 * Register extension-conflict detection. Checks on activation and
 * whenever the set of installed extensions changes.
 * @param context - Extension context for managing disposable subscriptions
 */
export function registerExtensionConflictDetection(context: vscode.ExtensionContext): void {
    checkAndNotify();

    context.subscriptions.push(
        vscode.extensions.onDidChange(() => {
            checkAndNotify();
        }),
    );
}
