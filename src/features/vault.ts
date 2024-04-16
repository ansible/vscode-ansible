/* node "stdlib" */
import * as cp from "child_process";
import * as util from "util";

/* vscode"stdlib" */
import * as vscode from "vscode";

/* local */
import * as utilAnsibleCfg from "./utils/ansibleCfg";

const execAsync = util.promisify(cp.exec);

enum MultilineStyle {
  Literal = "|",
  Folding = ">",
}

enum ChompingStyle {
  Strip = "-",
  Keep = "+",
}

async function askForVaultId(ansibleCfg: utilAnsibleCfg.AnsibleVaultConfig) {
  const vaultId = "default";

  const identityList = ansibleCfg.defaults?.vault_identity_list
    ?.split(",")
    .map((id: string) => id.split("@", 2)[0].trim());
  if (!identityList) {
    return undefined;
  }

  if (identityList.length === 1) {
    return identityList[0];
  }

  const chosenVault = await vscode.window.showQuickPick(identityList);
  return chosenVault || vaultId;
}

function displayInvalidConfigError(): void {
  vscode.window.showErrorMessage(
    "no valid ansible vault config found, cannot de/-encrypt",
  );
}

function ansibleVaultPath(config: vscode.WorkspaceConfiguration): string {
  const path = config.get("ansible.path");
  if (typeof path === "string") {
    return `${path || "ansible"}-vault`;
  }
  return "ansible-vault";
}

export const toggleEncrypt = async (): Promise<void> => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const selection = editor.selection;
  if (!selection) {
    return;
  }

  const config = vscode.workspace.getConfiguration("ansible");
  const doc = editor.document;

  // Read `ansible.cfg` or environment variable
  const rootPath: string | undefined = utilAnsibleCfg.getRootPath(
    editor.document.uri,
  );
  const ansibleConfig = await utilAnsibleCfg.getAnsibleCfg(rootPath);

  if (!ansibleConfig) {
    displayInvalidConfigError();
    return;
  }

  // Extract `ansible-vault` password

  console.log(`Getting vault keyfile from ${ansibleConfig.path}`);
  vscode.window.showInformationMessage(
    `Getting vault keyfile from ${ansibleConfig.path}`,
  );

  const text = editor.document.getText(selection);

  const useVaultIDs = !!ansibleConfig.defaults.vault_identity_list;

  // Go encrypt / decrypt
  if (text) {
    const type = getInlineTextType(text);
    const indentationLevel = getIndentationLevel(editor, selection);
    const tabSize = Number(editor.options.tabSize);
    if (type === "plaintext") {
      console.log("Encrypt selected text");

      const vaultId: string | undefined = useVaultIDs
        ? await askForVaultId(ansibleConfig)
        : undefined;
      if (useVaultIDs && !vaultId) {
        displayInvalidConfigError();
        return;
      }

      let encryptedText: string;
      try {
        encryptedText = await encryptInline(
          text,
          rootPath,
          vaultId,
          indentationLevel,
          tabSize,
          config,
        );
      } catch (e) {
        vscode.window.showErrorMessage(`Inline encryption failed: ${e}`);
        return;
      }
      const leadingSpaces = " ".repeat((indentationLevel + 1) * tabSize);
      editor.edit((editBuilder) => {
        editBuilder.replace(
          selection,
          encryptedText.replace(/\n\s*/g, `\n${leadingSpaces}`),
        );
      });
    } else if (type === "encrypted") {
      console.log("Decrypt selected text");
      let decryptedText: string;
      try {
        decryptedText = await decryptInline(
          text,
          rootPath,
          indentationLevel,
          tabSize, // tabSize is always defined
          config,
        );
      } catch (e) {
        vscode.window.showErrorMessage(`Inline decryption failed: ${e}`);
        return;
      }
      editor.edit((editBuilder) => {
        editBuilder.replace(selection, decryptedText);
      });
    }
  } else {
    const document = await vscode.workspace.openTextDocument(doc.fileName);
    const type = getTextType(document.getText());

    if (type === "plaintext") {
      console.log("Encrypt entire file");
      const vaultId: string | undefined = useVaultIDs
        ? await askForVaultId(ansibleConfig)
        : undefined;
      if (useVaultIDs && !vaultId) {
        displayInvalidConfigError();
        return;
      }
      vscode.window.activeTextEditor?.document.save();
      try {
        await encryptFile(doc.fileName, rootPath, vaultId, config);
        vscode.window.showInformationMessage(
          `File encrypted: '${doc.fileName}'`,
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `Encryption of ${doc.fileName} failed: ${e}`,
        );
      }
    } else if (type === "encrypted") {
      console.log("Decrypt entire file");
      vscode.window.activeTextEditor?.document.save();
      try {
        await decryptFile(doc.fileName, rootPath, config);
        vscode.window.showInformationMessage(
          `File decrypted: '${doc.fileName}'`,
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `Decryption of ${doc.fileName} failed: ${e}`,
        );
      }
    }
    vscode.commands.executeCommand("workbench.action.files.revert");
  }
};

// Returns whether the selected text is encrypted or in plain text.
const getInlineTextType = (text: string) => {
  if (text.trim().startsWith("!vault |")) {
    text = text.replace("!vault |", "");
  }

  return text.trim().startsWith("$ANSIBLE_VAULT;") ? "encrypted" : "plaintext";
};

// Returns whether the file is encrypted or in plain text.
const getTextType = (text: string) => {
  return text.indexOf("$ANSIBLE_VAULT;") === 0 ? "encrypted" : "plaintext";
};

const encryptInline = async (
  text: string,
  rootPath: string | undefined,
  vaultId: string | undefined,
  indentationLevel: number,
  tabSize = 0,
  config: vscode.WorkspaceConfiguration,
) => {
  const encryptedText = await encryptText(
    handleMultiline(text, indentationLevel, tabSize),
    rootPath,
    vaultId,
    config,
  );
  console.debug(`encryptedText == '${encryptedText}'`);

  return encryptedText?.trim();
};

const decryptInline = async (
  text: string,
  rootPath: string | undefined,
  indentationLevel: number,
  tabSize = 0,
  config: vscode.WorkspaceConfiguration,
) => {
  // Delete inline vault prefix, then trim spaces and newline from the entire string and, at last, trim the spaces in the multiline string.
  text = text
    .replace("!vault |", "")
    .trim()
    .replace(/[^\S\r\n]+/gm, "");

  const decryptedText = reindentText(
    await decryptText(text, rootPath, config),
    indentationLevel,
    tabSize,
  );
  return decryptedText;
};

const pipeTextThroughCmd = (
  text: string,
  rootPath: string | undefined,
  cmd: string,
): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const child = rootPath ? cp.exec(cmd, { cwd: rootPath }) : cp.exec(cmd);
    child.stdout?.setEncoding("utf8");
    let outputText = "";
    let errorText = "";
    if (!child?.stdin || !child?.stdout || !child?.stderr) {
      return undefined;
    }

    child.stdout.on("data", (data) => (outputText += data));
    child.stderr.on("data", (data) => (errorText += data));

    child.on("close", (code) => {
      if (code !== 0) {
        console.log(`error when running ansible-vault: ${errorText}`);
        reject(errorText);
      } else {
        resolve(outputText);
      }
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
};

const encryptText = (
  text: string,
  rootPath: string | undefined,
  vaultId: string | undefined,
  config: vscode.WorkspaceConfiguration,
): Promise<string> => {
  let cmd = `${ansibleVaultPath(config)} encrypt_string`;
  if (vaultId) {
    cmd += ` --encrypt-vault-id ${vaultId}`;
  }
  return pipeTextThroughCmd(text, rootPath, cmd);
};

const decryptText = (
  text: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration,
): Promise<string> => {
  const cmd = `${ansibleVaultPath(config)} decrypt`;
  return pipeTextThroughCmd(text, rootPath, cmd);
};

const encryptFile = (
  f: string,
  rootPath: string | undefined,
  vaultId: string | undefined,
  config: vscode.WorkspaceConfiguration,
) => {
  console.log(`Encrypt file: ${f}`);

  const cmd = vaultId
    ? `${ansibleVaultPath(
        config,
      )} encrypt --encrypt-vault-id="${vaultId}" "${f}"`
    : `${ansibleVaultPath(config)} encrypt "${f}"`;

  return execCwd(cmd, rootPath);
};

const decryptFile = (
  f: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration,
) => {
  console.log(`Decrypt file: ${f}`);

  const cmd = `${ansibleVaultPath(config)} decrypt "${f}"`;

  return execCwd(cmd, rootPath);
};

const exec = (cmd: string, opt = {}) => {
  console.log(`> ${cmd}`);
  return execAsync(cmd, opt);
};

const execCwd = (cmd: string, cwd: string | undefined) => {
  if (!cwd) {
    return exec(cmd);
  }
  return exec(cmd, { cwd: cwd });
};

const getIndentationLevel = (
  editor: vscode.TextEditor,
  selection: vscode.Selection,
): number => {
  if (!editor.options.tabSize) {
    // according to VS code docs, tabSize is always defined when getting options of an editor
    throw new Error(
      "The `tabSize` option is not defined, this should never happen.",
    );
  }
  const startLine = editor.document.lineAt(selection.start.line).text;
  const indentationMatches = startLine.match(/^\s*/);
  const leadingWhitespaces = indentationMatches?.[0]?.length || 0;
  return leadingWhitespaces / Number(editor.options.tabSize);
};

const foldedMultilineReducer = (
  accumulator: string,
  currentValue: string,
  currentIndex: number,
  array: string[],
): string => {
  if (
    currentValue === "" ||
    currentValue.match(/^\s/) ||
    array[currentIndex - 1].match(/^\s/)
  ) {
    return `${accumulator}\n${currentValue}`;
  }
  if (accumulator.charAt(accumulator.length - 1) !== "\n") {
    return `${accumulator} ${currentValue}`;
  }
  return `${accumulator}${currentValue}`;
};

const handleLiteralMultiline = (
  lines: string[],
  leadingSpacesCount: number,
) => {
  const text = prepareMultiline(lines, leadingSpacesCount).join("\n");
  const chompingStyle = getChompingStyle(lines);
  if (chompingStyle === ChompingStyle.Strip) {
    return text.replace(/\n*$/, "");
  } else if (chompingStyle === ChompingStyle.Keep) {
    return `${text}\n`;
  } else {
    return text.replace(/\n*$/, "\n");
  }
};

const handleFoldedMultiline = (lines: string[], leadingSpacesCount: number) => {
  const text = prepareMultiline(lines, leadingSpacesCount).reduce(
    foldedMultilineReducer,
  );
  const chompingStyle = getChompingStyle(lines);
  if (chompingStyle === ChompingStyle.Strip) {
    return text.replace(/\n*$/g, "");
  } else if (chompingStyle === ChompingStyle.Keep) {
    return `${text}\n`;
  } else {
    return `${text.replace(/\n$/gm, "")}\n`;
  }
};

const handleMultiline = (
  text: string,
  indentationLevel: number,
  tabSize: number,
) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 1) {
    const leadingSpacesCount = (indentationLevel + 1) * tabSize;
    const multilineStyle = getMultilineStyle(lines);
    if (multilineStyle === MultilineStyle.Literal) {
      return handleLiteralMultiline(lines, leadingSpacesCount);
    } else if (multilineStyle === MultilineStyle.Folding) {
      return handleFoldedMultiline(lines, leadingSpacesCount);
    } else {
      throw new Error("this type of multiline text is not supported");
    }
  }
  return text;
};

const reindentText = (
  text: string,
  indentationLevel: number,
  tabSize: number,
) => {
  const leadingSpacesCount = (indentationLevel + 1) * tabSize;
  const lines = text.split("\n");
  let trailingNewlines = 0;
  for (const line of lines.reverse()) {
    if (line === "") {
      trailingNewlines++;
    } else {
      break;
    }
  }
  lines.reverse();
  if (lines.length > 1) {
    const leadingWhitespaces = " ".repeat(leadingSpacesCount);
    const rejoinedLines = lines
      .map((line) => `${leadingWhitespaces}${line}`)
      .join("\n");
    rejoinedLines.replace(/\n$/, "");
    if (trailingNewlines > 1) {
      return `${MultilineStyle.Literal}${ChompingStyle.Keep}\n${rejoinedLines}`;
    } else if (trailingNewlines === 0) {
      return `${MultilineStyle.Literal}${ChompingStyle.Strip}\n${rejoinedLines}`;
    }
    return `${MultilineStyle.Literal}\n${rejoinedLines}`;
  }
  return text;
};

const prepareMultiline = (lines: string[], leadingSpacesCount: number) => {
  const re = new RegExp(`^\\s{${leadingSpacesCount}}`, "");
  return lines.slice(1, lines.length).map((line) => line.replace(re, ""));
};

function getMultilineStyle(lines: string[]) {
  return lines[0].charAt(0);
}

function getChompingStyle(lines: string[]) {
  return lines[0].charAt(1);
}
