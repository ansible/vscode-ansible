import { afterEach, describe, expect, it } from "vitest";
import {
  getEeCollectionsPrependPath,
  restoreProcessEnv,
} from "@test/eeCollectionsEnvUtils.js";

describe("eeCollectionsEnvUtils", () => {
  const envKey = "ALS_EE_UTILS_TEST_KEY";

  afterEach(() => {
    restoreProcessEnv(envKey, undefined);
  });

  it("restoreProcessEnv assigns when value was defined", () => {
    restoreProcessEnv(envKey, undefined);
    restoreProcessEnv(envKey, "set-me");
    expect(process.env[envKey]).toBe("set-me");
  });

  it("treats empty ALS_EE_COLLECTIONS_PREPEND as unset", () => {
    const originalPrepend = process.env.ALS_EE_COLLECTIONS_PREPEND;
    const originalCi = process.env.CI;
    try {
      process.env.ALS_EE_COLLECTIONS_PREPEND = "";
      process.env.CI = "true";
      expect(getEeCollectionsPrependPath()).toBe(
        "/usr/share/ansible/collections",
      );
    } finally {
      restoreProcessEnv("ALS_EE_COLLECTIONS_PREPEND", originalPrepend);
      restoreProcessEnv("CI", originalCi);
    }
  });
});
