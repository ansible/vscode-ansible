import * as vscode from 'vscode';
import * as fs from 'fs';
import untildify from 'untildify';
import * as ini from 'ini';

// Get rootPath based on multi-workspace API
export function getRootPath(editorDocumentUri: vscode.Uri): string | undefined {
  if (typeof vscode.workspace.getWorkspaceFolder !== 'function') {
      return vscode.workspace.workspaceFolders?.[0]?.name;
  }

  return vscode.workspace.getWorkspaceFolder(editorDocumentUri)?.uri?.path;
}

export type AnsibleVaultConfig = {
  path: string,
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

  const cfgPath = cfgFiles
    .map((cf) => untildify(cf))
    .map(async (cp) => await getValueByCfg(cp))
    .find(cfg => cfg.then((x) => !!x?.defaults?.vault_identity_list))
    ?.then((x) => x?.path);

  console.log(
    typeof cfgPath != 'undefined'
    ? `Found 'defaults.vault_identity_list' within '${cfgPath}'`
    : "Found no 'defaults.vault_identity_list' within config files"
  );

  return cfgPath;
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
    path: path ,
    defaults: { vault_identity_list },
  } as AnsibleVaultConfig;
}
