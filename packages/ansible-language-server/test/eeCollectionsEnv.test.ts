import * as os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { setEeFixtureAnsibleCollectionPathEnv } from "@test/helper.js";
import {
  getUserAnsibleCollectionsPath,
  restoreProcessEnv,
  USR_SHARE_ANSIBLE_COLLECTIONS,
} from "@test/eeCollectionsEnvUtils.js";

describe("setEeFixtureAnsibleCollectionPathEnv", () => {
  const originalCi = process.env.CI;
  const originalPrepend = process.env.ALS_EE_COLLECTIONS_PREPEND;
  const originalCollectionsPath = process.env.ANSIBLE_COLLECTIONS_PATH;

  afterEach(() => {
    restoreProcessEnv("CI", originalCi);
    restoreProcessEnv("ALS_EE_COLLECTIONS_PREPEND", originalPrepend);
    restoreProcessEnv("ANSIBLE_COLLECTIONS_PATH", originalCollectionsPath);
  });

  it("uses ALS_EE_COLLECTIONS_PREPEND when set", () => {
    process.env.ALS_EE_COLLECTIONS_PREPEND = "/opt/ansible/collections";
    setEeFixtureAnsibleCollectionPathEnv();
    expect(
      process.env.ANSIBLE_COLLECTIONS_PATH?.startsWith(
        "/opt/ansible/collections:",
      ),
    ).toBe(true);
    expect(process.env.ANSIBLE_COLLECTIONS_PATH).toContain(
      "common/collections",
    );
  });

  it("prepends only /usr/share/ansible/collections on CI without override", () => {
    delete process.env.ALS_EE_COLLECTIONS_PREPEND;
    process.env.CI = "true";
    setEeFixtureAnsibleCollectionPathEnv();
    const path = process.env.ANSIBLE_COLLECTIONS_PATH ?? "";
    expect(path.startsWith("/usr/share/ansible/collections:")).toBe(true);
    expect(path).not.toContain("/home/runner/.ansible/collections");
    expect(path).toContain("common/collections");
  });

  it("prepends user collections and usr-share paths when not on CI", () => {
    delete process.env.ALS_EE_COLLECTIONS_PREPEND;
    delete process.env.CI;
    setEeFixtureAnsibleCollectionPathEnv();
    const path = process.env.ANSIBLE_COLLECTIONS_PATH ?? "";
    const userCollections = getUserAnsibleCollectionsPath();
    expect(path.startsWith(`${userCollections}:`)).toBe(true);
    expect(path).toContain(`${USR_SHARE_ANSIBLE_COLLECTIONS}:`);
    expect(path).toContain("common/collections");
  });
});

describe("getUserAnsibleCollectionsPath", () => {
  it("derives path from HOME", () => {
    const home = process.env.HOME || os.homedir();
    expect(getUserAnsibleCollectionsPath()).toBe(
      `${home}/.ansible/collections`,
    );
  });
});
