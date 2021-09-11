import * as vscode from 'vscode';
import * as fs from 'fs';
import untildify from 'untildify';
import * as ini from 'ini';

// Get rootPath based on multi-workspace API
export function getRootPath(editorDocumentUri: vscode.Uri): string | undefined {
  let rootPath: string | undefined = undefined;

  if (!!vscode.workspace.workspaceFolders) {
    rootPath = vscode.workspace.workspaceFolders?.[0]?.name;
  }

  if (typeof vscode.workspace.getWorkspaceFolder === 'function') {
    const workspaceFolder =
      vscode.workspace.getWorkspaceFolder(editorDocumentUri);

    rootPath = workspaceFolder?.uri?.path;
  }

  return rootPath;
}

export type AnsibleVaultConfig = {
  defaults: {
    vault_identity_list: string;
  };
};

export async function scanAnsibleCfg(
  rootPath: string | undefined = undefined
): Promise<string | undefined> {
  /*
   * Reading order:
   * 1) ANSIBLE_CONFIG
   * 2) ansible.cfg (in current workspace)
   * 3) ~/.ansible.cfg
   * 4) /etc/ansible.cfg
   */
  const cfgFiles = ['~/.ansible.cfg', '/etc/ansible.cfg'];

  if (!!rootPath) {
    cfgFiles.unshift(`${rootPath}/ansible.cfg`);
  }

  if (!!process.env.ANSIBLE_CONFIG) {
    cfgFiles.unshift(process.env.ANSIBLE_CONFIG);
  }

  for (const cfgFile of cfgFiles) {
    const cfgPath = untildify(cfgFile);

    const cfg = await getValueByCfg(cfgPath);
    if (!!cfg?.defaults?.vault_identity_list) {
      console.log(`Found 'defaults.vault_identity_list' within '${cfgPath}'`);
      return cfgPath;
    }
  }

  console.log('Found no \'defaults.vault_identity_list\' within config files');
  return undefined;
}

export async function getValueByCfg(
  path: string
): Promise<AnsibleVaultConfig | undefined> {
  console.log(`Reading '${path}'...`);

  if (!fs.promises.access(path, fs.constants.R_OK)) {
    return undefined;
  }

  const vault_identity_list = ini.parse(await fs.promises.readFile(path, 'utf-8'))
    ?.defaults?.vault_identity_list;
  if (!vault_identity_list) {
    return undefined;
  }

  return {
    defaults: { vault_identity_list },
  } as AnsibleVaultConfig;
}
