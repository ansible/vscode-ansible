// This file is loaded automatically by vitest during the test run.
import { beforeEach } from "vitest";
import { deleteAlsCache, skipEE } from "./helper";

// Vitest hooks - runs before each test file
beforeEach((context) => {
  // Skip tests marked with @ee if both SKIP_PODMAN and SKIP_DOCKER are set
  if (skipEE() && (context.task?.name?.includes("@ee") || context.task?.suite?.fullName?.includes("@ee"))) {
    console.warn(
      `Skipped test due to environment conditions: ${context.task.name}`,
    );
      context.skip();
      return;
  }
  // Delete cache before each test file to ensure clean state
  deleteAlsCache();
});
