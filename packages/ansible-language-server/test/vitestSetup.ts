// This file is loaded automatically by vitest during the test run.
import { beforeAll, beforeEach } from "vitest";
import { deleteAlsCache, skipEE } from "./helper.js";

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
