import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as ini from "ini";

export interface VaultConfig {
  /** Path to the ansible.cfg or env-var name that provided this config */
  source: string;
  vaultIdentityList: string | undefined;
  vaultPasswordFile: string | undefined;
}

function untildify(p: string): string {
  const home = os.homedir();
  return home ? p.replace(/^~(?=$|\/|\\)/, home) : p;
}

async function readCfg(cfgPath: string): Promise<VaultConfig | undefined> {
  const resolved = untildify(cfgPath);
  try {
    await fs.promises.access(resolved, fs.constants.R_OK);
  } catch {
    return undefined;
  }

  const parsed = ini.parse(await fs.promises.readFile(resolved, "utf-8"));
  const identityList = parsed.defaults?.vault_identity_list as
    | string
    | undefined;
  const passwordFile = parsed.defaults?.vault_password_file as
    | string
    | undefined;

  if (!identityList && !passwordFile) {
    return undefined;
  }

  return {
    source: resolved,
    vaultIdentityList: identityList,
    vaultPasswordFile: passwordFile,
  };
}

/**
 * Locate vault configuration following Ansible's precedence:
 *   1. ANSIBLE_VAULT_IDENTITY_LIST env var
 *   2. ANSIBLE_CONFIG env var
 *   3. ansible.cfg in the workspace/project root
 *   4. ~/.ansible.cfg
 *   5. /etc/ansible/ansible.cfg
 */
export async function getVaultConfig(
  workspaceRoot?: string,
): Promise<VaultConfig | undefined> {
  if (process.env.ANSIBLE_VAULT_IDENTITY_LIST) {
    return {
      source: "$ANSIBLE_VAULT_IDENTITY_LIST",
      vaultIdentityList: process.env.ANSIBLE_VAULT_IDENTITY_LIST,
      vaultPasswordFile: undefined,
    };
  }

  const candidates: string[] = [];
  if (process.env.ANSIBLE_CONFIG) {
    candidates.push(process.env.ANSIBLE_CONFIG);
  }
  if (workspaceRoot) {
    candidates.push(path.join(workspaceRoot, "ansible.cfg"));
  }
  candidates.push("~/.ansible.cfg", "/etc/ansible/ansible.cfg");

  for (const cfgPath of candidates) {
    const cfg = await readCfg(cfgPath);
    if (cfg) {
      return cfg;
    }
  }

  return undefined;
}

/**
 * Parse the vault_identity_list into individual identity labels.
 * Format: "id1@script1, id2@script2"
 */
export function parseVaultIdentities(
  identityList: string,
): string[] {
  return identityList
    .split(",")
    .map((entry) => entry.split("@", 2)[0].trim())
    .filter((id) => id.length > 0);
}

/**
 * Walk up from a document's directory looking for ansible.cfg, stopping at
 * the workspace root. Returns the directory containing ansible.cfg, or the
 * workspace root if none is found.
 */
export function findProjectRoot(
  documentDir: string,
  workspaceRoot: string | undefined,
): string | undefined {
  let current = documentDir;

  while (current !== workspaceRoot) {
    if (fs.existsSync(path.join(current, "ansible.cfg"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return workspaceRoot;
}
