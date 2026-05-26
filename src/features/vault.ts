import * as cp from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { getCommandService } from "@ansible/core";
import {
  getVaultConfig,
  parseVaultIdentities,
  findProjectRoot,
} from "./ansibleCfg";

// ---------------------------------------------------------------------------
// FIFO-based password passing — password never touches disk
// ---------------------------------------------------------------------------

function fifoPath(): string {
  return path.join(
    os.tmpdir(),
    `ansible-vault-pw-${crypto.randomBytes(8).toString("hex")}`,
  );
}

/**
 * Create a FIFO and begin an async write of the password into it.
 * The write completes once ansible-vault opens the FIFO for reading,
 * so the caller must spawn ansible-vault after calling this.
 * The password only exists in memory (kernel pipe buffer) — never on disk.
 */
function createPasswordFifo(password: string): {
  fifo: string;
  cleanup: () => void;
} {
  const fifo = fifoPath();
  cp.execSync(`mkfifo -m 0600 "${fifo}"`);

  // createWriteStream opens the FIFO asynchronously — the underlying open()
  // blocks in the background until a reader (ansible-vault) connects. This
  // does NOT block the Node event loop.
  const stream = fs.createWriteStream(fifo);
  stream.write(password + "\n");
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

async function resolvePasswordArgs(
  projectRoot: string | undefined,
): Promise<string[] | undefined> {
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
        placeHolder: "Select vault identity",
      });
      if (!pick) {
        return undefined;
      }
      chosenId = pick;
    }
    return ["--encrypt-vault-id", chosenId];
  }

  if (cfg?.vaultPasswordFile) {
    return ["--vault-password-file", cfg.vaultPasswordFile];
  }

  // No config — prompt the user
  const password = await vscode.window.showInputBox({
    prompt: "Enter vault password",
    password: true,
    ignoreFocusOut: true,
  });

  if (!password) {
    return undefined;
  }

  const { fifo, cleanup } = createPasswordFifo(password);
  // Attach cleanup to the returned args so the caller can invoke it
  const args = ["--vault-password-file", fifo];
  (args as PasswordArgs).__cleanup = cleanup;
  return args;
}

interface PasswordArgs extends Array<string> {
  __cleanup?: () => void;
}

function cleanupArgs(args: string[] | undefined): void {
  if (args && (args as PasswordArgs).__cleanup) {
    (args as PasswordArgs).__cleanup!();
  }
}

// ---------------------------------------------------------------------------
// Spawn helper — runs ansible-vault with stdin piping
// ---------------------------------------------------------------------------

async function spawnVault(
  args: string[],
  stdin: string | undefined,
  cwd: string | undefined,
): Promise<string> {
  const commandService = getCommandService();
  const toolPath = await commandService.getToolPath("ansible-vault");
  if (!toolPath) {
    throw new Error(
      "ansible-vault not found. Install ansible-dev-tools first.",
    );
  }

  const binDir = (await commandService.getToolPath("ansible-vault"))
    ? path.dirname(toolPath)
    : undefined;
  const envPath = binDir
    ? `${binDir}${path.delimiter}${process.env.PATH}`
    : process.env.PATH;

  return new Promise<string>((resolve, reject) => {
    const child = cp.spawn(toolPath, args, {
      cwd: cwd || undefined,
      env: { ...process.env, PATH: envPath },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ansible-vault exited with ${code}`));
      } else {
        resolve(stdout);
      }
    });

    child.on("error", reject);

    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Encrypt / decrypt helpers
// ---------------------------------------------------------------------------

function isEncryptedInline(text: string): boolean {
  const stripped = text.replace("!vault |", "").trim();
  return stripped.startsWith("$ANSIBLE_VAULT;");
}

function isEncryptedFile(text: string): boolean {
  return text.startsWith("$ANSIBLE_VAULT;");
}

function stripInlineVaultPrefix(text: string): string {
  return text
    .replace("!vault |", "")
    .trim()
    .replace(/[^\S\r\n]+/gm, "");
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
  const projectRoot = findProjectRoot(
    path.dirname(doc.uri.fsPath),
    workspaceRoot,
  );

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
    vscode.window.showErrorMessage(`Vault operation failed: ${err}`);
  } finally {
    cleanupArgs(passwordArgs);
  }
}

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
      ["decrypt", ...passwordArgs, "--output", "-"],
      cleaned,
      cwd,
    );

    const tabSize = Number(editor.options.tabSize) || 2;
    const indentLevel = getIndentLevel(editor, selection);
    const formatted = reindentDecrypted(decrypted, indentLevel, tabSize);

    await editor.edit((b) => b.replace(selection, formatted));
    vscode.window.showInformationMessage("Inline text decrypted.");
  } else {
    const tabSize = Number(editor.options.tabSize) || 2;
    const indentLevel = getIndentLevel(editor, selection);
    const prepared = prepareForEncrypt(text, indentLevel, tabSize);

    const encrypted = await spawnVault(
      ["encrypt_string", ...passwordArgs],
      prepared,
      cwd,
    );

    const leadingSpaces = " ".repeat((indentLevel + 1) * tabSize);
    const reindented = encrypted
      .trim()
      .replace(/\n\s*/g, `\n${leadingSpaces}`);

    await editor.edit((b) => b.replace(selection, reindented));
    vscode.window.showInformationMessage("Inline text encrypted.");
  }
}

async function handleFile(
  doc: vscode.TextDocument,
  passwordArgs: string[],
  cwd: string | undefined,
): Promise<void> {
  const fileText = doc.getText();
  const filePath = doc.uri.fsPath;

  await doc.save();

  if (isEncryptedFile(fileText)) {
    await spawnVault(["decrypt", ...passwordArgs, filePath], undefined, cwd);
    vscode.window.showInformationMessage(`File decrypted: ${filePath}`);
  } else {
    await spawnVault(["encrypt", ...passwordArgs, filePath], undefined, cwd);
    vscode.window.showInformationMessage(`File encrypted: ${filePath}`);
  }

  await vscode.commands.executeCommand("workbench.action.files.revert");
}

// ---------------------------------------------------------------------------
// Indentation / multiline helpers
// ---------------------------------------------------------------------------

function getIndentLevel(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
): number {
  const tabSize = Number(editor.options.tabSize) || 2;
  const line = editor.document.lineAt(selection.start.line).text;
  const leading = line.match(/^\s*/)?.[0]?.length || 0;
  return Math.floor(leading / tabSize);
}

function prepareForEncrypt(
  text: string,
  indentLevel: number,
  tabSize: number,
): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length <= 1) {
    return text;
  }

  const style = lines[0].charAt(0);
  const chomp = lines[0].charAt(1);
  const leadingSpaces = (indentLevel + 1) * tabSize;
  const re = new RegExp(`^\\s{${leadingSpaces}}`, "");
  const body = lines.slice(1).map((l) => l.replace(re, ""));

  if (style === ">") {
    const folded = body.reduce((acc, cur, i) => {
      if (cur === "" || cur.match(/^\s/) || body[i - 1]?.match(/^\s/)) {
        return `${acc}\n${cur}`;
      }
      return acc.endsWith("\n") ? `${acc}${cur}` : `${acc} ${cur}`;
    });
    return applyChomp(folded, chomp);
  }

  // Literal style (|) or unknown
  const joined = body.join("\n");
  return applyChomp(joined, chomp);
}

function applyChomp(text: string, chomp: string): string {
  if (chomp === "-") {
    return text.replace(/\n*$/, "");
  }
  if (chomp === "+") {
    return `${text}\n`;
  }
  return text.replace(/\n*$/, "\n");
}

function reindentDecrypted(
  text: string,
  indentLevel: number,
  tabSize: number,
): string {
  const lines = text.split("\n");
  if (lines.length <= 1) {
    return text;
  }

  let trailingNewlines = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] === "") {
      trailingNewlines++;
    } else {
      break;
    }
  }

  const spaces = " ".repeat((indentLevel + 1) * tabSize);
  const indented = lines.map((l) => `${spaces}${l}`).join("\n");

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
 */
export function registerVaultCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansibleEnvironments.vault",
      toggleVaultEncrypt,
    ),
  );
}
