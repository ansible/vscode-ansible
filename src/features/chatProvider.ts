import * as vscode from 'vscode';

/**
 * Truncate a prompt to a short user-visible summary for chat UIs
 * that support a separate display mask (e.g. IBM Bob).
 * @param prompt - Full prompt text
 * @returns First line of the prompt, truncated to 120 characters
 */
function maskFromPrompt(prompt: string): string {
    const firstLine = prompt.split('\n')[0].trim();
    const MAX = 120;
    return firstLine.length > MAX ? `${firstLine.slice(0, MAX)}…` : firstLine;
}

/**
 * Detect the effective chat provider.
 *
 * When the setting is `"auto"` (the default) the function probes
 * the runtime environment:
 * 1. If `bob-code.sendMessageWithHiddenPrompt` is registered → `"bob"`
 * 2. Otherwise → `"vscode"` (works in both VS Code and Cursor)
 *
 * Explicit values (`"vscode"`, `"abbenay"`, `"bob"`) bypass detection.
 *
 * @returns Resolved provider key
 */
async function resolveProvider(): Promise<string> {
    const config = vscode.workspace.getConfiguration('ansibleEnvironments');
    const raw = config.get<string>('llm.chatProvider', 'auto');

    if (raw !== 'auto') {
        return raw;
    }

    const allCommands = await vscode.commands.getCommands(true);
    if (allCommands.includes('bob-code.sendMessageWithHiddenPrompt')) {
        return 'bob';
    }
    return 'vscode';
}

/**
 * Open the AI chat with a prompt pre-filled.
 *
 * Routes to the configured (or auto-detected) chat provider:
 * - **vscode** — `workbench.action.chat.open` (VS Code Copilot / Cursor)
 * - **abbenay** — focuses the Abbenay sidebar and copies the prompt
 * - **bob** — uses `bob-code.sendMessageWithHiddenPrompt` to send
 *   the full prompt while showing a short mask in the chat UI
 *
 * Falls back to clipboard when the target command is unavailable.
 *
 * @param prompt - Full prompt text to deliver to the chat provider
 */
export async function openChatWithPrompt(prompt: string): Promise<void> {
    const provider = await resolveProvider();

    switch (provider) {
        case 'abbenay':
            await openAbbenayChat(prompt);
            break;
        case 'bob':
            await openBobChat(prompt);
            break;
        default:
            await openVscodeChat(prompt);
            break;
    }
}

/**
 * Send a prompt via VS Code / Cursor built-in chat.
 * @param prompt - Prompt text to send
 */
async function openVscodeChat(prompt: string): Promise<void> {
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
        vscode.window.showInformationMessage('Prompt sent to chat.');
    } catch {
        await clipboardFallback(prompt);
    }
}

/**
 * Send a prompt via the Abbenay extension sidebar.
 * @param prompt - Prompt text to copy to clipboard
 */
async function openAbbenayChat(prompt: string): Promise<void> {
    try {
        await vscode.commands.executeCommand('abbenay.chatView.focus');
        await vscode.env.clipboard.writeText(prompt);
        vscode.window.showInformationMessage(
            'Abbenay chat focused. Prompt copied to clipboard — paste to send.',
        );
    } catch {
        vscode.window.showWarningMessage(
            'Abbenay extension not found. Install it or switch to VS Code chat in settings.',
        );
    }
}

/**
 * Send a prompt via IBM Bob's chat using the hidden-prompt command.
 * @param prompt - Full prompt text; a short mask is derived for the UI
 */
async function openBobChat(prompt: string): Promise<void> {
    try {
        const mask = maskFromPrompt(prompt);
        await vscode.commands.executeCommand('bob-code.sendMessageWithHiddenPrompt', mask, prompt);
        vscode.window.showInformationMessage('Prompt sent to Bob.');
    } catch {
        await clipboardFallback(prompt, 'bobChatView.focus');
    }
}

/**
 * Copy prompt to clipboard and offer to open the chat panel.
 * @param prompt - Prompt text to copy
 * @param focusCommand - VS Code command to open the chat panel
 */
async function clipboardFallback(prompt: string, focusCommand?: string): Promise<void> {
    await vscode.env.clipboard.writeText(prompt);
    const action = await vscode.window.showInformationMessage(
        'AI prompt copied to clipboard. Paste it into an agent chat session.',
        'Open Chat',
    );
    if (action === 'Open Chat') {
        await vscode.commands.executeCommand(focusCommand ?? 'workbench.action.chat.open');
    }
}
