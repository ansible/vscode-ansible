import { expect } from "vitest";

/** True on GitHub Actions and other CI runners (not local dev). */
export function isPackagingCi(): boolean {
  return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

/**
 * True when the GHA runner is Windows (including WSL, where
 * `process.platform` reports `linux` but `RUNNER_OS` is `Windows`).
 */
export function isWindowsRunner(): boolean {
  return process.platform === "win32" || process.env.RUNNER_OS === "Windows";
}

/**
 * When CI expects built ALS dist, fail instead of skipping tests.
 * VSIX checks are enforced by `task package` / smoke-als-vsix.mts, not unit.
 */
export function requirePathOnCi(exists: boolean, message: string): boolean {
  if (exists) {
    return true;
  }
  if (isPackagingCi() && !isWindowsRunner()) {
    expect.fail(message);
  }
  return false;
}
