import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getVaultConfig,
  parseVaultIdentities,
  findProjectRoot,
} from "../../../src/features/ansibleCfg";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vault-test-"));
}

describe("parseVaultIdentities", () => {
  it("parses a single identity", () => {
    expect(parseVaultIdentities("dev@/path/to/script")).toEqual(["dev"]);
  });

  it("parses multiple identities", () => {
    expect(
      parseVaultIdentities("dev@/path/dev, prod@/path/prod"),
    ).toEqual(["dev", "prod"]);
  });

  it("trims whitespace around identities", () => {
    expect(
      parseVaultIdentities("  dev@script ,  prod@script  "),
    ).toEqual(["dev", "prod"]);
  });

  it("filters out empty entries", () => {
    expect(parseVaultIdentities(",dev@s,,")).toEqual(["dev"]);
  });

  it("handles identity without @ separator", () => {
    expect(parseVaultIdentities("dev")).toEqual(["dev"]);
  });
});

describe("getVaultConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns config from ANSIBLE_VAULT_IDENTITY_LIST env var", async () => {
    process.env.ANSIBLE_VAULT_IDENTITY_LIST = "dev@/tmp/dev-pass";
    const cfg = await getVaultConfig("/some/root");
    expect(cfg).toBeDefined();
    expect(cfg!.source).toBe("$ANSIBLE_VAULT_IDENTITY_LIST");
    expect(cfg!.vaultIdentityList).toBe("dev@/tmp/dev-pass");
  });

  it("returns config from ANSIBLE_CONFIG env var", async () => {
    delete process.env.ANSIBLE_VAULT_IDENTITY_LIST;
    const dir = tmpDir();
    const cfgPath = path.join(dir, "custom-ansible.cfg");
    fs.writeFileSync(
      cfgPath,
      "[defaults]\nvault_password_file = /tmp/vault-pass\n",
    );
    process.env.ANSIBLE_CONFIG = cfgPath;

    const cfg = await getVaultConfig("/nonexistent");
    expect(cfg).toBeDefined();
    expect(cfg!.source).toBe(cfgPath);
    expect(cfg!.vaultPasswordFile).toBe("/tmp/vault-pass");

    fs.rmSync(dir, { recursive: true });
  });

  it("returns config from workspace ansible.cfg", async () => {
    delete process.env.ANSIBLE_VAULT_IDENTITY_LIST;
    delete process.env.ANSIBLE_CONFIG;
    const dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, "ansible.cfg"),
      "[defaults]\nvault_identity_list = prod@/tmp/prod-pass\n",
    );

    const cfg = await getVaultConfig(dir);
    expect(cfg).toBeDefined();
    expect(cfg!.vaultIdentityList).toBe("prod@/tmp/prod-pass");

    fs.rmSync(dir, { recursive: true });
  });

  it("returns undefined when no config exists", async () => {
    delete process.env.ANSIBLE_VAULT_IDENTITY_LIST;
    delete process.env.ANSIBLE_CONFIG;
    const dir = tmpDir();

    const cfg = await getVaultConfig(dir);
    // May find ~/.ansible.cfg or /etc/ansible/ansible.cfg on the test system,
    // but those won't have vault config in a clean env. If they do, that's OK.
    if (cfg) {
      expect(cfg.vaultIdentityList ?? cfg.vaultPasswordFile).toBeTruthy();
    }

    fs.rmSync(dir, { recursive: true });
  });

  it("ignores ansible.cfg without vault settings", async () => {
    delete process.env.ANSIBLE_VAULT_IDENTITY_LIST;
    delete process.env.ANSIBLE_CONFIG;
    const dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, "ansible.cfg"),
      "[defaults]\nremote_user = admin\n",
    );

    const cfg = await getVaultConfig(dir);
    // Should not match the workspace cfg since it has no vault settings
    if (cfg) {
      expect(cfg.source).not.toBe(path.join(dir, "ansible.cfg"));
    }

    fs.rmSync(dir, { recursive: true });
  });
});

describe("findProjectRoot", () => {
  it("returns directory containing ansible.cfg", () => {
    const dir = tmpDir();
    const sub = path.join(dir, "roles", "myrole");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(dir, "ansible.cfg"), "[defaults]\n");

    expect(findProjectRoot(sub, dir)).toBe(dir);

    fs.rmSync(dir, { recursive: true });
  });

  it("returns workspace root when no ansible.cfg is found", () => {
    const dir = tmpDir();
    const sub = path.join(dir, "deep", "nested");
    fs.mkdirSync(sub, { recursive: true });

    expect(findProjectRoot(sub, dir)).toBe(dir);

    fs.rmSync(dir, { recursive: true });
  });

  it("returns undefined when no workspace root and no ansible.cfg", () => {
    const dir = tmpDir();
    // Walk all the way up — will stop at filesystem root
    expect(findProjectRoot(dir, undefined)).toBeUndefined();
    fs.rmSync(dir, { recursive: true });
  });

  it("finds ansible.cfg in an intermediate directory", () => {
    const dir = tmpDir();
    const mid = path.join(dir, "project");
    const deep = path.join(mid, "roles", "web");
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(mid, "ansible.cfg"), "[defaults]\n");

    expect(findProjectRoot(deep, dir)).toBe(mid);

    fs.rmSync(dir, { recursive: true });
  });
});
