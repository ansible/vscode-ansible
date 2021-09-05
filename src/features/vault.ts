import * as vscode from 'vscode';
import * as utilAnsibleCfg from './utils/ansibleCfg';
import * as tmp from 'tmp';
import * as cp from 'child_process';
import * as fs from 'fs';

async function askForVaultId(ansibleCfg: string) {
  let vaultId = 'default';
  let identityList: string[] | undefined;
  if (ansibleCfg === 'ANSIBLE_VAULT_IDENTITY_LIST') {
    const envVar: string | undefined = process.env.ANSIBLE_VAULT_IDENTITY_LIST;
    if (envVar !== undefined) {
      identityList = envVar
        .split(',')
        .map((id: string) => id.split('@', 2)[0].trim());
    } else {
      identityList = [];
    }
  } else {
    const cfg: utilAnsibleCfg.AnsibleVaultConfig | undefined =
      utilAnsibleCfg.getValueByCfg(ansibleCfg);
    if (cfg !== undefined) {
      identityList = cfg.defaults.vault_identity_list
        .split(',')
        .map((id: string) => id.split('@', 2)[0].trim());
    } else {
      identityList = [];
    }
  }
  await vscode.window.showQuickPick(identityList).then((chosen) => {
    if (chosen) {
      vaultId = chosen;
    }
  });
  return vaultId;
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
  let keyInCfg: string;
  if (!!process.env.ANSIBLE_VAULT_IDENTITY_LIST) {
    keyInCfg = 'ANSIBLE_VAULT_IDENTITY_LIST';
  } else {
    keyInCfg = utilAnsibleCfg.scanAnsibleCfg(rootPath);
  }

  // Extract `ansible-vault` password
  if (!!keyInCfg) {
    console.log(`Getting vault keyfile from ${keyInCfg}`);
    vscode.window.showInformationMessage(
      `Getting vault keyfile from ${keyInCfg}`
    );
  } else {
    console.log('Found nothing from config files');
  }

  const text = editor.document.getText(selection);

  // Go encrypt / decrypt
  if (!!text) {
    const type = getInlineTextType(text);

    if (type === 'plaintext') {
      console.log('Encrypt selected text');
      const vaultId: string = await askForVaultId(keyInCfg);
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

      const decryptedText = decryptInline(text, rootPath, config);
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
      const vaultId: string = await askForVaultId(keyInCfg);
      encryptFile(doc.fileName, rootPath, vaultId, config);
      vscode.window.showInformationMessage(`File encrypted: '${doc.fileName}'`);
    } else if (type === 'encrypted') {
      console.log('Decrypt entire file');

      decryptFile(doc.fileName, rootPath, config);
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

const encryptInline = (
  text: string,
  rootPath: string | undefined,
  vaultId: string,
  config: vscode.WorkspaceConfiguration
) => {
  const tmpFilename = tmp.tmpNameSync();
  fs.writeFileSync(tmpFilename, Buffer.from(text, 'utf8'));
  console.log(`Wrote encrypted string to temporary file '${tmpFilename}'`);

  encryptFile(tmpFilename, rootPath, vaultId, config);
  const encryptedText = fs.readFileSync(tmpFilename, 'utf8');
  console.log(`encryptedText == '${encryptedText}'`);

  if (!!tmpFilename) {
    fs.unlinkSync(tmpFilename);
    console.log(`Removed temporary file: '${tmpFilename}'`);
  }

  return encryptedText.trim();
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

  const tmpFilename = tmp.tmpNameSync();
  fs.writeFileSync(tmpFilename, Buffer.from(text, 'utf8'));
  console.log(`Wrote encrypted string to temporary file '${tmpFilename}'`);

  decryptFile(tmpFilename, rootPath, config);
  const decryptedText = fs.readFileSync(tmpFilename, 'utf8');
  console.log(`decryptedText == '${decryptedText}'`);

  if (!!tmpFilename) {
    fs.unlinkSync(tmpFilename);
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

const decryptFile = (
  f: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration
) => {
  console.log(`Decrypt file: ${f}`);

  const cmd = `${config.executablePath} decrypt "${f}"`;

  if (!!rootPath) {
    exec(cmd, { cwd: rootPath });
  } else {
    exec(cmd);
  }
};

const exec = (cmd: string, opt = {}) => {
  console.log(`> ${cmd}`);
  return cp.execSync(cmd, opt);
};
