import { expect } from "vitest";

/** True on GitHub Actions and other CI runners (not local dev). */
export function isPackagingCi(): boolean {
  return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

/**
 * When CI expects built ALS dist, fail instead of skipping tests.
 * VSIX checks are enforced by `task package` / smoke-als-vsix.mts, not unit.
 */
export function requirePathOnCi(exists: boolean, message: string): boolean {
  if (exists) {
    return true;
  }
  if (isPackagingCi()) {
    expect.fail(message);
  }
  return false;
}
