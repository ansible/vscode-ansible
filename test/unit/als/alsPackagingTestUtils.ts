import { expect } from "vitest";

/** True on GitHub Actions and other CI runners (not local dev). */
export function isPackagingCi(): boolean {
  return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

/**
 * When CI expects packaged artifacts, fail instead of skipping tests.
 * On Windows CI, VSIX is not built — use {@link requireVsixOnCi}.
 */
export function requirePathOnCi(
  exists: boolean,
  message: string,
  options?: { skipOnWindowsCi?: boolean },
): boolean {
  if (exists) {
    return true;
  }
  if (
    options?.skipOnWindowsCi &&
    process.platform === "win32" &&
    isPackagingCi()
  ) {
    return false;
  }
  if (isPackagingCi()) {
    expect.fail(message);
  }
  return false;
}

/** VSIX smoke runs in `task package` on Linux/macOS CI, not on Windows. */
export function requireVsixOnCi(exists: boolean, message: string): boolean {
  return requirePathOnCi(exists, message, { skipOnWindowsCi: true });
}
