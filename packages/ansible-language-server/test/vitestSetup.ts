// This file is loaded automatically by vitest during the test run.
import { beforeAll, beforeEach } from "vitest";
import { deleteAlsCache, skipEE } from "@test/helper.js";

// Restore real HOME for ALS tests — ext globalSetup redirects HOME to
// out/home, but rootless podman needs the real HOME or @ee tests timeout.
if (process.env._ALS_ORIGINAL_HOME) {
  process.env.HOME = process.env._ALS_ORIGINAL_HOME;
  process.env.USERPROFILE = process.env._ALS_ORIGINAL_HOME;
}

// Delete cache once at the start of all tests (like Mocha's beforeAll)
beforeAll(() => {
  deleteAlsCache();
});

// Vitest hooks - runs before each test
beforeEach((context) => {
  // Skip tests marked with @ee if both SKIP_PODMAN and SKIP_DOCKER are set
  if (
    skipEE() &&
    (context.task?.name?.includes("@ee") ||
      context.task?.suite?.fullName?.includes("@ee"))
  ) {
    console.warn(
      `Skipped test due to environment conditions: ${context.task.name}`,
    );
    context.skip();
    return;
  }
});
