/* node "stdlib" */
import * as cp from 'child_process';
import * as util from 'util';

/* vscode"stdlib" */
import * as vscode from 'vscode';

/* local */
import * as utilAnsibleCfg from './utils/ansibleCfg';

const execAsync = util.promisify(cp.exec);

async function askForVaultId(ansibleCfg: string) {
  const vaultId = 'default';
  let identitySource: string | undefined;

  if (ansibleCfg === 'ANSIBLE_VAULT_IDENTITY_LIST') {
    identitySource = process.env.ANSIBLE_VAULT_IDENTITY_LIST;
  } else {
    const cfg: utilAnsibleCfg.AnsibleVaultConfig | undefined =
      await utilAnsibleCfg.getValueByCfg(ansibleCfg);
    identitySource = cfg?.defaults?.vault_identity_list;
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

      const encryptedText = `${await encryptInline(
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
      if (!!decryptedText) {
        editor.edit((editBuilder) => {
          editBuilder.replace(selection, decryptedText);
        });
      }
    }
  } else {
    const document = await vscode.workspace.openTextDocument(doc.fileName);
    const type = getTextType(document.getText());

    if (type === 'plaintext') {
      console.log('Encrypt entire file');
      const vaultId: string | undefined = await askForVaultId(keyInCfg);
      if (!vaultId) {
        displayMissingIdentityError();
        return;
      }
      vscode.window.activeTextEditor?.document.save();
      await encryptFile(doc.fileName, rootPath, vaultId, config);
      vscode.window.showInformationMessage(`File encrypted: '${doc.fileName}'`);
    } else if (type === 'encrypted') {
      console.log('Decrypt entire file');
      vscode.window.activeTextEditor?.document.save();
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
): Promise<string | undefined> => {
  return new Promise<string | undefined>((resolve, reject) => {
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
        reject();
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
  vaultId: string,
  config: vscode.WorkspaceConfiguration
): Promise<string | undefined> => {
  const cmd = `${config.executablePath} encrypt_string --encrypt-vault-id="${vaultId}"`;
  return pipeTextThrougCmd(text, rootPath, cmd);
};

const decryptText = (
  text: string,
  rootPath: string | undefined,
  config: vscode.WorkspaceConfiguration
): Promise<string | undefined> => {
  const cmd = `${config.executablePath} decrypt`;
  return pipeTextThrougCmd(text, rootPath, cmd);
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
