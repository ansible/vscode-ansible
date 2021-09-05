import * as vscode from 'vscode';
import * as fs from 'fs';
import untildify from 'untildify';
import * as ini from 'ini';

// Get rootPath based on multi-workspace API
export function getRootPath(editorDocumentUri: vscode.Uri): string | undefined {
  let rootPath: string | undefined = undefined;

  if (!!vscode.workspace.workspaceFolders) {
    rootPath = vscode.workspace.workspaceFolders.length
      ? vscode.workspace.workspaceFolders[0].name
      : undefined;
  }

  if (!!vscode.workspace.getWorkspaceFolder) {
    const workspaceFolder =
      vscode.workspace.getWorkspaceFolder(editorDocumentUri);

    if (!!workspaceFolder) {
      rootPath = workspaceFolder.uri.path;
    } else {
      // not under any workspace
      rootPath = undefined;
    }
  }

  return rootPath;
}

export type AnsibleVaultConfig = {
  defaults: {
    vault_identity_list: string;
  };
};

export function scanAnsibleCfg(
  rootPath: string | undefined = undefined
): string {
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

  for (let i = 0; i < cfgFiles.length; i++) {
    const cfgFile = cfgFiles[i];
    const cfgPath = untildify(cfgFile);

    const cfg = getValueByCfg(cfgPath);
    if (!!cfg && !!cfg.defaults && !!cfg.defaults.vault_identity_list) {
      console.log(`Found 'defaults.vault_identity_list' within '${cfgPath}'`);
      return cfgPath;
    }
  }

  console.log("Found no 'defaults.vault_identity_list' within config files");
  return '';
}

export function getValueByCfg(path: string): AnsibleVaultConfig | undefined {
  console.log(`Reading '${path}'...`);

  if (fs.existsSync(path)) {
    const parsed = ini.parse(fs.readFileSync(path, 'utf-8'));
    if (
      !!parsed &&
      !!parsed.defaults &&
      !!parsed.defaults.vault_identity_list
    ) {
      const cfg: AnsibleVaultConfig = {
        defaults: { vault_identity_list: parsed.defaults.vault_identity_list },
      };
      return cfg;
    }
  }

  return undefined;
}
