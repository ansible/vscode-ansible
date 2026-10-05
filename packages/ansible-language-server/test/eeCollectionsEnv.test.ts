import { afterEach, describe, expect, it } from "vitest";
import { setEeFixtureAnsibleCollectionPathEnv } from "@test/helper.js";

describe("setEeFixtureAnsibleCollectionPathEnv", () => {
  const originalCi = process.env.CI;
  const originalPrepend = process.env.ALS_EE_COLLECTIONS_PREPEND;
  const originalCollectionsPath = process.env.ANSIBLE_COLLECTIONS_PATH;

  afterEach(() => {
    process.env.CI = originalCi;
    process.env.ALS_EE_COLLECTIONS_PREPEND = originalPrepend;
    process.env.ANSIBLE_COLLECTIONS_PATH = originalCollectionsPath;
  });

  it("uses ALS_EE_COLLECTIONS_PREPEND when set", () => {
    process.env.ALS_EE_COLLECTIONS_PREPEND = "/opt/ansible/collections";
    setEeFixtureAnsibleCollectionPathEnv();
    expect(
      process.env.ANSIBLE_COLLECTIONS_PATH?.startsWith(
        "/opt/ansible/collections:",
      ),
    ).toBe(true);
  });

  it("prepends only /usr/share/ansible/collections on CI without override", () => {
    delete process.env.ALS_EE_COLLECTIONS_PREPEND;
    process.env.CI = "true";
    setEeFixtureAnsibleCollectionPathEnv();
    const path = process.env.ANSIBLE_COLLECTIONS_PATH ?? "";
    expect(path.startsWith("/usr/share/ansible/collections:")).toBe(true);
    expect(path).not.toContain("/home/runner/.ansible/collections");
  });

  it("prepends runner and usr-share paths when not on CI", () => {
    delete process.env.ALS_EE_COLLECTIONS_PREPEND;
    delete process.env.CI;
    setEeFixtureAnsibleCollectionPathEnv();
    const path = process.env.ANSIBLE_COLLECTIONS_PATH ?? "";
    expect(path.startsWith("/home/runner/.ansible/collections:")).toBe(true);
    expect(path).toContain("/usr/share/ansible/collections:");
  });
});
