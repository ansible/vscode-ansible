import * as vscode from 'vscode';
import * as utilAnsibleCfg from './utils/ansibleCfg';
import * as tmp from 'tmp-promise';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as util from 'util';

const execAsync = util.promisify(cp.exec);

async function askForVaultId(ansibleCfg: string) {
  const vaultId = 'default';
  let identitySource: string | undefined;

  if (ansibleCfg === 'ANSIBLE_VAULT_IDENTITY_LIST') {
    identitySource = process.env.ANSIBLE_VAULT_IDENTITY_LIST;
  } else {
    const cfg: utilAnsibleCfg.AnsibleVaultConfig | undefined =
      await utilAnsibleCfg.getValueByCfg(ansibleCfg);
    identitySource =
      typeof cfg === 'undefined' ? undefined : cfg.defaults.vault_identity_list;
  }

  if (!identitySource) {
    return undefined;
  }

  const identityList = identitySource
    .split(',')
    .map((id: string) => id.split('@', 2)[0].trim());
  if (!identityList.length) {
    return undefined;
  }

  const chosenVault = await vscode.window.showQuickPick(identityList);
  return chosenVault || vaultId;
}

function displayMissingIdentityError(): void {
  vscode.window.showErrorMessage(
    'no ansible vault identity defined, cannot de-/encrypt'
  );
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

  const config = vscode.workspace.getConfiguration('ansible.vault');
  const doc = editor.document;

  // Read `ansible.cfg` or environment variable
  const rootPath: string | undefined = utilAnsibleCfg.getRootPath(
    editor.document.uri
  );
  const keyInCfg: string | undefined = !!process.env.ANSIBLE_VAULT_IDENTITY_LIST
    ? 'ANSIBLE_VAULT_IDENTITY_LIST'
    : await utilAnsibleCfg.scanAnsibleCfg(rootPath);

  if (!keyInCfg) {
    displayMissingIdentityError();
    return;
  }

  // Extract `ansible-vault` password

  console.log(`Getting vault keyfile from ${keyInCfg}`);
  vscode.window.showInformationMessage(
    `Getting vault keyfile from ${keyInCfg}`
  );

  const text = editor.document.getText(selection);

  // Go encrypt / decrypt
  if (!!text) {
    const type = getInlineTextType(text);

    if (type === 'plaintext') {
      console.log('Encrypt selected text');
      const vaultId: string | undefined = await askForVaultId(keyInCfg);
      if (!vaultId) {
        displayMissingIdentityError();
        return;
      }

      const encryptedText = `!vault |\n${encryptInline(
        text,
        rootPath,
        vaultId,
        config
      )}`;
      editor.edit((editBuilder) => {
        editBuilder.replace(
          selection,
          encryptedText.replace(
            /\n/g,
            `\n${' '.repeat(selection.start.character)}`
          )
        );
      });
    } else if (type === 'encrypted') {
      console.log('Decrypt selected text');

      const decryptedText = await decryptInline(text, rootPath, config);
      editor.edit((editBuilder) => {
        editBuilder.replace(selection, decryptedText);
      });
    }
  } else {
    let content = '';
    await vscode.workspace.openTextDocument(doc.fileName).then((document) => {
      content = document.getText();
    });
    const type = getTextType(content);

    if (type === 'plaintext') {
      console.log('Encrypt entire file');
      const vaultId: string | undefined = await askForVaultId(keyInCfg);
      if (!vaultId) {
        displayMissingIdentityError();
        return;
      }
      encryptFile(doc.fileName, rootPath, vaultId, config);
      vscode.window.showInformationMessage(`File encrypted: '${doc.fileName}'`);
    } else if (type === 'encrypted') {
      console.log('Decrypt entire file');

      await decryptFile(doc.fileName, rootPath, config);
      vscode.window.showInformationMessage(`File decrypted: '${doc.fileName}'`);
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
  vaultId: string,
  config: vscode.WorkspaceConfiguration
) => {
  const tmpFilename = await tmp.tmpName();
  await fs.promises.writeFile(tmpFilename, Buffer.from(text, 'utf8'));
  console.log(`Wrote encrypted string to temporary file '${tmpFilename}'`);

  encryptFile(tmpFilename, rootPath, vaultId, config);
  const encryptedText = await fs.promises.readFile(tmpFilename, 'utf8');
  console.log(`encryptedText == '${encryptedText}'`);

  if (!!tmpFilename) {
    await fs.promises.unlink(tmpFilename);
    console.log(`Removed temporary file: '${tmpFilename}'`);
  }

  return encryptedText.trim();
};

const decryptInline = async (
  text: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration
) => {
  // Delete inline vault prefix, then trim spaces and newline from the entire string and, at last, trim the spaces in the multiline string.
  text = text
    .replace('!vault |', '')
    .trim()
    .replace(/[^\S\r\n]+/gm, '');

  const tmpFilename = await tmp.tmpName();
  await fs.promises.writeFile(tmpFilename, Buffer.from(text, 'utf8'));
  console.log(`Wrote encrypted string to temporary file '${tmpFilename}'`);

  await decryptFile(tmpFilename, rootPath, config);
  const decryptedText = await fs.promises.readFile(tmpFilename, 'utf8');
  console.log(`decryptedText == '${decryptedText}'`);

  if (!!tmpFilename) {
    await fs.promises.unlink(tmpFilename);
    console.log(`Removed temporary file: '${tmpFilename}'`);
  }

  return decryptedText;
};

const encryptFile = (
  f: string,
  rootPath: string | undefined,
  vaultId: string,
  config: vscode.WorkspaceConfiguration
) => {
  console.log(`Encrypt file: ${f}`);

  let cmd = `${config.executablePath} encrypt "${f}"`;
  cmd += ` --encrypt-vault-id="${vaultId}"`;

  if (!!rootPath) {
    exec(cmd, { cwd: rootPath });
  } else {
    exec(cmd);
  }
};

const decryptFile = async (
  f: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration
) => {
  console.log(`Decrypt file: ${f}`);

  const cmd = `${config.executablePath} decrypt "${f}"`;

  if (!!rootPath) {
    await exec(cmd, { cwd: rootPath });
  } else {
    await exec(cmd);
  }
};

const exec = async (cmd: string, opt = {}) => {
  console.log(`> ${cmd}`);
  return await execAsync(cmd, opt);
};
