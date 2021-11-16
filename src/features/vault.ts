/* node "stdlib" */
import * as cp from 'child_process';
import * as util from 'util';

/* vscode"stdlib" */
import * as vscode from 'vscode';

/* local */
import * as utilAnsibleCfg from './utils/ansibleCfg';

const execAsync = util.promisify(cp.exec);

async function askForVaultId(ansibleCfg: utilAnsibleCfg.AnsibleVaultConfig) {
  const vaultId = 'default';

  const identityList = ansibleCfg.defaults?.vault_identity_list
    ?.split(',')
    .map((id: string) => id.split('@', 2)[0].trim());
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
    'no valid ansible vault config found, cannot de/-encrypt'
  );
}

function ansibleVaultPath(config: vscode.WorkspaceConfiguration): string {
  return `${config.ansible.path || 'ansible'  }-vault`
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

  const config = vscode.workspace.getConfiguration('ansible');
  const doc = editor.document;

  // Read `ansible.cfg` or environment variable
  const rootPath: string | undefined = utilAnsibleCfg.getRootPath(
    editor.document.uri
  );
  const ansibleConfig = await utilAnsibleCfg.getAnsibleCfg(rootPath);

  if (!ansibleConfig) {
    displayInvalidConfigError();
    return;
  }

  // Extract `ansible-vault` password

  console.log(`Getting vault keyfile from ${ansibleConfig.path}`);
  vscode.window.showInformationMessage(
    `Getting vault keyfile from ${ansibleConfig.path}`
  );

  const text = editor.document.getText(selection);

  const useVaultIDs = !!ansibleConfig.defaults.vault_identity_list;

  // Go encrypt / decrypt
  if (!!text) {
    const type = getInlineTextType(text);

    if (type === 'plaintext') {
      console.log('Encrypt selected text');

      const vaultId: string | undefined = useVaultIDs
        ? await askForVaultId(ansibleConfig)
        : undefined;
      if (useVaultIDs && !vaultId) {
        displayInvalidConfigError();
        return;
      }

      let encryptedText: string;
      try {
        encryptedText = await encryptInline(text, rootPath, vaultId, config);
      } catch (e) {
        vscode.window.showErrorMessage(`Inline encryption failed: ${e}`);
        return;
      }
      const leadingWhitespaces = ' '.repeat(
        (getIndentationLevel(editor, selection) + 1) *
          Number(editor.options.tabSize)
      );
      editor.edit((editBuilder) => {
        editBuilder.replace(
          selection,
          encryptedText.replace(/\n\s*/g, `\n${leadingWhitespaces}`)
        );
      });
    } else if (type === 'encrypted') {
      console.log('Decrypt selected text');
      let decryptedText: string;
      try {
        decryptedText = await decryptInline(text, rootPath, config);
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

    if (type === 'plaintext') {
      console.log('Encrypt entire file');
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
          `File encrypted: '${doc.fileName}'`
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `Encryption of ${doc.fileName} failed: ${e}`
        );
      }
    } else if (type === 'encrypted') {
      console.log('Decrypt entire file');
      vscode.window.activeTextEditor?.document.save();
      try {
        await decryptFile(doc.fileName, rootPath, config);
        vscode.window.showInformationMessage(
          `File decrypted: '${doc.fileName}'`
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `Decryption of ${doc.fileName} failed: ${e}`
        );
      }
    }
    vscode.commands.executeCommand('workbench.action.files.revert');
  }
};

// Returns whether the selected text is encrypted or in plain text.
const getInlineTextType = (text: string) => {
  if (text.trim().startsWith('!vault |')) {
    text = text.replace('!vault |', '');
  }

  return text.trim().startsWith('$ANSIBLE_VAULT;') ? 'encrypted' : 'plaintext';
};

// Returns wheter the file is encrypted or in plain text.
const getTextType = (text: string) => {
  return text.indexOf('$ANSIBLE_VAULT;') === 0 ? 'encrypted' : 'plaintext';
};

const encryptInline = async (
  text: string,
  rootPath: string | undefined,
  vaultId: string | undefined,
  config: vscode.WorkspaceConfiguration
) => {
  const encryptedText = await encryptText(text, rootPath, vaultId, config);
  console.debug(`encryptedText == '${encryptedText}'`);

  return encryptedText?.trim();
};

const decryptInline = (
  text: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration
) => {
  // Delete inline vault prefix, then trim spaces and newline from the entire string and, at last, trim the spaces in the multiline string.
  text = text
    .replace('!vault |', '')
    .trim()
    .replace(/[^\S\r\n]+/gm, '');

  return decryptText(text, rootPath, config);
};

const pipeTextThrougCmd = (
  text: string,
  rootPath: string | undefined,
  cmd: string
): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const child = !!rootPath ? cp.exec(cmd, { cwd: rootPath }) : cp.exec(cmd);
    child.stdout?.setEncoding('utf8');
    let outputText = '';
    let errorText = '';
    if (!child?.stdin || !child?.stdout || !child?.stderr) {
      return undefined;
    }

    child.stdout.on('data', (data) => (outputText += data));
    child.stderr.on('data', (data) => (errorText += data));

    child.on('close', (code) => {
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
  config: vscode.WorkspaceConfiguration
): Promise<string> => {
  const cmd = !!vaultId
    ? `${ansibleVaultPath(config)} encrypt_string --encrypt-vault-id="${vaultId}"`
    : `${ansibleVaultPath(config)} encrypt_string`;
  return pipeTextThrougCmd(text, rootPath, cmd);
};

const decryptText = (
  text: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration
): Promise<string> => {
  const cmd = `${ansibleVaultPath(config)} decrypt`;
  return pipeTextThrougCmd(text, rootPath, cmd);
};

const encryptFile = (
  f: string,
  rootPath: string | undefined,
  vaultId: string | undefined,
  config: vscode.WorkspaceConfiguration
) => {
  console.log(`Encrypt file: ${f}`);

  const cmd = !!vaultId
    ? `${ansibleVaultPath(config)} encrypt --encrypt-vault-id="${vaultId}" "${f}"`
    : `${ansibleVaultPath(config)} encrypt "${f}"`;

  return execCwd(cmd, rootPath);
};

const decryptFile = (
  f: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration
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
  selection: vscode.Selection
): number => {
  if (!editor.options.tabSize) {
    // according to VS code docs, tabSize is always defined when getting options of an editor
    throw new Error(
      'The `tabSize` option is not defined, this should never happen.'
    );
  }
  const startLine = editor.document.lineAt(selection.start.line).text;
  const indentationMatches = startLine.match(/^\s*/);
  const leadingWhitespaces = indentationMatches?.[0]?.length || 0;
  return leadingWhitespaces / Number(editor.options.tabSize);
};
