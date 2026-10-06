import * as os from "node:os";

export const USR_SHARE_ANSIBLE_COLLECTIONS = "/usr/share/ansible/collections";

export function getUserAnsibleCollectionsPath(): string {
  const home = process.env.HOME || os.homedir();
  return `${home}/.ansible/collections`;
}

/** Prepend segment for ANSIBLE_COLLECTIONS_PATH before ALS fixture collections. */
export function getEeCollectionsPrependPath(): string {
  const override = process.env.ALS_EE_COLLECTIONS_PREPEND;
  if (override !== undefined && override !== "") {
    return override;
  }
  if (process.env.CI === "true") {
    // GHA when ALS_EE_COLLECTIONS_PREPEND is unset (Vitest als project sets it in vitest.config.ts).
    return USR_SHARE_ANSIBLE_COLLECTIONS;
  }
  return `${getUserAnsibleCollectionsPath()}:${USR_SHARE_ANSIBLE_COLLECTIONS}`;
}

export function restoreProcessEnv(
  key: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- restore unset env vars (Node 24 treats undefined assignment as "undefined")
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
