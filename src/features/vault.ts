import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCommandService } from '@ansible/developer-services';
import { getVaultConfig, parseVaultIdentities, findProjectRoot } from '@src/features/ansibleCfg';

// ---------------------------------------------------------------------------
// FIFO-based password passing — password never touches disk
// ---------------------------------------------------------------------------

/**
 * Build a unique FIFO path in the system temp directory for vault passwords.
 * @returns Absolute path to a temporary named pipe file
 */
function fifoPath(): string {
    return path.join(os.tmpdir(), `ansible-vault-pw-${crypto.randomBytes(8).toString('hex')}`);
}

/**
 * Create a FIFO and begin an async write of the password into it.
 * The write completes once ansible-vault opens the FIFO for reading,
 * so the caller must spawn ansible-vault after calling this.
 * The password only exists in memory (kernel pipe buffer) — never on disk.
 * @param password - Vault password to write into the FIFO
 * @returns FIFO path and a cleanup function that removes the pipe file
 */
function createPasswordFifo(password: string): {
    fifo: string;
    cleanup: () => void;
} {
    const fifo = fifoPath();
    cp.execFileSync('mkfifo', ['-m', '0600', fifo]);

    // createWriteStream opens the FIFO asynchronously — the underlying open()
    // blocks in the background until a reader (ansible-vault) connects. This
    // does NOT block the Node event loop.
    const stream = fs.createWriteStream(fifo);
    stream.write(password + '\n');
    stream.end();

    const cleanup = () => {
        try {
            fs.unlinkSync(fifo);
        } catch {
            // already removed
        }
    };

    return { fifo, cleanup };
}

// ---------------------------------------------------------------------------
// Password resolution
// ---------------------------------------------------------------------------

/**
 * Resolve ansible-vault password arguments from config or user input.
 * @param projectRoot - Project root used to locate ansible.cfg settings
 * @returns CLI password arguments, or undefined when resolution is cancelled
 */
async function resolvePasswordArgs(projectRoot: string | undefined): Promise<string[] | undefined> {
    const cfg = await getVaultConfig(projectRoot);

    if (cfg?.vaultIdentityList) {
        const ids = parseVaultIdentities(cfg.vaultIdentityList);
        if (ids.length === 0) {
            return undefined;
        }

        let chosenId: string;
        if (ids.length === 1) {
            chosenId = ids[0];
        } else {
            const pick = await vscode.window.showQuickPick(ids, {
                placeHolder: 'Select vault identity',
            });
            if (!pick) {
                return undefined;
            }
            chosenId = pick;
        }
        return ['--encrypt-vault-id', chosenId];
    }

    if (cfg?.vaultPasswordFile) {
        return ['--vault-password-file', cfg.vaultPasswordFile];
    }

    // No config — prompt the user
    const password = await vscode.window.showInputBox({
        prompt: 'Enter vault password',
        password: true,
        ignoreFocusOut: true,
    });

    if (!password) {
        return undefined;
    }

    const { fifo, cleanup } = createPasswordFifo(password);
    // Attach cleanup to the returned args so the caller can invoke it
    const args = ['--vault-password-file', fifo];
    (args as PasswordArgs).__cleanup = cleanup;
    return args;
}

interface PasswordArgs extends Array<string> {
    __cleanup?: () => void;
}

/**
 * Remove any temporary FIFO created for inline password passing.
 * @param args - Password arguments that may carry an attached cleanup callback
 */
function cleanupArgs(args: string[] | undefined): void {
    if (args) {
        (args as PasswordArgs).__cleanup?.();
    }
}

// ---------------------------------------------------------------------------
// Spawn helper — runs ansible-vault with stdin piping
// ---------------------------------------------------------------------------

/**
 * Spawn ansible-vault and capture stdout for inline encrypt/decrypt operations.
 * @param args - ansible-vault CLI arguments excluding the executable path
 * @param stdin - Optional stdin payload for encrypt_string or decrypt operations
 * @param cwd - Working directory for the child process
 * @returns Command stdout on success
 */
async function spawnVault(
    args: string[],
    stdin: string | undefined,
    cwd: string | undefined,
): Promise<string> {
    const commandService = getCommandService();
    const toolPath = await commandService.getToolPath('ansible-vault');
    if (!toolPath) {
        throw new Error('ansible-vault not found. Install ansible-dev-tools first.');
    }

    const binDir = (await commandService.getToolPath('ansible-vault'))
        ? path.dirname(toolPath)
        : undefined;
    const pathEnv = process.env.PATH ?? '';
    const envPath = binDir ? `${binDir}${path.delimiter}${pathEnv}` : pathEnv;

    return new Promise<string>((resolve, reject) => {
        const child = cp.spawn(toolPath, args, {
            cwd: cwd ?? undefined,
            env: { ...process.env, PATH: envPath },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: Buffer) => {
            stdout += d.toString();
        });
        child.stderr.on('data', (d: Buffer) => {
            stderr += d.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `ansible-vault exited with ${String(code)}`));
            } else {
                resolve(stdout);
            }
        });

        child.on('error', reject);

        if (stdin !== undefined) {
            child.stdin.write(stdin);
            child.stdin.end();
        }
    });
}

// ---------------------------------------------------------------------------
// Encrypt / decrypt helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether selected inline YAML text is ansible-vault encrypted.
 * @param text - Selected editor text that may include a `!vault |` prefix
 * @returns True when the selection contains an inline vault payload
 */
function isEncryptedInline(text: string): boolean {
    const stripped = text.replace('!vault |', '').trim();
    return stripped.startsWith('$ANSIBLE_VAULT;');
}

/**
 * Detect whether a whole file begins with an ansible-vault header.
 * @param text - Full document text to inspect
 * @returns True when the file starts with `$ANSIBLE_VAULT;`
 */
function isEncryptedFile(text: string): boolean {
    return text.startsWith('$ANSIBLE_VAULT;');
}

/**
 * Remove the `!vault |` prefix and normalize whitespace from inline vault text.
 * @param text - Inline vault selection from the editor
 * @returns Vault ciphertext suitable for ansible-vault decrypt stdin
 */
function stripInlineVaultPrefix(text: string): string {
    return text
        .replace('!vault |', '')
        .trim()
        .replace(/[^\S\r\n]+/gm, '');
}

// ---------------------------------------------------------------------------
// Public command
// ---------------------------------------------------------------------------

/**
 * Toggle vault encrypt/decrypt on the active editor.
 * - With a selection: inline encrypt/decrypt via stdin piping
 * - Without a selection: file-level encrypt/decrypt
 */
export async function toggleVaultEncrypt(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const doc = editor.document;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const projectRoot = findProjectRoot(path.dirname(doc.uri.fsPath), workspaceRoot);

    const passwordArgs = await resolvePasswordArgs(projectRoot);
    if (!passwordArgs) {
        return;
    }

    try {
        const selection = editor.selection;
        const selectedText = doc.getText(selection);

        if (selectedText) {
            await handleInline(editor, selection, selectedText, passwordArgs, projectRoot);
        } else {
            await handleFile(doc, passwordArgs, projectRoot);
        }
    } catch (err) {
        vscode.window.showErrorMessage(
            `Vault operation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
    } finally {
        cleanupArgs(passwordArgs);
    }
}

/**
 * Encrypt or decrypt the current editor selection as inline vault content.
 * @param editor - Active text editor containing the selection
 * @param selection - Selected range to encrypt or decrypt
 * @param text - Selected text content
 * @param passwordArgs - Resolved ansible-vault password arguments
 * @param cwd - Working directory passed to ansible-vault
 */
async function handleInline(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    text: string,
    passwordArgs: string[],
    cwd: string | undefined,
): Promise<void> {
    if (isEncryptedInline(text)) {
        const cleaned = stripInlineVaultPrefix(text);
        const decrypted = await spawnVault(
            ['decrypt', ...passwordArgs, '--output', '-'],
            cleaned,
            cwd,
        );

        const tabSize = Number(editor.options.tabSize) || 2;
        const indentLevel = getIndentLevel(editor, selection);
        const formatted = reindentDecrypted(decrypted, indentLevel, tabSize);

        await editor.edit((b) => {
            b.replace(selection, formatted);
        });
        vscode.window.showInformationMessage('Inline text decrypted.');
    } else {
        const tabSize = Number(editor.options.tabSize) || 2;
        const indentLevel = getIndentLevel(editor, selection);
        const prepared = prepareForEncrypt(text, indentLevel, tabSize);

        const encrypted = await spawnVault(['encrypt_string', ...passwordArgs], prepared, cwd);

        const leadingSpaces = ' '.repeat((indentLevel + 1) * tabSize);
        const reindented = encrypted.trim().replace(/\n\s*/g, `\n${leadingSpaces}`);

        await editor.edit((b) => {
            b.replace(selection, reindented);
        });
        vscode.window.showInformationMessage('Inline text encrypted.');
    }
}

/**
 * Encrypt or decrypt the entire active file using ansible-vault file commands.
 * @param doc - Document to encrypt or decrypt on disk
 * @param passwordArgs - Resolved ansible-vault password arguments
 * @param cwd - Working directory passed to ansible-vault
 */
async function handleFile(
    doc: vscode.TextDocument,
    passwordArgs: string[],
    cwd: string | undefined,
): Promise<void> {
    const fileText = doc.getText();
    const filePath = doc.uri.fsPath;

    await doc.save();

    if (isEncryptedFile(fileText)) {
        await spawnVault(['decrypt', ...passwordArgs, filePath], undefined, cwd);
        vscode.window.showInformationMessage(`File decrypted: ${filePath}`);
    } else {
        await spawnVault(['encrypt', ...passwordArgs, filePath], undefined, cwd);
        vscode.window.showInformationMessage(`File encrypted: ${filePath}`);
    }

    await vscode.commands.executeCommand('workbench.action.files.revert');
}

// ---------------------------------------------------------------------------
// Indentation / multiline helpers
// ---------------------------------------------------------------------------

/**
 * Compute the YAML indentation level at the start of the selection.
 * @param editor - Active text editor used to read tab size and line text
 * @param selection - Selection whose starting line determines indentation
 * @returns Indentation level measured in tab stops
 */
function getIndentLevel(editor: vscode.TextEditor, selection: vscode.Selection): number {
    const tabSize = Number(editor.options.tabSize) || 2;
    const line = editor.document.lineAt(selection.start.line).text;
    const leading = /^\s*/.exec(line)?.[0]?.length ?? 0;
    return Math.floor(leading / tabSize);
}

/**
 * Normalize multiline YAML block content before encrypt_string processing.
 * @param text - Selected plaintext or block scalar content
 * @param indentLevel - Current YAML indentation level in tab stops
 * @param tabSize - Editor tab size used to compute leading spaces
 * @returns Text prepared for ansible-vault encrypt_string stdin
 */
function prepareForEncrypt(text: string, indentLevel: number, tabSize: number): string {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines.length <= 1) {
        return text;
    }

    const style = lines[0].charAt(0);
    const chomp = lines[0].charAt(1);
    const leadingSpaces = (indentLevel + 1) * tabSize;
    const re = new RegExp(`^\\s{${String(leadingSpaces)}}`, '');
    const body = lines.slice(1).map((l) => l.replace(re, ''));

    if (style === '>') {
        const folded = body.reduce((acc, cur, i) => {
            if (cur === '' || /^\s/.exec(cur) || /^\s/.exec(body[i - 1])) {
                return `${acc}\n${cur}`;
            }
            return acc.endsWith('\n') ? `${acc}${cur}` : `${acc} ${cur}`;
        });
        return applyChomp(folded, chomp);
    }

    // Literal style (|) or unknown
    const joined = body.join('\n');
    return applyChomp(joined, chomp);
}

/**
 * Apply YAML block chomping indicators to encrypted block scalar content.
 * @param text - Block body text after indentation normalization
 * @param chomp - Chomping indicator from the original block scalar header
 * @returns Text with trailing newlines adjusted for the chomp style
 */
function applyChomp(text: string, chomp: string): string {
    if (chomp === '-') {
        return text.replace(/\n*$/, '');
    }
    if (chomp === '+') {
        return `${text}\n`;
    }
    return text.replace(/\n*$/, '\n');
}

/**
 * Re-wrap decrypted plaintext as an indented YAML literal block scalar.
 * @param text - Decrypted plaintext returned by ansible-vault
 * @param indentLevel - YAML indentation level where the block should be inserted
 * @param tabSize - Editor tab size used to compute leading spaces
 * @returns YAML literal block scalar with appropriate chomping indicator
 */
function reindentDecrypted(text: string, indentLevel: number, tabSize: number): string {
    const lines = text.split('\n');
    if (lines.length <= 1) {
        return text;
    }

    let trailingNewlines = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i] === '') {
            trailingNewlines++;
        } else {
            break;
        }
    }

    const spaces = ' '.repeat((indentLevel + 1) * tabSize);
    const indented = lines.map((l) => `${spaces}${l}`).join('\n');

    if (trailingNewlines > 1) {
        return `|+\n${indented}`;
    }
    if (trailingNewlines === 0) {
        return `|-\n${indented}`;
    }
    return `|\n${indented}`;
}

/**
 * Register the vault toggle command.
 * @param context - Extension context used to register the command
 */
export function registerVaultCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('ansibleEnvironments.vault', toggleVaultEncrypt),
    );
}
